import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPABILITY_DECISIONS,
  ROUTE_PLAN_STATES,
  parseRoutePlan,
  parseRoutingHead,
  routePlanImmutablePayload,
} from '../../src/domain/route-plan.js';
import {
  ROUTING_ROLES,
  parseRoutingCohort,
} from '../../src/domain/routing-cohort.js';
import {
  parseBudgetLedger,
  parseBudgetReservation,
  parseCapabilityExecution,
  parseEscalationRequest,
} from '../../src/domain/routing-execution.js';
import { parseImportBatch } from '../../src/domain/import-batch.js';
import {
  makeBatchWithRoutingSummary,
  makeBudgetLedger,
  makeBudgetReservation,
  makeCapabilityDecision,
  makeCapabilityExecution,
  makeEscalationRequest,
  makeRoutePlan,
  makeRoutingCohort,
  makeRoutingHead,
  makeRoutingSummary,
} from '../fixtures/routing.js';

test('routing enums use the frozen authoritative vocabulary', () => {
  assert.deepEqual(ROUTE_PLAN_STATES, [
    'draft',
    'approved',
    'executing',
    'completed',
    'superseded',
    'rejected',
  ]);
  assert.deepEqual(CAPABILITY_DECISIONS, [
    'approved',
    'skipped',
    'deferred',
    'blocked',
  ]);
  assert.deepEqual(ROUTING_ROLES, [
    'independent',
    'representative',
    'supporting',
  ]);
});

test('route plan accepts one strict current approved plan', () => {
  const plan = makeRoutePlan();
  assert.deepEqual(parseRoutePlan(plan), plan);
  assert.deepEqual(parseRoutingHead(makeRoutingHead()), makeRoutingHead());
});

test('route plan rejects duplicate needs flags and unknown fields', () => {
  for (const field of [
    'needsAI',
    'needsOCR',
    'needsPlaces',
    'needsEmbedding',
    'needsGemini',
    'unexpected',
  ]) {
    assert.throws(() => parseRoutePlan(makeRoutePlan({ [field]: true })), field);
  }
});

test('capability decisions bind budgets and reconsider events to their states', () => {
  const invalidEmbeddingDecisions = [
    makeCapabilityDecision('approved', { budget: null }),
    makeCapabilityDecision('skipped', {
      budget: {
        class: 'standard',
        currency: 'USD',
        estimatedMicros: 1,
        ceilingMicros: 2,
        maxBillableAttempts: 1,
      },
    }),
    makeCapabilityDecision('blocked', {
      budget: {
        class: 'standard',
        currency: 'USD',
        estimatedMicros: 1,
        ceilingMicros: 2,
        maxBillableAttempts: 1,
      },
    }),
    makeCapabilityDecision('deferred', { reconsiderOn: [] }),
  ];
  for (const embedding of invalidEmbeddingDecisions) {
    assert.throws(() => parseRoutePlan(makeRoutePlan({
      capabilities: { ...makeRoutePlan().capabilities, embedding },
    })));
  }
});

test('approved capability requires an input hash while deterministic-only plan may omit it', () => {
  assert.throws(() => parseRoutePlan(makeRoutePlan({
    sourceRevision: { ...makeRoutePlan().sourceRevision, inputHash: null },
  })));

  const capabilities = Object.fromEntries(
    Object.keys(makeRoutePlan().capabilities).map((capability) => [
      capability,
      makeCapabilityDecision('blocked', { reasonCodes: ['invalid-media'] }),
    ]),
  );
  const deterministicOnly = makeRoutePlan({
    sourceRevision: { ...makeRoutePlan().sourceRevision, inputHash: null },
    state: 'completed',
    capabilities,
    budgetClass: 'deterministic_only',
    approvedAt: '2026-07-16T00:00:00.000Z',
    completedAt: '2026-07-16T00:00:00.000Z',
  });
  assert.deepEqual(parseRoutePlan(deterministicOnly), deterministicOnly);
});

test('approved immutable payload excludes lifecycle fields and is deeply frozen', () => {
  const plan = makeRoutePlan();
  const projection = routePlanImmutablePayload(plan);
  for (const field of [
    'state',
    'createdAt',
    'updatedAt',
    'approvedAt',
    'completedAt',
    'supersededAt',
    'rejectedAt',
  ]) {
    assert.equal(Object.hasOwn(projection, field), false, field);
  }
  assert.equal(Object.isFrozen(projection), true);
  assert.equal(Object.isFrozen(projection.capabilities), true);
  assert.equal(projection.sourceRevision.generation, plan.sourceRevision.generation);
});

test('routing cohort is sorted bounded and keeps a valid representative', () => {
  const cohort = makeRoutingCohort();
  assert.deepEqual(parseRoutingCohort(cohort), cohort);
  assert.throws(() => parseRoutingCohort(makeRoutingCohort({
    memberRefs: [...cohort.memberRefs].reverse(),
  })));
  assert.throws(() => parseRoutingCohort(makeRoutingCohort({
    memberRefs: Array.from({ length: 201 }, (_, index) => ({
      type: 'fragment',
      id: `frag_${String(index).padStart(8, '0')}`,
    })),
  })));
  assert.throws(() => parseRoutePlan(makeRoutePlan({
    representation: {
      ...makeRoutePlan().representation,
      role: 'supporting',
      representativeRef: makeRoutePlan().fragmentRef,
    },
  })));
});

test('route plan cohort references are unique and sorted by reference ID', () => {
  const representation = makeRoutePlan().representation;
  const first = { type: 'routingCohort', id: 'cohort_alpha001' };
  const second = { type: 'routingCohort', id: 'cohort_bravo001' };
  assert.doesNotThrow(() => parseRoutePlan(makeRoutePlan({
    representation: { ...representation, cohortRefs: [first, second] },
  })));
  assert.throws(() => parseRoutePlan(makeRoutePlan({
    representation: { ...representation, cohortRefs: [second, first] },
  })));
  assert.throws(() => parseRoutePlan(makeRoutePlan({
    representation: { ...representation, cohortRefs: [first, { ...first }] },
  })));
});

test('routing execution objects enforce micros and lifecycle fields', () => {
  assert.deepEqual(parseBudgetLedger(makeBudgetLedger()), makeBudgetLedger());
  assert.deepEqual(
    parseBudgetReservation(makeBudgetReservation()),
    makeBudgetReservation(),
  );
  assert.deepEqual(
    parseCapabilityExecution(makeCapabilityExecution()),
    makeCapabilityExecution(),
  );
  assert.deepEqual(
    parseEscalationRequest(makeEscalationRequest()),
    makeEscalationRequest(),
  );
  assert.throws(() => parseBudgetLedger(makeBudgetLedger({
    spentMicros: 2_000_001,
  })));
  assert.throws(() => parseBudgetReservation(makeBudgetReservation({
    estimatedCostMicros: 5_001,
  })));
  assert.throws(() => parseCapabilityExecution(makeCapabilityExecution({
    state: 'completed',
    completedAt: null,
  })));
  assert.throws(() => parseEscalationRequest(makeEscalationRequest({
    state: 'resolved',
    resolvedByPlanRef: null,
  })));
});

test('capability budget ledgers are isolated by route plan', () => {
  const capabilityLedger = makeBudgetLedger({
    scope: {
      type: 'capability',
      key: 'ocr',
      routePlanId: 'route_12345678',
    },
  });

  assert.deepEqual(parseBudgetLedger(capabilityLedger), capabilityLedger);
  assert.throws(() => parseBudgetLedger(makeBudgetLedger({
    scope: { type: 'capability', key: 'ocr' },
  })));
  assert.throws(() => parseBudgetLedger(makeBudgetLedger({
    scope: {
      type: 'route',
      key: 'route_12345678',
      routePlanId: 'route_12345678',
    },
  })));
});

test('routing summary partitions current eligible plans without changing batch state', () => {
  const batch = makeBatchWithRoutingSummary();
  assert.deepEqual(parseImportBatch(batch), batch);
  for (const routingSummary of [
    makeRoutingSummary({ drafting: 1 }),
    makeRoutingSummary({ approved: 0 }),
    makeRoutingSummary({ eligible: 0, approved: 1 }),
    makeRoutingSummary({ superseded: -1 }),
  ]) {
    assert.throws(() => parseImportBatch({ ...batch, routingSummary }));
  }

  const nullSummary = { ...batch, routingSummary: null };
  assert.deepEqual(parseImportBatch(nullSummary), nullSummary);
  assert.equal(parseImportBatch(batch).status, nullSummary.status);
  assert.deepEqual(parseImportBatch(batch).counters, nullSummary.counters);
});
