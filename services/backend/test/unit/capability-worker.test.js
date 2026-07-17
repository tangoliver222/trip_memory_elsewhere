import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createOcrCapabilityWorker } from '../../src/capabilities/worker.js';
import { makeCapabilityIdentity } from '../../src/capabilities/identity.js';
import { normalizeDocumentAiOcr } from '../../src/capabilities/ocr-normalizer.js';
import { retryableProcessingError } from '../../src/processing/errors.js';
import {
  makeCapabilityArtifactRef,
  makeOcrCapabilityResult,
} from '../fixtures/capabilities.js';
import { makeRoutableFragment, ROUTING_SOURCE_REVISION } from '../fixtures/routing.js';

const NOW = '2026-07-17T13:30:00.000Z';
const LEASE_OWNER = 'delivery_12345678';
const IDENTITY = makeCapabilityIdentity({
  ownerId: 'user_alpha',
  fragmentId: 'frag_12345678',
  sourceRevision: ROUTING_SOURCE_REVISION,
  routePlanRevision: 1,
  capability: 'ocr',
  provider: 'document-ai-enterprise-ocr',
  providerVersion: 'fake-processor-v1',
});
const TASK = Object.freeze({
  capabilityExecutionId: IDENTITY.executionId,
  ownerId: 'user_alpha',
  routePlanId: 'route_12345678',
  routePlanRevision: 1,
  taskDeliveryCount: 2,
});
const AUTHORIZATION = Object.freeze({
  executionId: TASK.capabilityExecutionId,
  routePlanId: TASK.routePlanId,
  routePlanRevision: TASK.routePlanRevision,
  fragmentId: 'frag_12345678',
  capability: 'ocr',
  executorName: 'document-ocr',
  executorVersion: 'v1',
  providerName: 'document-ai-enterprise-ocr',
  providerVersion: 'fake-processor-v1',
  idempotencyKey: IDENTITY.idempotencyKey,
  ceilingMicros: 1_500,
});
const SUPPORTED_VERSIONS = Object.freeze({
  router: ['v1'],
  policy: ['v2'],
  costModel: ['v2'],
  executors: { 'document-ocr': ['v1'] },
  providers: { 'document-ai-enterprise-ocr': ['fake-processor-v1'] },
});
const PROVIDER_METADATA = Object.freeze({
  endpointRegion: 'us',
  pricingVersion: 'document-ai-enterprise-ocr-2026-07-17',
  processorAuditId: 'processoraudit_12345678',
  unitCostMicros: 1_500,
});
const DOCUMENT = JSON.parse(await readFile(
  new URL('../fixtures/document-ai/one-page-response.json', import.meta.url),
  'utf8',
));
const EMPTY_DOCUMENT = Object.freeze({
  text: '',
  pages: [{
    pageNumber: 1,
    dimension: { width: 1_200, height: 800, unit: 'pixel' },
    layout: {
      textAnchor: { textSegments: [{ startIndex: '0', endIndex: '0' }] },
      confidence: 0,
    },
    blocks: [],
    paragraphs: [],
    lines: [],
    tokens: [],
    detectedLanguages: [],
    imageQualityScores: { qualityScore: 0, detectedDefects: [] },
  }],
});

function claimWork(overrides = {}) {
  const fragment = makeRoutableFragment();
  return {
    executionState: 'claimed',
    sourceRevision: ROUTING_SOURCE_REVISION,
    storageFacts: fragment.storage,
    ocrInput: {
      format: fragment.technicalMetadata.format,
      mimeType: fragment.storage.contentType,
      sizeBytes: fragment.storage.sizeBytes,
      width: fragment.technicalMetadata.width,
      height: fragment.technicalMetadata.height,
    },
    result: null,
    ...overrides,
  };
}

function artifactRef(kind) {
  return makeCapabilityArtifactRef({
    kind,
    objectName: `users/user_alpha/capability-results/${IDENTITY.executionId}/${kind}.json.gz`,
  });
}

function resumableResult(overrides = {}) {
  return makeOcrCapabilityResult({
    id: IDENTITY.resultId,
    executionRef: { type: 'capabilityExecution', id: IDENTITY.executionId },
    sourceRevision: ROUTING_SOURCE_REVISION,
    providerArtifactRef: artifactRef('provider'),
    normalizedArtifactRef: artifactRef('normalized'),
    ...overrides,
  });
}

function harness(options = {}) {
  const order = [];
  const calls = {
    provider: 0,
    materialize: 0,
    cleanup: 0,
    fail: [],
    uncertain: [],
    results: [],
    escalations: [],
  };
  const work = options.work ?? claimWork();
  const repository = {
    async claimCapabilityExecution() {
      order.push('claim');
      if (options.claimError) throw options.claimError;
      return { outcome: 'claimed', authorization: options.authorization ?? AUTHORIZATION, work };
    },
    async markCapabilityCalling() {
      order.push('markCalling');
      if (options.markCallingError) throw options.markCallingError;
      return { outcome: 'applied' };
    },
    async recordCapabilityResult(_uid, input) {
      order.push('recordResult');
      calls.results.push(input);
      if (options.recordResultError) throw options.recordResultError;
      return { outcome: 'applied' };
    },
    async settleCapabilityExecution() {
      order.push('settle');
      if (options.settleError) throw options.settleError;
      return { outcome: 'applied' };
    },
    async failCapabilityExecution(_uid, input) {
      order.push('fail');
      calls.fail.push(input);
      return { outcome: 'applied' };
    },
    async markCapabilityBillingUncertain(_uid, input) {
      order.push('markBillingUncertain');
      calls.uncertain.push(input);
      return { outcome: 'applied' };
    },
    async submitEscalationRequest(_uid, input) {
      order.push('escalation');
      calls.escalations.push(input);
      if (options.escalationError) throw options.escalationError;
      return { outcome: 'created', request: input };
    },
  };
  const materializer = {
    async materialize() {
      order.push('materialize');
      calls.materialize += 1;
      if (options.materializeError) throw options.materializeError;
      return {
        path: '/tmp/bounded-source',
        sizeBytes: work.ocrInput.sizeBytes,
        inputHash: work.sourceRevision.inputHash,
        async cleanup() {
          order.push('cleanup');
          calls.cleanup += 1;
        },
      };
    },
  };
  const ocrProvider = {
    async process() {
      order.push('provider');
      calls.provider += 1;
      if (options.providerError) throw options.providerError;
      return {
        document: structuredClone(options.document ?? DOCUMENT),
        providerRequestId: 'provider-request-123',
      };
    },
  };
  const artifactStore = {
    async putProviderArtifact() {
      order.push('providerArtifact');
      if (options.providerArtifactError) throw options.providerArtifactError;
      return artifactRef('provider');
    },
    async putNormalizedArtifact() {
      order.push('normalizedArtifact');
      if (options.normalizedArtifactError) throw options.normalizedArtifactError;
      return artifactRef('normalized');
    },
  };
  const normalizer = (input) => {
    order.push('normalize');
    return normalizeDocumentAiOcr(input);
  };
  const worker = createOcrCapabilityWorker({
    repository,
    materializer,
    ocrProvider,
    artifactStore,
    normalizer,
    clock: () => NOW,
    leaseOwnerFactory: () => LEASE_OWNER,
    supportedVersions: SUPPORTED_VERSIONS,
    providerMetadata: PROVIDER_METADATA,
  });
  return { worker, order, calls };
}

test('executes one authorized OCR call in strict persistence order', async () => {
  const { worker, order, calls } = harness();
  assert.deepEqual(await worker.handle(TASK), { outcome: 'completed', retryable: false });
  assert.deepEqual(order, [
    'claim', 'materialize', 'markCalling', 'provider',
    'providerArtifact', 'normalize', 'normalizedArtifact',
    'recordResult', 'settle', 'cleanup',
  ]);
  assert.equal(calls.provider, 1);
  assert.equal(calls.cleanup, 1);
  assert.equal(calls.results[0].receipt.taskDeliveryCount, TASK.taskDeliveryCount);
  assert.equal(calls.results[0].result.outcome, 'completed');
  assert.equal(calls.results[0].result.processorAuditId, PROVIDER_METADATA.processorAuditId);
});

test('stale authority is a terminal no-op before materialization or provider use', async () => {
  const stale = Object.assign(new Error('private route detail'), {
    code: 'repository/routing-target-mismatch',
  });
  const { worker, order, calls } = harness({ claimError: stale });
  assert.deepEqual(await worker.handle(TASK), { outcome: 'terminal_noop', retryable: false });
  assert.deepEqual(order, ['claim']);
  assert.equal(calls.materialize, 0);
  assert.equal(calls.provider, 0);
});

test('provider-succeeded redelivery resumes escalation and settlement without another call', async () => {
  const result = resumableResult({ outcome: 'insufficient_input' });
  const { worker, order, calls } = harness({
    work: claimWork({ executionState: 'provider_succeeded', result }),
  });
  assert.deepEqual(await worker.handle(TASK), {
    outcome: 'insufficient_input', retryable: false,
  });
  assert.deepEqual(order, ['claim', 'escalation', 'settle']);
  assert.equal(calls.materialize, 0);
  assert.equal(calls.provider, 0);
  assert.deepEqual(calls.escalations[0].producedFactRefs, [
    { type: 'capabilityResult', id: result.id },
  ]);
});

test('pre-call storage failure is retryable and retains the reservation', async () => {
  const { worker, order, calls } = harness({
    materializeError: retryableProcessingError('processing/storage-unavailable'),
  });
  assert.deepEqual(await worker.handle(TASK), {
    outcome: 'failed_retryable', retryable: true,
  });
  assert.deepEqual(order, ['claim', 'materialize', 'fail']);
  assert.equal(calls.provider, 0);
  assert.equal(calls.fail[0].outcome, 'failed_retryable');
});

test('provider rejection after invocation becomes non-retryable billing uncertainty', async () => {
  const { worker, order, calls } = harness({ providerError: new Error('private provider data') });
  assert.deepEqual(await worker.handle(TASK), {
    outcome: 'billing_uncertain', retryable: false,
  });
  assert.deepEqual(order, [
    'claim', 'materialize', 'markCalling', 'provider', 'markBillingUncertain', 'cleanup',
  ]);
  assert.equal(calls.provider, 1);
  assert.equal(calls.cleanup, 1);
  assert.equal(calls.results.length, 0);
});

test('empty OCR persists evidence before requesting controlled escalation', async () => {
  const { worker, order, calls } = harness({ document: EMPTY_DOCUMENT });
  assert.deepEqual(await worker.handle(TASK), {
    outcome: 'insufficient_input', retryable: false,
  });
  assert.deepEqual(order, [
    'claim', 'materialize', 'markCalling', 'provider',
    'providerArtifact', 'normalize', 'normalizedArtifact',
    'recordResult', 'escalation', 'settle', 'cleanup',
  ]);
  assert.equal(calls.results[0].result.outcome, 'insufficient_input');
  assert.equal(calls.escalations.length, 1);
});

test('worker-side unsupported input persists a zero-cost result without a provider call', async () => {
  const { worker, order, calls } = harness({
    work: claimWork({
      ocrInput: {
        format: 'heic',
        mimeType: 'image/heic',
        sizeBytes: 2_048,
        width: 1_200,
        height: 800,
      },
    }),
  });
  assert.deepEqual(await worker.handle(TASK), { outcome: 'unsupported', retryable: false });
  assert.deepEqual(order, ['claim', 'fail']);
  assert.equal(calls.provider, 0);
  assert.equal(calls.fail[0].outcome, 'unsupported');
  assert.equal(calls.fail[0].result.actualCostMicros, 0);
  assert.equal(calls.fail[0].result.providerArtifactRef, null);
});

test('unexpected provider page count or post-call persistence failure prevents automatic retry', async () => {
  const secondPage = structuredClone(DOCUMENT.pages[0]);
  secondPage.pageNumber = 2;
  for (const options of [
    { document: { ...structuredClone(DOCUMENT), pages: [...DOCUMENT.pages, secondPage] } },
    { providerArtifactError: new Error('private storage data') },
    { recordResultError: new Error('private repository data') },
  ]) {
    const { worker, calls } = harness(options);
    assert.deepEqual(await worker.handle(TASK), {
      outcome: 'billing_uncertain', retryable: false,
    });
    assert.equal(calls.provider, 1);
    assert.equal(calls.cleanup, 1);
    assert.equal(calls.uncertain.length, 1);
  }
});

test('settlement or escalation failure resumes safely without another provider call', async () => {
  for (const options of [
    { settleError: new Error('repository unavailable') },
    { document: EMPTY_DOCUMENT, escalationError: new Error('repository unavailable') },
  ]) {
    const { worker, calls } = harness(options);
    assert.deepEqual(await worker.handle(TASK), {
      outcome: 'failed_retryable', retryable: true,
    });
    assert.equal(calls.provider, 1);
    assert.equal(calls.cleanup, 1);
  }
});

test('worker rejects forged task fields and incomplete ports before touching dependencies', async () => {
  const { worker, order } = harness();
  await assert.rejects(() => worker.handle({ ...TASK, ownerId: 'forged', private: true }), TypeError);
  assert.deepEqual(order, []);
  assert.throws(() => createOcrCapabilityWorker({}), TypeError);
});
