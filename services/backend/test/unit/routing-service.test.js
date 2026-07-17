import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRoutePlan,
  parseRoutingCohort,
} from '../../src/domain/index.js';
import { createAuthoritativeRouter } from '../../src/routing/service.js';
import {
  makeExactDuplicateCandidate,
} from '../fixtures/processing.js';
import {
  makeCapabilityDecision,
  makeRoutePlan,
  makeRoutableFragment,
  makeRoutingEvent,
  makeRoutingHead,
  makeRoutingServiceSnapshot,
} from '../fixtures/routing.js';

const NOW = '2026-07-17T12:00:00.000Z';
const FEATURES = Object.freeze({
  mean: 0.5,
  variance: 0.1,
  entropyBits: 2,
  edgeEnergy: 0.2,
  exposure: 'normal',
  lowInformation: false,
});
const ref = (type, id) => ({ type, id });

function createHarness(snapshot, {
  loadError = null,
  commitError = null,
  feature = async () => FEATURES,
} = {}) {
  const calls = [];
  const drafts = [];
  const approvals = [];
  const escalationRequests = [];
  const repository = {
    async loadRoutingSnapshot(uid, input) {
      calls.push(`load:${uid}:${input.batchId}`);
      if (loadError) throw loadError;
      return structuredClone(snapshot);
    },
    async saveRoutingDraft(uid, input) {
      calls.push(`save:${input.routePlan.fragmentRef.id}`);
      assert.equal(uid, input.routePlan.ownerId);
      drafts.push(structuredClone(input.routePlan));
      return { outcome: 'created', routePlan: input.routePlan };
    },
    async commitRoutingApproval(uid, input) {
      calls.push(`commit:${uid}`);
      approvals.push(structuredClone(input));
      if (commitError) throw commitError;
      return {
        outcome: 'applied',
        plans: input.approvals.map(({ routePlanId, capabilityIntents }) => ({
          id: routePlanId,
          state: Object.values(capabilityIntents).some(({ decision }) => decision === 'approve')
            ? 'approved'
            : 'completed',
        })),
      };
    },
    async submitEscalationRequest(uid, input) {
      calls.push(`escalate:${uid}`);
      escalationRequests.push(structuredClone(input));
      return { outcome: 'created', request: input };
    },
  };
  const featureReader = {
    async read(fragment, options) {
      calls.push(`feature:${fragment.id}`);
      assert.ok(options.signal instanceof AbortSignal);
      return feature(fragment, options);
    },
  };
  return {
    approvals,
    calls,
    drafts,
    escalationRequests,
    router: createAuthoritativeRouter({
      repository,
      featureReader,
      clock: () => NOW,
      randomUUID: () => '12345678-1234-4234-8234-123456789abc',
    }),
  };
}

function noPixelFragment({ id, type, format }) {
  const base = makeRoutableFragment({ id, type, thumbnailStatus: 'unsupported' });
  return {
    ...base,
    storage: {
      ...base.storage,
      contentType: format === 'pdf' ? 'application/pdf' : 'text/plain',
    },
    source: { ...base.source, media: null },
    hashes: {
      sha256: base.hashes.sha256,
      perceptualHash: null,
      perceptualHashAlgorithm: null,
      perceptualHashVersion: null,
      perceptualHashBands: null,
    },
    technicalMetadata: {
      ...base.technicalMetadata,
      format,
      width: null,
      height: null,
      orientation: null,
      pageCount: null,
      metadataStatus: 'partial',
      warningCodes: format === 'pdf' ? ['processing/page-count-unsupported'] : [],
    },
    derivatives: { thumbnail: null },
    processing: {
      deterministic: {
        ...base.processing.deterministic,
        thumbnailStatus: 'unsupported',
        perceptualHashStatus: 'unsupported',
      },
    },
  };
}

test('one settled Fragment compiles a valid draft then atomically requests approval', async () => {
  const fragment = makeRoutableFragment();
  const harness = createHarness(makeRoutingServiceSnapshot({ fragments: [fragment] }));

  const result = await harness.router.handle(makeRoutingEvent(fragment));

  assert.deepEqual(result, { outcome: 'approved' });
  assert.deepEqual(harness.calls, [
    'load:user_alpha:batch_12345678',
    'feature:frag_12345678',
    'save:frag_12345678',
    'commit:user_alpha',
  ]);
  const draft = parseRoutePlan(harness.drafts[0]);
  assert.equal(draft.state, 'draft');
  assert.equal(draft.sourceRevision.inputHash, fragment.hashes.sha256);
  assert.equal(draft.capabilities.embedding.decision, 'blocked');
  assert.deepEqual(draft.capabilities.embedding.reasonCodes, ['await-budget-gate']);
  assert.equal(harness.approvals[0].approvals[0].capabilityIntents.embedding.decision, 'approve');
  assert.deepEqual(harness.approvals[0].cohorts, []);
});

test('an unsettled batch persists only an immutable provisional draft', async () => {
  const fragment = makeRoutableFragment();
  const harness = createHarness(makeRoutingServiceSnapshot({
    fragments: [fragment],
    settled: false,
  }));

  assert.deepEqual(await harness.router.handle(makeRoutingEvent(fragment)), { outcome: 'drafted' });
  assert.deepEqual(harness.calls, [
    'load:user_alpha:batch_12345678',
    'save:frag_12345678',
  ]);
  const draft = parseRoutePlan(harness.drafts[0]);
  assert.equal(Object.values(draft.capabilities).every((capability) => (
    capability.decision === 'deferred'
      && capability.reconsiderOn.includes('batch-deterministic-settled')
  )), true);
});

test('settlement closes provisional revisions before approving bounded final revisions', async () => {
  const fragment = makeRoutableFragment();
  const first = createHarness(makeRoutingServiceSnapshot({
    fragments: [fragment],
    settled: false,
  }));
  await first.router.handle(makeRoutingEvent(fragment));
  const provisional = first.drafts[0];
  const second = createHarness(makeRoutingServiceSnapshot({
    fragments: [fragment],
    routePlans: [provisional],
    settled: true,
  }));

  assert.deepEqual(await second.router.handle(makeRoutingEvent(fragment)), {
    outcome: 'approved',
  });
  assert.equal(second.approvals.length, 2);
  assert.deepEqual(second.approvals[0].approvals.map(({ routePlanId }) => routePlanId), [
    provisional.id,
  ]);
  assert.equal(Object.values(second.approvals[0].approvals[0].capabilityIntents)
    .every(({ decision }) => decision === 'defer'), true);
  assert.equal(second.approvals[1].approvals.length, 1);
  assert.equal(second.drafts.length, 1);
  assert.equal(second.drafts[0].revision, 2);
});

test('stale generation and nonterminal deterministic work are terminal no-ops', async () => {
  const fragment = makeRoutableFragment();
  const stale = createHarness(makeRoutingServiceSnapshot({ fragments: [fragment] }));
  const staleEvent = makeRoutingEvent(fragment, {
    sourceRevision: { ...makeRoutingEvent(fragment).sourceRevision, generation: '999' },
  });
  assert.deepEqual(await stale.router.handle(staleEvent), { outcome: 'terminal_noop' });
  assert.deepEqual(stale.calls, ['load:user_alpha:batch_12345678']);

  const snapshot = makeRoutingServiceSnapshot({ fragments: [fragment] });
  snapshot.processingTasks[0].state = 'running';
  const active = createHarness(snapshot);
  assert.deepEqual(await active.router.handle(makeRoutingEvent(fragment)), {
    outcome: 'terminal_noop',
  });
  assert.deepEqual(active.calls, ['load:user_alpha:batch_12345678']);
});

test('twelve mixed Fragments compile in stable Fragment-ID order', async () => {
  const types = ['photo', 'receipt', 'screenshot', 'ticket', 'menu', 'photo'];
  const fragments = Array.from({ length: 12 }, (_, index) => makeRoutableFragment({
    id: `frag_mixed${String(11 - index).padStart(3, '0')}`,
    type: types[index % types.length],
    inputHash: (index + 1).toString(16).padStart(64, '0'),
    sourceCreatedAt: null,
  }));
  const harness = createHarness(makeRoutingServiceSnapshot({ fragments }));

  assert.deepEqual(await harness.router.handle(makeRoutingEvent(fragments[0])), {
    outcome: 'approved',
  });
  const expected = fragments.map(({ id }) => id).sort();
  assert.deepEqual(harness.drafts.map(({ fragmentRef }) => fragmentRef.id), expected);
  assert.deepEqual(
    harness.approvals[0].approvals.map(({ routePlanId }) => routePlanId),
    harness.drafts.map(({ id }) => id),
  );
  assert.equal(harness.drafts.every((draft) => parseRoutePlan(draft)), true);
});

test('terminal deterministic failure blocks every paid capability without reading a thumbnail', async () => {
  const base = makeRoutableFragment();
  const fragment = {
    ...base,
    processing: {
      deterministic: { ...base.processing.deterministic, state: 'failed_terminal' },
    },
  };
  const harness = createHarness(makeRoutingServiceSnapshot({ fragments: [fragment] }));

  assert.deepEqual(await harness.router.handle(makeRoutingEvent(fragment)), { outcome: 'completed' });
  assert.equal(harness.calls.some((call) => call.startsWith('feature:')), false);
  const intents = harness.approvals[0].approvals[0].capabilityIntents;
  assert.equal(Object.values(intents).every(({ decision }) => decision === 'block'), true);
});

test('corrupt thumbnail degrades to feature-unavailable and never invents low-information', async () => {
  const fragment = makeRoutableFragment();
  const harness = createHarness(makeRoutingServiceSnapshot({ fragments: [fragment] }), {
    feature: async () => {
      throw new Error('/private/user/photo.webp decoder exploded');
    },
  });

  assert.deepEqual(await harness.router.handle(makeRoutingEvent(fragment)), { outcome: 'approved' });
  const draft = parseRoutePlan(harness.drafts[0]);
  assert.equal(draft.routeReasons.includes('routing/feature-unavailable'), true);
  assert.equal(draft.routeReasons.includes('low-information'), false);
});

test('text and PDF route without attempting thumbnail or original reads', async () => {
  const fragments = [
    noPixelFragment({ id: 'frag_text0001', type: 'text', format: 'text' }),
    noPixelFragment({ id: 'frag_pdf00001', type: 'receipt', format: 'pdf' }),
  ];
  const harness = createHarness(makeRoutingServiceSnapshot({ fragments }));

  assert.deepEqual(await harness.router.handle(makeRoutingEvent(fragments[0])), {
    outcome: 'approved',
  });
  assert.equal(harness.calls.some((call) => call.startsWith('feature:')), false);
  const classifications = harness.drafts.map(({ classification }) => classification);
  assert.deepEqual(classifications.map(({ mediaKind, documentKind }) => ({
    mediaKind,
    documentKind,
  })), [
    { mediaKind: 'document', documentKind: 'pdf' },
    { mediaKind: 'text', documentKind: null },
  ]);
});

test('an external exact canonical stays visible and makes the batch Fragment supporting', async () => {
  const inputHash = 'f'.repeat(64);
  const candidate = makeRoutableFragment({ id: 'frag_new0001', inputHash });
  const canonical = makeRoutableFragment({
    id: 'frag_existing',
    batchId: 'batch_external1',
    inputHash,
  });
  const duplicate = makeExactDuplicateCandidate({
    canonicalFragmentRef: ref('fragment', canonical.id),
    candidateFragmentRef: ref('fragment', candidate.id),
    pairRefs: [candidate.id, canonical.id].sort().map((id) => ref('fragment', id)),
    createdByTaskId: candidate.processing.deterministic.taskId,
  });
  const harness = createHarness(makeRoutingServiceSnapshot({
    fragments: [candidate, canonical],
    duplicateCandidates: [duplicate],
    batchId: candidate.batchId,
  }));

  assert.deepEqual(await harness.router.handle(makeRoutingEvent(candidate)), { outcome: 'completed' });
  const cohort = parseRoutingCohort(harness.approvals[0].cohorts[0]);
  assert.deepEqual(cohort.representativeRefs, [ref('fragment', canonical.id)]);
  const draft = parseRoutePlan(harness.drafts[0]);
  assert.equal(draft.representation.role, 'supporting');
  assert.equal(draft.representation.representativeRef.id, canonical.id);
  assert.equal(draft.representation.cohortRefs.length, 1);
  assert.equal(Object.values(harness.approvals[0].approvals[0].capabilityIntents)
    .every(({ decision }) => decision === 'skip'), true);
});

test('a matching current plan is an idempotent terminal no-op', async () => {
  const fragment = makeRoutableFragment();
  const routePlan = makeRoutePlan({
    fragmentRef: ref('fragment', fragment.id),
    batchRef: ref('importBatch', fragment.batchId),
    sourceRevision: {
      bucket: fragment.storage.bucket,
      objectName: fragment.storage.originalPath,
      generation: fragment.storage.generation,
      inputHash: fragment.hashes.sha256,
    },
  });
  const head = makeRoutingHead({
    currentPlanRef: ref('routePlan', routePlan.id),
    sourceRevision: routePlan.sourceRevision,
  });
  const harness = createHarness(makeRoutingServiceSnapshot({
    fragments: [fragment], routePlans: [routePlan], routingHeads: [head],
  }));

  assert.deepEqual(await harness.router.handle(makeRoutingEvent(fragment)), {
    outcome: 'terminal_noop',
  });
  assert.deepEqual(harness.calls, ['load:user_alpha:batch_12345678']);
});

test('a valid insufficient-input event persists escalation before compiling revision two', async () => {
  const fragment = makeRoutableFragment({ type: 'receipt' });
  const routePlan = makeRoutePlan({
    fragmentRef: ref('fragment', fragment.id),
    batchRef: ref('importBatch', fragment.batchId),
    sourceRevision: {
      bucket: fragment.storage.bucket,
      objectName: fragment.storage.originalPath,
      generation: fragment.storage.generation,
      inputHash: fragment.hashes.sha256,
    },
    capabilities: {
      ...makeRoutePlan().capabilities,
      ocr: makeCapabilityDecision('approved', {
        executorClass: 'document-ocr',
        reasonCodes: ['declared-document-type'],
      }),
    },
  });
  const head = makeRoutingHead({
    currentPlanRef: ref('routePlan', routePlan.id),
    sourceRevision: routePlan.sourceRevision,
  });
  const harness = createHarness(makeRoutingServiceSnapshot({
    fragments: [fragment], routePlans: [routePlan], routingHeads: [head],
  }));
  const event = makeRoutingEvent(fragment, {
    escalationRequest: {
      fromRoutePlanId: routePlan.id,
      fromCapability: 'ocr',
      outcome: 'insufficient_input',
      reasonCodes: ['ocr-text-insufficient'],
      producedFactRefs: [],
      requestedCapability: 'gemini',
    },
  });

  assert.deepEqual(await harness.router.handle(event), { outcome: 'approved' });
  assert.equal(harness.calls.indexOf('escalate:user_alpha') < harness.calls.indexOf('commit:user_alpha'), true);
  assert.equal(harness.escalationRequests.length, 1);
  assert.equal(harness.drafts[0].revision, 2);
  assert.equal(harness.approvals[0].approvals[0].capabilityIntents.gemini.decision, 'approve');
});

test('repository failures are retryable redacted and never reach approval', async () => {
  const fragment = makeRoutableFragment();
  const harness = createHarness(makeRoutingServiceSnapshot({ fragments: [fragment] }), {
    loadError: new Error('/users/user_alpha/originals/private.jpg unavailable'),
  });

  await assert.rejects(
    () => harness.router.handle(makeRoutingEvent(fragment)),
    (error) => error.code === 'routing/repository-unavailable'
      && error.retryable === true
      && !error.message.includes('private.jpg'),
  );
  assert.deepEqual(harness.calls, ['load:user_alpha:batch_12345678']);
});

test('constructor and event boundary reject missing methods and untrusted extra fields', async () => {
  assert.throws(() => createAuthoritativeRouter({
    repository: {},
    featureReader: { read() {} },
    clock: () => NOW,
    randomUUID: () => '12345678-1234-4234-8234-123456789abc',
  }), TypeError);
  const fragment = makeRoutableFragment();
  const harness = createHarness(makeRoutingServiceSnapshot({ fragments: [fragment] }));
  await assert.rejects(() => harness.router.handle({
    ...makeRoutingEvent(fragment),
    inputHash: fragment.hashes.sha256,
  }), TypeError);
});
