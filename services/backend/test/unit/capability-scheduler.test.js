import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityScheduler } from '../../src/capabilities/scheduler.js';
import { makeCapabilityIdentity } from '../../src/capabilities/identity.js';

const NOW = '2026-07-17T13:00:00.000Z';
const OWNER_ID = 'user_scheduler';
const BATCH_ID = 'batch_scheduler';
const PROVIDER = 'document-ai-enterprise-ocr';
const PROVIDER_VERSION = 'processor-v1';
const ref = (type, id) => ({ type, id });

function source(fragmentId, generation = '1740000000000001') {
  return {
    bucket: 'demo-elsewhere.appspot.com',
    objectName: `users/${OWNER_ID}/originals/${BATCH_ID}/${fragmentId}`,
    generation,
    inputHash: fragmentId.endsWith('a') ? 'a'.repeat(64) : 'b'.repeat(64),
  };
}

function plan(fragmentId, overrides = {}) {
  const id = overrides.id ?? `route_${fragmentId}`;
  return {
    id,
    ownerId: OWNER_ID,
    createdAt: NOW,
    approvedAt: NOW,
    revision: 1,
    state: 'approved',
    fragmentRef: ref('fragment', fragmentId),
    sourceRevision: source(fragmentId),
    router: {
      name: 'fragment-routing',
      version: 'v1',
      policyVersion: 'v2',
      costModelVersion: 'v2',
    },
    representation: {
      role: 'independent',
      representativeRef: ref('fragment', fragmentId),
    },
    capabilities: {
      ocr: {
        decision: 'approved',
        executorClass: 'document-ocr',
      },
    },
    ...overrides,
  };
}

function head(routePlan) {
  return {
    fragmentRef: routePlan.fragmentRef,
    currentPlanRef: ref('routePlan', routePlan.id),
    currentRevision: routePlan.revision,
    sourceRevision: routePlan.sourceRevision,
  };
}

function reservation(routePlan) {
  return {
    id: `reserve_${routePlan.fragmentRef.id}`,
    routePlanRef: ref('routePlan', routePlan.id),
    capability: 'ocr',
  };
}

function createHarness(snapshot) {
  const calls = [];
  const repository = {
    async loadRoutingSnapshot(uid, input) {
      calls.push(['load', uid, input]);
      return snapshot;
    },
    async prepareCapabilityExecution(uid, input) {
      calls.push(['prepare', uid, input]);
      return { outcome: 'created', execution: input.execution };
    },
    async markCapabilityQueued(uid, input) {
      calls.push(['queued', uid, input]);
      return { outcome: 'applied' };
    },
  };
  const dispatcher = {
    async enqueueOcrTask(input) {
      calls.push(['dispatch', input]);
      return { outcome: 'created' };
    },
  };
  return {
    calls,
    scheduler: createCapabilityScheduler({
      repository,
      dispatcher,
      providerVersion: PROVIDER_VERSION,
      clock: () => NOW,
    }),
  };
}

test('schedules current approved OCR plans in stable Fragment order with references only', async () => {
  const planB = plan('fragment_b');
  const planA = plan('fragment_a');
  const { scheduler, calls } = createHarness({
    routePlans: [planB, planA],
    routingHeads: [head(planB), head(planA)],
    budgetReservations: [reservation(planB), reservation(planA)],
    capabilityExecutions: [],
  });

  assert.deepEqual(await scheduler.handle({ uid: OWNER_ID, batchId: BATCH_ID }), {
    outcome: 'queued',
    queued: 2,
  });
  const dispatched = calls.filter(([name]) => name === 'dispatch').map(([, input]) => input);
  const identities = [planA, planB].map((routePlan) => makeCapabilityIdentity({
    ownerId: OWNER_ID,
    fragmentId: routePlan.fragmentRef.id,
    sourceRevision: routePlan.sourceRevision,
    routePlanRevision: routePlan.revision,
    capability: 'ocr',
    provider: PROVIDER,
    providerVersion: PROVIDER_VERSION,
  }));
  assert.deepEqual(dispatched, identities.map((identity, index) => ({
    taskName: identity.taskName,
    payload: {
      capabilityExecutionId: identity.executionId,
      ownerId: OWNER_ID,
      routePlanId: [planA, planB][index].id,
      routePlanRevision: 1,
    },
  })));
  assert.deepEqual(
    calls.filter(([name]) => name === 'prepare').map(([, , input]) => (
      input.execution.fragmentRef.id
    )),
    ['fragment_a', 'fragment_b'],
  );
  assert.ok(calls.filter(([name]) => name === 'prepare').every(([, , input]) => (
    input.execution.state === 'reserved' && input.execution.billableAttempts === 0
  )));
});

test('skips stale supporting non-approved non-v2 and already queued work', async () => {
  const eligible = plan('fragment_a');
  const stale = plan('fragment_b', { id: 'route_stale0001' });
  const current = plan('fragment_b', {
    id: 'route_current01',
    capabilities: { ocr: { decision: 'deferred', executorClass: null } },
  });
  const supporting = plan('fragment_c', {
    representation: {
      role: 'supporting',
      representativeRef: ref('fragment', 'fragment_a'),
    },
  });
  const skipped = plan('fragment_d', {
    capabilities: { ocr: { decision: 'skipped', executorClass: null } },
  });
  const blocked = plan('fragment_e', {
    capabilities: { ocr: { decision: 'blocked', executorClass: null } },
  });
  const oldPolicy = plan('fragment_f', {
    router: { ...eligible.router, policyVersion: 'v1', costModelVersion: 'v1' },
  });
  const existingIdentity = makeCapabilityIdentity({
    ownerId: OWNER_ID,
    fragmentId: eligible.fragmentRef.id,
    sourceRevision: eligible.sourceRevision,
    routePlanRevision: 1,
    capability: 'ocr',
    provider: PROVIDER,
    providerVersion: PROVIDER_VERSION,
  });
  const plans = [stale, current, supporting, skipped, blocked, oldPolicy, eligible];
  const { scheduler, calls } = createHarness({
    routePlans: plans,
    routingHeads: [current, supporting, skipped, blocked, oldPolicy, eligible].map(head),
    budgetReservations: plans.map(reservation),
    capabilityExecutions: [{ id: existingIdentity.executionId, state: 'queued' }],
  });

  assert.deepEqual(await scheduler.handle({ uid: OWNER_ID, batchId: BATCH_ID }), {
    outcome: 'terminal_noop',
    queued: 0,
  });
  assert.equal(calls.some(([name]) => name === 'dispatch'), false);
  assert.equal(calls.some(([name]) => name === 'prepare'), false);
});

test('dispatch failure leaves the prepared execution reserved and is retryable', async () => {
  const routePlan = plan('fragment_a');
  const { calls } = createHarness({
    routePlans: [routePlan],
    routingHeads: [head(routePlan)],
    budgetReservations: [reservation(routePlan)],
    capabilityExecutions: [],
  });
  const failing = createCapabilityScheduler({
    repository: {
      async loadRoutingSnapshot() {
        return {
          routePlans: [routePlan],
          routingHeads: [head(routePlan)],
          budgetReservations: [reservation(routePlan)],
          capabilityExecutions: [],
        };
      },
      async prepareCapabilityExecution(uid, input) {
        calls.push(['prepare', uid, input]);
        return { outcome: 'created', execution: input.execution };
      },
      async markCapabilityQueued() {
        calls.push(['queued']);
      },
    },
    dispatcher: {
      async enqueueOcrTask() {
        throw new Error('private transport detail');
      },
    },
    providerVersion: PROVIDER_VERSION,
    clock: () => NOW,
  });

  await assert.rejects(
    () => failing.handle({ uid: OWNER_ID, batchId: BATCH_ID }),
    { code: 'capability/dispatch-unavailable', retryable: true },
  );
  assert.equal(calls.filter(([name]) => name === 'prepare').length, 1);
  assert.equal(calls.some(([name]) => name === 'queued'), false);
});

test('constructor and event boundaries reject incomplete or forged inputs', async () => {
  const emptySnapshot = {
    routePlans: [], routingHeads: [], budgetReservations: [], capabilityExecutions: [],
  };
  const { scheduler } = createHarness(emptySnapshot);
  await assert.rejects(
    () => scheduler.handle({ uid: OWNER_ID, batchId: BATCH_ID, fragmentId: 'forged_12345678' }),
    TypeError,
  );
  assert.throws(() => createCapabilityScheduler({
    repository: {},
    dispatcher: { enqueueOcrTask() {} },
    providerVersion: PROVIDER_VERSION,
    clock: () => NOW,
  }), TypeError);
});
