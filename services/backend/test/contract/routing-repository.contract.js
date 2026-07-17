import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProcessingTaskId } from '../../src/processing/identity.js';
import {
  makeBudgetReservationId,
  makeRoutingHeadId,
} from '../../src/routing/identity.js';
import {
  makePendingBatch,
  makeUploadItem,
  makeUploadedFragment,
} from '../fixtures/import.js';
import {
  makeCapabilityDecision,
  makeEscalationRequest,
  makeRoutePlan,
  makeRoutingCohort,
} from '../fixtures/routing.js';

const ROUTING_METHODS = [
  'saveRoutingDraft',
  'loadRoutingSnapshot',
  'commitRoutingApproval',
  'submitEscalationRequest',
  'claimCapabilityExecution',
  'markCapabilityCalling',
  'recordCapabilityReceipt',
  'settleCapabilityExecution',
  'markCapabilityBillingUncertain',
];
const HASH = 'a'.repeat(64);
const ROUTED_AT = '2026-07-17T12:00:00.000Z';

function assertRoutingRepository(repository) {
  for (const method of ROUTING_METHODS) {
    if (typeof repository?.[method] !== 'function') {
      throw new TypeError(`Repository must implement ${method}()`);
    }
  }
  return repository;
}

const ref = (type, id) => ({ type, id });

function intents(overrides = {}) {
  const value = (decision, capability, extra = {}) => ({
    decision,
    executorClass: decision === 'approve'
      ? {
        ocr: 'document-ocr',
        places: 'places-resolution',
        embedding: 'multimodal-embedding',
        gemini: 'gemini-multimodal',
      }[capability]
      : null,
    scope: 'self',
    reasonCodes: [`${capability}-policy`],
    reconsiderOn: decision === 'defer' ? ['policy-change'] : [],
    ...extra,
  });
  return {
    ocr: value('skip', 'ocr'),
    places: value('skip', 'places'),
    embedding: value('approve', 'embedding'),
    gemini: value('defer', 'gemini'),
    ...overrides,
  };
}

function approval(batchId, routePlanId, capabilityIntents = intents()) {
  return {
    batchId,
    approvals: [{ routePlanId, capabilityIntents }],
    cohorts: [],
    approvedAt: ROUTED_AT,
  };
}

async function seedDeterministicSuccess(repository, ownerId, suffix) {
  const batchId = `batch_route_${suffix}`;
  const fragmentId = `frag_route_${suffix}`;
  const batch = makePendingBatch({
    id: batchId,
    ownerId,
    uploads: {
      [fragmentId]: makeUploadItem({ fragmentId, ownerId, batchId }),
    },
  });
  const original = makeUploadedFragment({ id: fragmentId, ownerId, batchId });
  await repository.createImportBatch(ownerId, batch);
  await repository.finalizeOriginal(ownerId, {
    batchId,
    fragmentId,
    originalPath: original.storage.originalPath,
    generation: original.storage.generation,
    updatedAt: '2026-07-16T00:00:30.000Z',
    fragment: original,
  });
  const sourceRevision = {
    bucket: original.storage.bucket,
    objectName: original.storage.originalPath,
    generation: original.storage.generation,
  };
  const taskId = makeProcessingTaskId({
    ownerId,
    fragmentId,
    processorName: 'deterministic-media',
    processorVersion: 'v1',
    ...sourceRevision,
  });
  const leaseOwner = `exec_${suffix}`;
  await repository.claimProcessingTask(ownerId, {
    taskId,
    fragmentId,
    batchId,
    processorName: 'deterministic-media',
    processorVersion: 'v1',
    sourceRevision,
    leaseOwner,
    claimedAt: '2026-07-16T00:01:00.000Z',
    softDeadlineAt: '2026-07-16T00:04:00.000Z',
    leaseExpiresAt: '2026-07-16T00:05:00.000Z',
  });
  await repository.registerContentHash(ownerId, {
    taskId,
    leaseOwner,
    registeredAt: '2026-07-16T00:02:00.000Z',
    sha256: HASH,
  });
  await repository.completeDeterministicProcessing(ownerId, {
    taskId,
    leaseOwner,
    completedAt: '2026-07-16T00:03:00.000Z',
    technicalMetadata: {
      format: 'jpeg',
      width: 4032,
      height: 3024,
      orientation: 1,
      pageCount: null,
      cameraMake: null,
      cameraModel: null,
      lensModel: null,
      focalLengthMm: null,
      apertureFNumber: null,
      isoEquivalent: null,
      exposureTimeSeconds: null,
      metadataStatus: 'complete',
      warningCodes: [],
      processorVersion: 'v1',
    },
    factSuggestions: {},
    derivative: {
      path: `users/${ownerId}/derived/${fragmentId}/deterministic-media/v1/${HASH}/thumbnail.webp`,
      generation: '1740000000000100',
      metageneration: '1',
      contentType: 'image/webp',
      sizeBytes: 48_291,
      crc32c: 'ImIEBA==',
      width: 512,
      height: 384,
    },
    perceptualHash: {
      value: '0000000000000000',
      bands: ['0:00', '1:00', '2:00', '3:00', '4:00', '5:00', '6:00', '7:00'],
    },
    capabilityStatuses: {
      metadata: 'complete',
      thumbnail: 'complete',
      perceptualHash: 'complete',
    },
    warningCodes: [],
    nearMatches: [],
  });
  return {
    batch: await repository.getImportBatch(ownerId, batchId),
    fragment: await repository.getFragment(ownerId, fragmentId),
    taskId,
  };
}

function makeDraft({ ownerId, batch, fragment, taskId, id = 'route_12345678', revision = 1 }) {
  return makeRoutePlan({
    id,
    ownerId,
    fragmentRef: ref('fragment', fragment.id),
    batchRef: ref('importBatch', batch.id),
    sourceRevision: {
      bucket: fragment.storage.bucket,
      objectName: fragment.storage.originalPath,
      generation: fragment.storage.generation,
      inputHash: fragment.hashes.sha256,
    },
    revision,
    state: 'draft',
    inputs: {
      deterministicTaskId: taskId,
      deterministicProcessorName: 'deterministic-media',
      deterministicProcessorVersion: 'v1',
      cohortRevisionIds: [],
      userDecisionVersion: 0,
    },
    representation: {
      role: 'independent',
      representativeRef: ref('fragment', fragment.id),
      cohortRefs: [],
      reasonCodes: ['independent-fragment'],
    },
    capabilities: {
      ocr: makeCapabilityDecision('skipped', { reasonCodes: ['not-document-like'] }),
      places: makeCapabilityDecision('skipped', { reasonCodes: ['gps-sufficient'] }),
      embedding: makeCapabilityDecision('blocked', { reasonCodes: ['await-budget-gate'] }),
      gemini: makeCapabilityDecision('deferred'),
    },
    budgetClass: 'deterministic_only',
    routeReasons: ['independent-fragment'],
    approvedAt: null,
  });
}

export function runRoutingRepositoryContract({ name, createRepository }) {
  let index = 0;
  const contractTest = (label, callback) => {
    index += 1;
    const suffix = String(index).padStart(8, '0');
    test(`${name}: ${label}`, { concurrency: false }, async (context) => {
      const ownerId = `user_routing_${suffix}`;
      const repository = assertRoutingRepository(await createRepository({ ownerId, context }));
      await callback({ repository, ownerId, suffix });
    });
  };

  contractTest('saves one immutable draft and deduplicates only an exact replay', async ({
    repository, ownerId, suffix,
  }) => {
    const seeded = await seedDeterministicSuccess(repository, ownerId, suffix);
    const draft = makeDraft({ ownerId, ...seeded });
    const created = await repository.saveRoutingDraft(ownerId, { routePlan: draft });
    const duplicate = await repository.saveRoutingDraft(ownerId, { routePlan: draft });

    assert.equal(created.outcome, 'created');
    assert.equal(duplicate.outcome, 'duplicate');
    assert.deepEqual(duplicate.routePlan, created.routePlan);
    await assert.rejects(
      () => repository.saveRoutingDraft(ownerId, {
        routePlan: { ...draft, priority: 'high' },
      }),
      { code: 'repository/conflict' },
    );
  });

  contractTest('loads only an owner batch with terminal deterministic inputs', async ({
    repository, ownerId, suffix,
  }) => {
    const seeded = await seedDeterministicSuccess(repository, ownerId, suffix);
    const snapshot = await repository.loadRoutingSnapshot(ownerId, {
      batchId: seeded.batch.id,
    });

    assert.equal(snapshot.batch.id, seeded.batch.id);
    assert.deepEqual(snapshot.fragments.map(({ id }) => id), [seeded.fragment.id]);
    assert.deepEqual(snapshot.processingTasks.map(({ id }) => id), [seeded.taskId]);
    assert.deepEqual(await repository.loadRoutingSnapshot('user_other0001', {
      batchId: seeded.batch.id,
    }), null);

    const pendingBatch = makePendingBatch({
      id: `batch_pending_${suffix}`,
      ownerId,
    });
    const pendingFragment = makeUploadedFragment({
      id: `frag_pending_${suffix}`,
      ownerId,
      batchId: pendingBatch.id,
    });
    await repository.createImportBatch(ownerId, pendingBatch);
    await repository.createFragment(ownerId, pendingFragment);
    await assert.rejects(
      () => repository.loadRoutingSnapshot(ownerId, { batchId: pendingBatch.id }),
      { code: 'repository/routing-target-mismatch' },
    );
  });

  contractTest('atomically approves plans reservations ledgers heads and summary', async ({
    repository, ownerId, suffix,
  }) => {
    const seeded = await seedDeterministicSuccess(repository, ownerId, suffix);
    const draft = makeDraft({ ownerId, ...seeded });
    await repository.saveRoutingDraft(ownerId, { routePlan: draft });
    const before = await repository.getImportBatch(ownerId, seeded.batch.id);
    const result = await repository.commitRoutingApproval(
      ownerId,
      approval(seeded.batch.id, draft.id),
    );

    assert.equal(result.outcome, 'applied');
    assert.deepEqual(result.plans.map(({ state }) => state), ['approved']);
    assert.deepEqual(result.reservations.map(({ capability }) => capability), ['embedding']);
    assert.equal(result.heads[0].id, makeRoutingHeadId({
      ownerId,
      fragmentId: seeded.fragment.id,
      routerName: 'fragment-routing',
    }));
    assert.equal(result.reservations[0].id, makeBudgetReservationId({
      routePlanId: draft.id,
      capability: 'embedding',
    }));
    assert.equal(result.batch.routingSummary.approved, 1);
    assert.equal(result.batch.routingSummary.drafting, 0);
    assert.equal(result.batch.status, before.status);
    assert.deepEqual(result.batch.counters, before.counters);
    assert.deepEqual(result.batch.processingSummary, before.processingSummary);
    assert.ok(result.ledgers.every((ledger) => (
      ledger.reservedMicros + ledger.spentMicros <= ledger.ceilingMicros
    )));
  });

  contractTest('completes a zero-approved plan without treating it as a failure', async ({
    repository, ownerId, suffix,
  }) => {
    const seeded = await seedDeterministicSuccess(repository, ownerId, suffix);
    const draft = makeDraft({ ownerId, ...seeded });
    await repository.saveRoutingDraft(ownerId, { routePlan: draft });
    const allSkipped = intents(Object.fromEntries(
      ['ocr', 'places', 'embedding', 'gemini'].map((capability) => [
        capability,
        intents()[capability].decision === 'defer'
          ? intents()[capability]
          : {
            ...intents()[capability],
            decision: 'skip',
            executorClass: null,
          },
      ]),
    ));
    const result = await repository.commitRoutingApproval(ownerId, approval(
      seeded.batch.id,
      draft.id,
      allSkipped,
    ));

    assert.equal(result.plans[0].state, 'completed');
    assert.equal(result.reservations.length, 0);
    assert.equal(result.batch.routingSummary.completed, 1);
    assert.equal(result.batch.counters.failed, seeded.batch.counters.failed);
  });

  contractTest('supersedes one current revision and moves the head monotonically', async ({
    repository, ownerId, suffix,
  }) => {
    const seeded = await seedDeterministicSuccess(repository, ownerId, suffix);
    const first = makeDraft({ ownerId, ...seeded });
    await repository.saveRoutingDraft(ownerId, { routePlan: first });
    await repository.commitRoutingApproval(ownerId, approval(seeded.batch.id, first.id));
    const second = makeDraft({
      ownerId,
      ...seeded,
      id: 'route_87654321',
      revision: 2,
    });
    await repository.saveRoutingDraft(ownerId, { routePlan: second });
    const result = await repository.commitRoutingApproval(
      ownerId,
      approval(seeded.batch.id, second.id),
    );
    const snapshot = await repository.loadRoutingSnapshot(ownerId, {
      batchId: seeded.batch.id,
    });
    const firstStored = snapshot.routePlans.find(({ id }) => id === first.id);

    assert.equal(firstStored.state, 'superseded');
    assert.equal(snapshot.routingHeads[0].currentPlanRef.id, second.id);
    assert.equal(snapshot.routingHeads[0].currentRevision, 2);
    assert.equal(result.batch.routingSummary.approved, 1);
    assert.equal(result.batch.routingSummary.superseded, 1);
  });

  contractTest('rejects stale source approval and changed replay decisions', async ({
    repository, ownerId, suffix,
  }) => {
    const seeded = await seedDeterministicSuccess(repository, ownerId, suffix);
    const stale = makeDraft({ ownerId, ...seeded });
    stale.sourceRevision = { ...stale.sourceRevision, generation: '1740000000000002' };
    await assert.rejects(
      () => repository.saveRoutingDraft(ownerId, { routePlan: stale }),
      { code: 'repository/routing-target-mismatch' },
    );

    const draft = makeDraft({ ownerId, ...seeded });
    await repository.saveRoutingDraft(ownerId, { routePlan: draft });
    const first = await repository.commitRoutingApproval(
      ownerId,
      approval(seeded.batch.id, draft.id),
    );
    const duplicate = await repository.commitRoutingApproval(
      ownerId,
      approval(seeded.batch.id, draft.id),
    );
    assert.equal(duplicate.outcome, 'duplicate');
    assert.deepEqual(duplicate.plans, first.plans);
    await assert.rejects(
      () => repository.commitRoutingApproval(ownerId, approval(
        seeded.batch.id,
        draft.id,
        intents({ embedding: intents().ocr }),
      )),
      { code: 'repository/conflict' },
    );
  });

  contractTest('applies aggregate budget in capability order without overspend', async ({
    repository, ownerId, suffix,
  }) => {
    const seeded = await seedDeterministicSuccess(repository, ownerId, suffix);
    const draft = makeDraft({ ownerId, ...seeded });
    await repository.saveRoutingDraft(ownerId, { routePlan: draft });
    const everyCapability = intents(Object.fromEntries(
      ['ocr', 'places', 'embedding', 'gemini'].map((capability) => [
        capability,
        {
          ...intents()[capability],
          decision: 'approve',
          executorClass: {
            ocr: 'document-ocr',
            places: 'places-resolution',
            embedding: 'multimodal-embedding',
            gemini: 'gemini-multimodal',
          }[capability],
          reconsiderOn: [],
        },
      ]),
    ));
    const result = await repository.commitRoutingApproval(ownerId, approval(
      seeded.batch.id,
      draft.id,
      everyCapability,
    ));

    assert.deepEqual(result.reservations.map(({ capability }) => capability), [
      'ocr', 'places', 'embedding',
    ]);
    assert.equal(result.plans[0].capabilities.gemini.decision, 'blocked');
    assert.deepEqual(result.plans[0].capabilities.gemini.reasonCodes, ['budget-limit']);
    assert.ok(result.ledgers.every((ledger) => (
      ledger.reservedMicros + ledger.spentMicros <= ledger.ceilingMicros
    )));
  });

  contractTest('stores one deterministic escalation request and rejects ID collision', async ({
    repository, ownerId, suffix,
  }) => {
    const seeded = await seedDeterministicSuccess(repository, ownerId, suffix);
    const draft = makeDraft({ ownerId, ...seeded });
    await repository.saveRoutingDraft(ownerId, { routePlan: draft });
    await repository.commitRoutingApproval(ownerId, approval(seeded.batch.id, draft.id));
    const request = makeEscalationRequest({
      ownerId,
      fromRoutePlanRef: ref('routePlan', draft.id),
    });
    const created = await repository.submitEscalationRequest(ownerId, request);
    const duplicate = await repository.submitEscalationRequest(ownerId, request);

    assert.equal(created.outcome, 'created');
    assert.equal(duplicate.outcome, 'duplicate');
    await assert.rejects(
      () => repository.submitEscalationRequest(ownerId, {
        ...request,
        reasonCodes: ['different-reason'],
      }),
      { code: 'repository/conflict' },
    );
  });

  contractTest('persists cohorts only with the same owner and approval commit', async ({
    repository, ownerId, suffix,
  }) => {
    const seeded = await seedDeterministicSuccess(repository, ownerId, suffix);
    const external = await seedDeterministicSuccess(repository, ownerId, `${suffix}x`);
    const draft = makeDraft({ ownerId, ...seeded });
    const inputRevisionRefs = [
      {
        fragmentRef: ref('fragment', seeded.fragment.id),
        sourceRevision: draft.sourceRevision,
      },
      {
        fragmentRef: ref('fragment', external.fragment.id),
        sourceRevision: {
          bucket: external.fragment.storage.bucket,
          objectName: external.fragment.storage.originalPath,
          generation: external.fragment.storage.generation,
          inputHash: external.fragment.hashes.sha256,
        },
      },
    ].sort((left, right) => left.fragmentRef.id.localeCompare(right.fragmentRef.id));
    const cohort = makeRoutingCohort({
      ownerId,
      memberRefs: [
        ref('fragment', seeded.fragment.id),
        ref('fragment', external.fragment.id),
      ].sort((left, right) => left.id.localeCompare(right.id)),
      representativeRefs: [ref('fragment', seeded.fragment.id)],
      inputRevisionRefs,
    });
    await repository.saveRoutingDraft(ownerId, { routePlan: draft });
    const result = await repository.commitRoutingApproval(ownerId, {
      ...approval(seeded.batch.id, draft.id),
      cohorts: [cohort],
    });
    assert.deepEqual(result.cohorts, [cohort]);

    const otherCohort = { ...cohort, id: 'cohort_other001', ownerId: 'user_other0001' };
    await assert.rejects(
      () => repository.commitRoutingApproval(ownerId, {
        ...approval(seeded.batch.id, draft.id),
        cohorts: [otherCohort],
      }),
      { code: 'repository/owner-mismatch' },
    );
  });
}
