import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudOcrCoordinator } from '../../src/demo/cloud-ocr-coordinator.js';

const OWNER_ID = 'user_coordinator';
const BATCH_ID = 'batch_coordinator';
const ref = (type, id) => ({ type, id });

function source(fragmentId) {
  return {
    bucket: 'elsewhere-memory-tyx-2026.firebasestorage.app',
    objectName: `users/${OWNER_ID}/originals/${BATCH_ID}/${fragmentId}`,
    generation: '1740000000000001',
    inputHash: fragmentId.endsWith('a') ? 'a'.repeat(64) : 'b'.repeat(64),
  };
}

function plan(fragmentId, overrides = {}) {
  const id = overrides.id ?? `route_${fragmentId}`;
  return {
    id,
    revision: 1,
    state: 'approved',
    fragmentRef: ref('fragment', fragmentId),
    sourceRevision: source(fragmentId),
    representation: {
      role: 'independent',
      representativeRef: ref('fragment', fragmentId),
    },
    capabilities: {
      ocr: { decision: 'approved', executorClass: 'document-ocr' },
    },
    ...overrides,
  };
}

function head(routePlan) {
  return {
    currentPlanRef: ref('routePlan', routePlan.id),
    currentRevision: routePlan.revision,
    fragmentRef: routePlan.fragmentRef,
    sourceRevision: routePlan.sourceRevision,
  };
}

function execution(routePlan, id, overrides = {}) {
  return {
    id,
    ownerId: OWNER_ID,
    routePlanRef: ref('routePlan', routePlan.id),
    routePlanRevision: routePlan.revision,
    fragmentRef: routePlan.fragmentRef,
    sourceRevision: routePlan.sourceRevision,
    capability: 'ocr',
    state: 'queued',
    ...overrides,
  };
}

test('runs current queued approved OCR work including a supporting receipt', async () => {
  const routeB = plan('fragment_b');
  const routeA = plan('fragment_a');
  const supportingReceipt = plan('fragment_supporting', {
    representation: {
      role: 'supporting',
      representativeRef: ref('fragment', 'fragment_a'),
    },
  });
  const skippedSupportingPhoto = plan('fragment_skipped', {
    representation: {
      role: 'supporting',
      representativeRef: ref('fragment', 'fragment_a'),
    },
    capabilities: { ocr: { decision: 'skipped', executorClass: null } },
  });
  const stale = plan('fragment_stale', { id: 'route_stale0001' });
  const currentForStale = plan('fragment_stale', { id: 'route_current01' });
  const deferred = plan('fragment_deferred', {
    capabilities: { ocr: { decision: 'deferred', executorClass: null } },
  });
  const before = {
    routePlans: [routeB, supportingReceipt, skippedSupportingPhoto, stale, deferred, currentForStale, routeA],
    routingHeads: [routeA, routeB, supportingReceipt, skippedSupportingPhoto, currentForStale, deferred].map(head),
    capabilityExecutions: [
      execution(routeB, 'execution_b0000001'),
      execution(routeA, 'execution_a0000001'),
      execution(supportingReceipt, 'execution_support1'),
      execution(skippedSupportingPhoto, 'execution_skipped1'),
      execution(stale, 'execution_stale001'),
      execution(deferred, 'execution_defer001'),
      execution(routeA, 'execution_done0001', { state: 'completed' }),
    ],
  };
  const after = {
    ...before,
    capabilityExecutions: before.capabilityExecutions.map((value) => (
      ['execution_a0000001', 'execution_b0000001', 'execution_support1'].includes(value.id)
        ? { ...value, state: 'completed' }
        : value
    )),
  };
  const calls = [];
  let loads = 0;
  const coordinator = createCloudOcrCoordinator({
    repository: {
      async loadRoutingSnapshot(uid, input) {
        calls.push(['load', uid, input]);
        loads += 1;
        return loads === 1 ? before : after;
      },
    },
    worker: {
      async handle(task) {
        calls.push(['worker', task]);
        return { outcome: task.capabilityExecutionId.includes('_a') ? 'completed' : 'insufficient_input', retryable: false };
      },
    },
  });

  assert.deepEqual(await coordinator.handle({ uid: OWNER_ID, batchId: BATCH_ID }), {
    outcome: 'completed',
    executed: 3,
  });
  assert.deepEqual(calls.filter(([name]) => name === 'worker').map(([, task]) => task), [
    {
      capabilityExecutionId: 'execution_a0000001',
      ownerId: OWNER_ID,
      routePlanId: routeA.id,
      routePlanRevision: 1,
      taskDeliveryCount: 0,
    },
    {
      capabilityExecutionId: 'execution_b0000001',
      ownerId: OWNER_ID,
      routePlanId: routeB.id,
      routePlanRevision: 1,
      taskDeliveryCount: 0,
    },
    {
      capabilityExecutionId: 'execution_support1',
      ownerId: OWNER_ID,
      routePlanId: supportingReceipt.id,
      routePlanRevision: 1,
      taskDeliveryCount: 0,
    },
  ]);
  assert.equal(calls.filter(([name]) => name === 'load').length, 2);
});

test('missing, repeated, stale, and terminal inputs are no-ops', async () => {
  for (const snapshot of [null, {
    routePlans: [],
    routingHeads: [],
    capabilityExecutions: [],
  }]) {
    let workerCalls = 0;
    const coordinator = createCloudOcrCoordinator({
      repository: { async loadRoutingSnapshot() { return snapshot; } },
      worker: { async handle() { workerCalls += 1; } },
    });
    assert.deepEqual(await coordinator.handle({ uid: OWNER_ID, batchId: BATCH_ID }), {
      outcome: 'terminal_noop',
      executed: 0,
    });
    assert.equal(workerCalls, 0);
  }
});

test('retryable work and missing persisted terminal state fail safely', async () => {
  const routePlan = plan('fragment_a');
  const queued = execution(routePlan, 'execution_a0000001');
  const snapshot = {
    routePlans: [routePlan],
    routingHeads: [head(routePlan)],
    capabilityExecutions: [queued],
  };

  const retryable = createCloudOcrCoordinator({
    repository: { async loadRoutingSnapshot() { return snapshot; } },
    worker: { async handle() { return { outcome: 'failed_retryable', retryable: true }; } },
  });
  await assert.rejects(
    () => retryable.handle({ uid: OWNER_ID, batchId: BATCH_ID }),
    { code: 'capability/repository-unavailable', retryable: true },
  );

  const notPersisted = createCloudOcrCoordinator({
    repository: { async loadRoutingSnapshot() { return snapshot; } },
    worker: { async handle() { return { outcome: 'completed', retryable: false }; } },
  });
  await assert.rejects(
    () => notPersisted.handle({ uid: OWNER_ID, batchId: BATCH_ID }),
    { code: 'capability/repository-unavailable', retryable: true },
  );
});

test('constructor and request boundary reject incomplete or forged values', async () => {
  assert.throws(() => createCloudOcrCoordinator({ repository: {}, worker: {} }), TypeError);
  const coordinator = createCloudOcrCoordinator({
    repository: { async loadRoutingSnapshot() { return null; } },
    worker: { async handle() {} },
  });
  await assert.rejects(
    () => coordinator.handle({ uid: OWNER_ID, batchId: BATCH_ID, executionId: 'forged_execution' }),
    TypeError,
  );
});
