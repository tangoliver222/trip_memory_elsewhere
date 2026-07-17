import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCapabilityIdentity } from '../../src/capabilities/identity.js';
import {
  makeCapabilityArtifactRef,
  makeOcrCapabilityResult,
  makeOcrReceipt,
  makeReservedOcrExecution,
} from '../fixtures/capabilities.js';
import {
  makeCapabilityDecision,
  makeRoutePlan,
} from '../fixtures/routing.js';
import { seedDeterministicSuccess } from './routing-repository.contract.js';

const NOW = '2026-07-17T12:00:00.000Z';
const QUEUED_AT = '2026-07-17T12:01:00.000Z';
const CLAIMED_AT = '2026-07-17T12:02:00.000Z';
const LEASE_EXPIRES_AT = '2026-07-17T12:07:00.000Z';
const CALLED_AT = '2026-07-17T12:03:00.000Z';
const RECORDED_AT = '2026-07-17T12:04:00.000Z';
const SETTLED_AT = '2026-07-17T12:05:00.000Z';
const ref = (type, id) => ({ type, id });

const METHODS = [
  'prepareCapabilityExecution',
  'markCapabilityQueued',
  'claimCapabilityExecution',
  'markCapabilityCalling',
  'recordCapabilityResult',
  'settleCapabilityExecution',
  'failCapabilityExecution',
  'markCapabilityBillingUncertain',
];

const SUPPORTED_VERSIONS = Object.freeze({
  router: ['v1'],
  policy: ['v2'],
  costModel: ['v2'],
  executors: { 'document-ocr': ['v1'] },
  providers: { 'document-ai-enterprise-ocr': ['fake-processor-v1'] },
});

function assertCapabilityRepository(repository) {
  for (const method of METHODS) {
    if (typeof repository?.[method] !== 'function') {
      throw new TypeError(`Repository must implement ${method}()`);
    }
  }
  return repository;
}

function intents() {
  return {
    ocr: {
      decision: 'approve',
      executorClass: 'document-ocr',
      scope: 'self',
      reasonCodes: ['document-ai-input-supported'],
      reconsiderOn: [],
    },
    places: {
      decision: 'defer',
      executorClass: null,
      scope: 'self',
      reasonCodes: ['await-ocr-result'],
      reconsiderOn: ['ocr-completed'],
    },
    embedding: {
      decision: 'defer',
      executorClass: null,
      scope: 'self',
      reasonCodes: ['await-ocr-result'],
      reconsiderOn: ['ocr-completed'],
    },
    gemini: {
      decision: 'defer',
      executorClass: null,
      scope: 'self',
      reasonCodes: ['await-structured-results'],
      reconsiderOn: ['ocr-completed'],
    },
  };
}

async function seedApprovedOcr(repository, ownerId, suffix) {
  const seeded = await seedDeterministicSuccess(repository, ownerId, suffix, 'receipt');
  const draft = makeRoutePlan({
    id: `route_ocr_${suffix}`,
    ownerId,
    fragmentRef: ref('fragment', seeded.fragment.id),
    batchRef: ref('importBatch', seeded.batch.id),
    sourceRevision: {
      bucket: seeded.fragment.storage.bucket,
      objectName: seeded.fragment.storage.originalPath,
      generation: seeded.fragment.storage.generation,
      inputHash: seeded.fragment.hashes.sha256,
    },
    router: {
      name: 'fragment-routing',
      version: 'v1',
      policyVersion: 'v2',
      costModelVersion: 'v2',
    },
    state: 'draft',
    inputs: {
      deterministicTaskId: seeded.taskId,
      deterministicProcessorName: 'deterministic-media',
      deterministicProcessorVersion: 'v1',
      cohortRevisionIds: [],
      userDecisionVersion: 0,
    },
    classification: {
      mediaKind: 'document',
      documentKind: 'receipt',
      confidence: 1,
      basis: ['fragment-type', 'technical-metadata-format'],
    },
    capabilities: {
      ocr: makeCapabilityDecision('blocked', { reasonCodes: ['await-budget-gate'] }),
      places: makeCapabilityDecision('deferred', {
        reasonCodes: ['await-ocr-result'], reconsiderOn: ['ocr-completed'],
      }),
      embedding: makeCapabilityDecision('deferred', {
        reasonCodes: ['await-ocr-result'], reconsiderOn: ['ocr-completed'],
      }),
      gemini: makeCapabilityDecision('deferred'),
    },
    budgetClass: 'deterministic_only',
    routeReasons: ['document-ai-input-supported'],
    approvedAt: null,
  });
  await repository.saveRoutingDraft(ownerId, { routePlan: draft });
  const approval = await repository.commitRoutingApproval(ownerId, {
    batchId: seeded.batch.id,
    approvals: [{ routePlanId: draft.id, capabilityIntents: intents() }],
    cohorts: [],
    approvedAt: NOW,
  });
  const plan = approval.plans[0];
  const reservation = approval.reservations[0];
  const identity = makeCapabilityIdentity({
    ownerId,
    fragmentId: seeded.fragment.id,
    sourceRevision: plan.sourceRevision,
    routePlanRevision: plan.revision,
    capability: 'ocr',
    provider: 'document-ai-enterprise-ocr',
    providerVersion: 'fake-processor-v1',
  });
  const execution = makeReservedOcrExecution({
    id: identity.executionId,
    ownerId,
    routePlanRef: ref('routePlan', plan.id),
    routePlanRevision: plan.revision,
    reservationRef: ref('budgetReservation', reservation.id),
    fragmentRef: ref('fragment', seeded.fragment.id),
    sourceRevision: plan.sourceRevision,
    idempotencyKey: identity.idempotencyKey,
    providerVersion: 'fake-processor-v1',
    createdAt: NOW,
    updatedAt: NOW,
  });
  return { ...seeded, plan, reservation, identity, execution };
}

const prepare = (repository, ownerId, seeded, overrides = {}) => (
  repository.prepareCapabilityExecution(ownerId, {
    execution: { ...seeded.execution, ...overrides },
    supportedVersions: SUPPORTED_VERSIONS,
  })
);

async function queueAndClaim(repository, ownerId, seeded, leaseOwner = 'delivery_12345678') {
  await prepare(repository, ownerId, seeded);
  await repository.markCapabilityQueued(ownerId, {
    executionId: seeded.execution.id,
    taskName: seeded.identity.taskName,
    queuedAt: QUEUED_AT,
  });
  return repository.claimCapabilityExecution(ownerId, {
    executionId: seeded.execution.id,
    leaseOwner,
    claimedAt: CLAIMED_AT,
    leaseExpiresAt: LEASE_EXPIRES_AT,
    supportedVersions: SUPPORTED_VERSIONS,
  });
}

function resultFor(seeded, ownerId, outcome = 'completed') {
  const unsupported = outcome === 'unsupported';
  const artifact = (kind) => makeCapabilityArtifactRef({
    kind,
    bucket: seeded.fragment.storage.bucket,
    objectName: `users/${ownerId}/capability-results/${seeded.execution.id}/${kind}.json.gz`,
    generation: kind === 'provider' ? '1740000000000200' : '1740000000000201',
    sha256: (kind === 'provider' ? 'b' : 'c').repeat(64),
  });
  return makeOcrCapabilityResult({
    id: seeded.identity.resultId,
    ownerId,
    executionRef: ref('capabilityExecution', seeded.execution.id),
    routePlanRef: ref('routePlan', seeded.plan.id),
    routePlanRevision: seeded.plan.revision,
    fragmentRef: ref('fragment', seeded.fragment.id),
    sourceRevision: seeded.plan.sourceRevision,
    outcome,
    providerArtifactRef: unsupported ? null : artifact('provider'),
    normalizedArtifactRef: unsupported ? null : artifact('normalized'),
    requestCount: unsupported ? 0 : 1,
    pageCount: unsupported ? 0 : 1,
    estimatedCostMicros: unsupported ? 0 : 1_500,
    actualCostMicros: unsupported ? 0 : 1_500,
    qualitySummary: unsupported ? null : { averageConfidence: 0.94, defectCodes: [] },
    suggestedFactKeys: unsupported ? [] : [
      'ocrLanguageCodes', 'ocrPageCount', 'ocrQualitySummary', 'ocrResultRef',
    ],
  });
}

export function runCapabilityRepositoryContract({ name, createRepository }) {
  let index = 0;
  const contractTest = (label, callback) => {
    index += 1;
    const suffix = String(index).padStart(8, '0');
    test(`${name}: ${label}`, { concurrency: false }, async (context) => {
      const ownerId = `user_capability_${suffix}`;
      const repository = assertCapabilityRepository(await createRepository({ ownerId, context }));
      await callback({ repository, ownerId, suffix });
    });
  };

  contractTest('persists queue lease provider result and settlement in order', async ({
    repository, ownerId, suffix,
  }) => {
    const seeded = await seedApprovedOcr(repository, ownerId, suffix);
    const prepared = await prepare(repository, ownerId, seeded);
    assert.equal(prepared.execution.state, 'reserved');
    assert.equal(prepared.execution.billableAttempts, 0);

    const queued = await repository.markCapabilityQueued(ownerId, {
      executionId: seeded.execution.id,
      taskName: seeded.identity.taskName,
      queuedAt: QUEUED_AT,
    });
    assert.equal(queued.execution.state, 'queued');

    const claimed = await repository.claimCapabilityExecution(ownerId, {
      executionId: seeded.execution.id,
      leaseOwner: 'delivery_12345678',
      claimedAt: CLAIMED_AT,
      leaseExpiresAt: LEASE_EXPIRES_AT,
      supportedVersions: SUPPORTED_VERSIONS,
    });
    assert.equal(claimed.execution.state, 'claimed');
    assert.equal(claimed.execution.billableAttempts, 0);

    const calling = await repository.markCapabilityCalling(ownerId, {
      executionId: seeded.execution.id,
      leaseOwner: 'delivery_12345678',
      calledAt: CALLED_AT,
    });
    assert.equal(calling.execution.billableAttempts, 1);

    const result = resultFor(seeded, ownerId);
    const receipt = makeOcrReceipt({ clientRequestId: seeded.identity.clientRequestId });
    const recorded = await repository.recordCapabilityResult(ownerId, {
      executionId: seeded.execution.id,
      leaseOwner: 'delivery_12345678',
      receipt,
      result,
      recordedAt: RECORDED_AT,
    });
    assert.equal(recorded.execution.state, 'provider_succeeded');

    const settled = await repository.settleCapabilityExecution(ownerId, {
      executionId: seeded.execution.id,
      leaseOwner: 'delivery_12345678',
      settledAt: SETTLED_AT,
    });
    assert.equal(settled.execution.state, 'completed');
    assert.equal(settled.reservation.state, 'settled');
    assert.equal(settled.batch.capabilitySummary.completed, 1);
    assert.equal(settled.fragment.facts.ocrResultRef.value.id, result.id);
    assert.equal(Object.hasOwn(settled.fragment.facts, 'ocrText'), false);

    const replay = await repository.settleCapabilityExecution(ownerId, {
      executionId: seeded.execution.id,
      leaseOwner: 'delivery_12345678',
      settledAt: SETTLED_AT,
    });
    assert.equal(replay.outcome, 'duplicate');
  });

  contractTest('deduplicates prepare enqueue and reclaims only an expired lease', async ({
    repository, ownerId, suffix,
  }) => {
    const seeded = await seedApprovedOcr(repository, ownerId, suffix);
    const first = await prepare(repository, ownerId, seeded);
    const duplicate = await prepare(repository, ownerId, seeded);
    assert.equal(first.outcome, 'created');
    assert.equal(duplicate.outcome, 'duplicate');
    await assert.rejects(() => prepare(repository, ownerId, seeded, {
      providerVersion: 'processor-version-conflict',
    }), { code: 'repository/conflict' });

    await repository.markCapabilityQueued(ownerId, {
      executionId: seeded.execution.id,
      taskName: seeded.identity.taskName,
      queuedAt: QUEUED_AT,
    });
    const claimed = await repository.claimCapabilityExecution(ownerId, {
      executionId: seeded.execution.id,
      leaseOwner: 'delivery_12345678',
      claimedAt: CLAIMED_AT,
      leaseExpiresAt: LEASE_EXPIRES_AT,
      supportedVersions: SUPPORTED_VERSIONS,
    });
    assert.equal(claimed.execution.billableAttempts, 0);
    await assert.rejects(() => repository.claimCapabilityExecution(ownerId, {
      executionId: seeded.execution.id,
      leaseOwner: 'delivery_other001',
      claimedAt: '2026-07-17T12:06:00.000Z',
      leaseExpiresAt: '2026-07-17T12:11:00.000Z',
      supportedVersions: SUPPORTED_VERSIONS,
    }), { code: 'repository/conflict' });
    const reclaimed = await repository.claimCapabilityExecution(ownerId, {
      executionId: seeded.execution.id,
      leaseOwner: 'delivery_other001',
      claimedAt: LEASE_EXPIRES_AT,
      leaseExpiresAt: '2026-07-17T12:12:00.000Z',
      supportedVersions: SUPPORTED_VERSIONS,
    });
    assert.equal(reclaimed.execution.leaseOwner, 'delivery_other001');
    assert.equal(reclaimed.execution.billableAttempts, 0);
  });

  contractTest('rejects stale source and unsupported executor or provider versions', async ({
    repository, ownerId, suffix,
  }) => {
    const seeded = await seedApprovedOcr(repository, ownerId, suffix);
    await assert.rejects(() => prepare(repository, ownerId, seeded, {
      sourceRevision: { ...seeded.execution.sourceRevision, generation: '1740000000000002' },
    }), { code: 'repository/routing-target-mismatch' });
    await prepare(repository, ownerId, seeded);
    await repository.markCapabilityQueued(ownerId, {
      executionId: seeded.execution.id,
      taskName: seeded.identity.taskName,
      queuedAt: QUEUED_AT,
    });
    await assert.rejects(() => repository.claimCapabilityExecution(ownerId, {
      executionId: seeded.execution.id,
      leaseOwner: 'delivery_12345678',
      claimedAt: CLAIMED_AT,
      leaseExpiresAt: LEASE_EXPIRES_AT,
      supportedVersions: {
        ...SUPPORTED_VERSIONS,
        providers: { 'document-ai-enterprise-ocr': ['other-version'] },
      },
    }), { code: 'repository/routing-target-mismatch' });
  });

  contractTest('unsupported is not failed and billing uncertainty retains reservation', async ({
    repository, ownerId, suffix,
  }) => {
    const unsupported = await seedApprovedOcr(repository, ownerId, `${suffix}a`);
    await queueAndClaim(repository, ownerId, unsupported);
    const unsupportedResult = resultFor(unsupported, ownerId, 'unsupported');
    const released = await repository.failCapabilityExecution(ownerId, {
      executionId: unsupported.execution.id,
      leaseOwner: 'delivery_12345678',
      outcome: 'unsupported',
      errorCode: 'input-unsupported',
      result: unsupportedResult,
      completedAt: SETTLED_AT,
    });
    assert.equal(released.reservation.state, 'released');
    assert.equal(released.batch.capabilitySummary.unsupported, 1);
    assert.equal(released.batch.capabilitySummary.failed, 0);

    const uncertain = await seedApprovedOcr(repository, ownerId, `${suffix}b`);
    await queueAndClaim(repository, ownerId, uncertain, 'delivery_uncertain1');
    await repository.markCapabilityCalling(ownerId, {
      executionId: uncertain.execution.id,
      leaseOwner: 'delivery_uncertain1',
      calledAt: CALLED_AT,
    });
    const terminal = await repository.markCapabilityBillingUncertain(ownerId, {
      executionId: uncertain.execution.id,
      leaseOwner: 'delivery_uncertain1',
      errorCode: 'provider-call-uncertain',
      completedAt: RECORDED_AT,
    });
    assert.equal(terminal.execution.state, 'billing_uncertain');
    assert.equal(terminal.reservation.state, 'reserved');
    assert.equal(terminal.batch.capabilitySummary.billingUncertain, 1);
    await assert.rejects(() => repository.claimCapabilityExecution(ownerId, {
      executionId: uncertain.execution.id,
      leaseOwner: 'delivery_retry0001',
      claimedAt: SETTLED_AT,
      leaseExpiresAt: '2026-07-17T12:10:00.000Z',
      supportedVersions: SUPPORTED_VERSIONS,
    }), { code: 'repository/conflict' });
  });
}
