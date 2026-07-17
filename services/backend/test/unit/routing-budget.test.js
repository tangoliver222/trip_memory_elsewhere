import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBudgetLedger,
  parseBudgetReservation,
} from '../../src/domain/routing-execution.js';
import { parseRoutePlan } from '../../src/domain/route-plan.js';
import {
  ROUTING_BUDGET_POLICY_V1,
  ROUTING_COST_MODEL_V1,
  releaseReservation,
  reserveRoutePlanBudget,
  settleReservation,
} from '../../src/routing/budget.js';
import * as routingBudget from '../../src/routing/budget.js';
import { makeBudgetLedgerId } from '../../src/routing/identity.js';
import {
  makeBudgetLedger,
  makeRoutePlan,
} from '../fixtures/routing.js';

const NOW = '2026-07-17T12:00:00.000Z';
const CAPABILITIES = ['ocr', 'places', 'embedding', 'gemini'];
const EXECUTOR_CLASSES = {
  ocr: 'document-ocr',
  places: 'places-resolution',
  embedding: 'multimodal-embedding',
  gemini: 'gemini-multimodal',
};

function intent(decision, capability, overrides = {}) {
  const base = {
    decision,
    executorClass: decision === 'approve' ? EXECUTOR_CLASSES[capability] : null,
    scope: 'self',
    reasonCodes: [`${capability}-policy`],
    reconsiderOn: decision === 'defer' ? ['policy-change'] : [],
  };
  return { ...base, ...overrides };
}

function makeDraftPlan({
  id = 'route_12345678',
  capabilities = {},
  policyVersion = 'v1',
  costModelVersion = 'v1',
} = {}) {
  const base = makeRoutePlan();
  return {
    ...base,
    id,
    state: 'draft',
    router: {
      ...base.router,
      policyVersion,
      costModelVersion,
    },
    capabilities: Object.fromEntries(CAPABILITIES.map((capability) => [
      capability,
      capabilities[capability] ?? intent('skip', capability),
    ])),
    approvedAt: null,
    budgetClass: Object.values(capabilities)
      .some(({ decision }) => decision === 'approve')
      ? 'standard'
      : 'deterministic_only',
  };
}

function reserve(plan, overrides = {}) {
  return reserveRoutePlanBudget({
    ownerId: 'user_alpha',
    batchId: 'batch_12345678',
    routePlan: plan,
    ledgers: [],
    now: NOW,
    ...overrides,
  });
}

function makeBlockingLedger({ type, plan, capability = 'embedding' }) {
  const costs = ROUTING_COST_MODEL_V1.capabilities[capability];
  const definitions = {
    user_day: {
      scope: { type, key: '2026-07-17' },
      ceilingMicros: ROUTING_BUDGET_POLICY_V1.userUtcDayCeilingMicros,
    },
    batch: {
      scope: { type, key: 'batch_12345678' },
      ceilingMicros: ROUTING_BUDGET_POLICY_V1.batchCeilingMicros,
    },
    route: {
      scope: { type, key: plan.id },
      ceilingMicros: ROUTING_BUDGET_POLICY_V1.routeCeilingMicros,
    },
    capability: {
      scope: { type, key: capability, routePlanId: plan.id },
      ceilingMicros: costs.ceilingMicros,
    },
  };
  const definition = definitions[type];
  return makeBudgetLedger({
    id: makeBudgetLedgerId({ ownerId: 'user_alpha', ...definition.scope }),
    scope: definition.scope,
    ceilingMicros: definition.ceilingMicros,
    reservedMicros: definition.ceilingMicros - costs.ceilingMicros + 1,
    spentMicros: 0,
  });
}

test('budget and cost constants are exact deeply frozen admission policy', () => {
  assert.deepEqual(ROUTING_BUDGET_POLICY_V1, {
    name: 'authoritative-routing-budget',
    version: 'v1',
    currency: 'USD',
    userUtcDayCeilingMicros: 2_000_000,
    batchCeilingMicros: 1_000_000,
    routeCeilingMicros: 200_000,
  });
  assert.deepEqual(ROUTING_COST_MODEL_V1, {
    name: 'routing-admission-costs',
    version: 'v1',
    capabilities: {
      ocr: { estimatedMicros: 20_000, ceilingMicros: 100_000, maxBillableAttempts: 1 },
      places: { estimatedMicros: 10_000, ceilingMicros: 50_000, maxBillableAttempts: 1 },
      embedding: { estimatedMicros: 1_000, ceilingMicros: 5_000, maxBillableAttempts: 1 },
      gemini: { estimatedMicros: 25_000, ceilingMicros: 100_000, maxBillableAttempts: 1 },
    },
  });
  assert.equal(Object.isFrozen(ROUTING_BUDGET_POLICY_V1), true);
  assert.equal(Object.isFrozen(ROUTING_COST_MODEL_V1.capabilities.gemini), true);
  assert.deepEqual(routingBudget.ROUTING_COST_MODEL_V2, {
    name: 'routing-admission-costs',
    version: 'v2',
    capabilities: {
      ocr: { estimatedMicros: 1_500, ceilingMicros: 1_500, maxBillableAttempts: 1 },
      places: { estimatedMicros: 10_000, ceilingMicros: 50_000, maxBillableAttempts: 1 },
      embedding: { estimatedMicros: 1_000, ceilingMicros: 5_000, maxBillableAttempts: 1 },
      gemini: { estimatedMicros: 25_000, ceilingMicros: 100_000, maxBillableAttempts: 1 },
    },
  });
  assert.equal(Object.isFrozen(routingBudget.ROUTING_COST_MODEL_V2.capabilities.ocr), true);
});

test('v2 route reserves exactly one bounded OCR image page while v1 remains valid', () => {
  const result = reserve(makeDraftPlan({
    policyVersion: 'v2',
    costModelVersion: 'v2',
    capabilities: { ocr: intent('approve', 'ocr') },
  }));

  assert.equal(result.reservations.length, 1);
  assert.deepEqual({
    estimatedCostMicros: result.reservations[0].estimatedCostMicros,
    ceilingMicros: result.reservations[0].ceilingMicros,
    maxBillableAttempts: result.reservations[0].maxBillableAttempts,
    costModelVersion: result.reservations[0].costModelVersion,
  }, {
    estimatedCostMicros: 1_500,
    ceilingMicros: 1_500,
    maxBillableAttempts: 1,
    costModelVersion: 'v2',
  });
  assert.equal(result.ledgers.every(({ policyVersion }) => policyVersion === 'v2'), true);
});

test('only approve intents receive reservations and all decisions become persisted vocabulary', () => {
  const plan = makeDraftPlan({
    capabilities: {
      ocr: intent('approve', 'ocr'),
      places: intent('skip', 'places'),
      embedding: intent('block', 'embedding'),
      gemini: intent('defer', 'gemini'),
    },
  });
  const result = reserve(plan);

  assert.deepEqual(Object.keys(result).sort(), [
    'blockedCapabilities',
    'ledgers',
    'reservations',
    'routePlan',
  ]);
  assert.deepEqual(result.reservations.map(({ capability }) => capability), ['ocr']);
  assert.deepEqual(result.blockedCapabilities, []);
  assert.equal(result.routePlan.capabilities.ocr.decision, 'approved');
  assert.equal(result.routePlan.capabilities.places.decision, 'skipped');
  assert.equal(result.routePlan.capabilities.embedding.decision, 'blocked');
  assert.equal(result.routePlan.capabilities.gemini.decision, 'deferred');
  assert.deepEqual(result.routePlan.capabilities.gemini.reconsiderOn, ['policy-change']);
  assert.equal(result.routePlan.state, 'approved');
  assert.equal(result.routePlan.approvedAt, NOW);
  assert.equal(result.routePlan.budgetClass, 'standard');
  assert.deepEqual(parseRoutePlan(result.routePlan), result.routePlan);
  assert.equal(result.ledgers.length, 4);
  for (const reservation of result.reservations) {
    assert.deepEqual(parseBudgetReservation(reservation), reservation);
    assert.equal(reservation.ledgerRefs.length, 4);
  }
  for (const ledger of result.ledgers) {
    assert.deepEqual(parseBudgetLedger(ledger), ledger);
  }
});

test('each aggregate or capability ceiling independently blocks only that capability', () => {
  for (const type of ['user_day', 'batch', 'route', 'capability']) {
    const plan = makeDraftPlan({
      capabilities: { embedding: intent('approve', 'embedding') },
    });
    const result = reserve(plan, {
      ledgers: [makeBlockingLedger({ type, plan })],
    });

    assert.deepEqual(result.reservations, [], type);
    assert.deepEqual(result.blockedCapabilities, ['embedding'], type);
    assert.deepEqual(result.routePlan.capabilities.embedding, {
      decision: 'blocked',
      executorClass: null,
      scope: 'self',
      reasonCodes: ['budget-limit'],
      budget: null,
    }, type);
    assert.equal(result.routePlan.budgetClass, 'deterministic_only', type);
    assert.equal(result.routePlan.state, 'approved', type);
  }
});

test('sequential reservations preserve every ceiling', () => {
  const first = reserve(makeDraftPlan({
    capabilities: { embedding: intent('approve', 'embedding') },
  }));
  const second = reserve(makeDraftPlan({
    id: 'route_87654321',
    capabilities: { embedding: intent('approve', 'embedding') },
  }), { ledgers: first.ledgers });

  assert.equal(second.reservations.length, 1);
  assert.ok(second.ledgers.every((ledger) => (
    ledger.reservedMicros + ledger.spentMicros <= ledger.ceilingMicros
  )));
  const userLedger = second.ledgers.find(({ scope }) => scope.type === 'user_day');
  const batchLedger = second.ledgers.find(({ scope }) => scope.type === 'batch');
  assert.equal(userLedger.reservedMicros, 10_000);
  assert.equal(batchLedger.reservedMicros, 10_000);
});

test('settlement releases full ceiling and charges actual cost exactly once', () => {
  const admitted = reserve(makeDraftPlan({
    capabilities: { embedding: intent('approve', 'embedding') },
  }));
  const reservation = admitted.reservations[0];
  const settled = settleReservation({
    reservation,
    ledgers: admitted.ledgers,
    actualCostMicros: 800,
    now: '2026-07-17T12:01:00.000Z',
  });

  assert.equal(settled.duplicate, false);
  assert.equal(settled.reservation.state, 'settled');
  assert.equal(settled.reservation.actualCostMicros, 800);
  assert.equal(settled.reservation.settledAt, '2026-07-17T12:01:00.000Z');
  for (const ledger of settled.ledgers) {
    assert.equal(ledger.reservedMicros, 0);
    assert.equal(ledger.spentMicros, 800);
  }

  const duplicate = settleReservation({
    reservation: settled.reservation,
    ledgers: settled.ledgers,
    actualCostMicros: 800,
    now: '2026-07-17T12:02:00.000Z',
  });
  assert.equal(duplicate.duplicate, true);
  assert.deepEqual(duplicate.reservation, settled.reservation);
  assert.deepEqual(duplicate.ledgers, settled.ledgers);
  assert.throws(() => settleReservation({
    reservation: settled.reservation,
    ledgers: settled.ledgers,
    actualCostMicros: 801,
    now: '2026-07-17T12:02:00.000Z',
  }), (error) => error.code === 'routing/budget-conflict');
  assert.throws(() => settleReservation({
    reservation,
    ledgers: admitted.ledgers,
    actualCostMicros: 5_001,
    now: '2026-07-17T12:01:00.000Z',
  }), (error) => error.code === 'routing/budget-invalid');
});

test('release subtracts reserved ceiling without adding spend and is idempotent', () => {
  const admitted = reserve(makeDraftPlan({
    capabilities: { embedding: intent('approve', 'embedding') },
  }));
  const released = releaseReservation({
    reservation: admitted.reservations[0],
    ledgers: admitted.ledgers,
    now: '2026-07-17T12:01:00.000Z',
    reasonCode: 'executor-cancelled',
  });

  assert.equal(released.duplicate, false);
  assert.equal(released.reservation.state, 'released');
  assert.equal(released.reservation.releaseReasonCode, 'executor-cancelled');
  assert.ok(released.ledgers.every((ledger) => (
    ledger.reservedMicros === 0 && ledger.spentMicros === 0
  )));
  const duplicate = releaseReservation({
    reservation: released.reservation,
    ledgers: released.ledgers,
    now: '2026-07-17T12:02:00.000Z',
    reasonCode: 'executor-cancelled',
  });
  assert.equal(duplicate.duplicate, true);
  assert.throws(() => releaseReservation({
    reservation: released.reservation,
    ledgers: released.ledgers,
    now: '2026-07-17T12:02:00.000Z',
    reasonCode: 'policy-changed',
  }), (error) => error.code === 'routing/budget-conflict');
});

test('UTC day ledger identity is stable within a day and changes at midnight', () => {
  const plan = makeDraftPlan({
    capabilities: { embedding: intent('approve', 'embedding') },
  });
  const idAt = (now) => reserve(plan, { now }).ledgers
    .find(({ scope }) => scope.type === 'user_day').id;

  assert.equal(
    idAt('2026-07-17T00:00:00.000Z'),
    idAt('2026-07-17T23:59:59.999Z'),
  );
  assert.notEqual(
    idAt('2026-07-17T23:59:59.999Z'),
    idAt('2026-07-18T00:00:00.000Z'),
  );
});

test('budget reducers reject unsafe micros and incomplete ledger sets', () => {
  const admitted = reserve(makeDraftPlan({
    capabilities: { embedding: intent('approve', 'embedding') },
  }));
  assert.throws(() => settleReservation({
    reservation: admitted.reservations[0],
    ledgers: admitted.ledgers,
    actualCostMicros: Number.MAX_SAFE_INTEGER + 1,
    now: NOW,
  }), (error) => error.code === 'routing/budget-invalid');
  assert.throws(() => settleReservation({
    reservation: admitted.reservations[0],
    ledgers: admitted.ledgers.slice(1),
    actualCostMicros: 800,
    now: NOW,
  }), (error) => error.code === 'routing/budget-invalid');
});
