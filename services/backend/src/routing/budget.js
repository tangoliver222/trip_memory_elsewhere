import { IdSchema, IsoDateTimeSchema } from '../domain/common.js';
import { ROUTING_CAPABILITIES, parseRoutePlan } from '../domain/route-plan.js';
import {
  parseBudgetLedger,
  parseBudgetReservation,
} from '../domain/routing-execution.js';
import {
  makeBudgetLedgerId,
  makeBudgetReservationId,
} from './identity.js';

const REASON_CODE = /^[a-z0-9][a-z0-9-]{1,63}$/;
const INTENT_DECISIONS = new Set(['approve', 'skip', 'defer', 'block']);
const INTENT_KEYS = ['decision', 'executorClass', 'reasonCodes', 'reconsiderOn', 'scope'];

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const ROUTING_BUDGET_POLICY_V1 = deepFreeze({
  name: 'authoritative-routing-budget',
  version: 'v1',
  currency: 'USD',
  userUtcDayCeilingMicros: 2_000_000,
  batchCeilingMicros: 1_000_000,
  routeCeilingMicros: 200_000,
});

export const ROUTING_COST_MODEL_V1 = deepFreeze({
  name: 'routing-admission-costs',
  version: 'v1',
  capabilities: {
    ocr: { estimatedMicros: 20_000, ceilingMicros: 100_000, maxBillableAttempts: 1 },
    places: { estimatedMicros: 10_000, ceilingMicros: 50_000, maxBillableAttempts: 1 },
    embedding: { estimatedMicros: 1_000, ceilingMicros: 5_000, maxBillableAttempts: 1 },
    gemini: { estimatedMicros: 25_000, ceilingMicros: 100_000, maxBillableAttempts: 1 },
  },
});

export const ROUTING_BUDGET_POLICY_V2 = deepFreeze({
  ...ROUTING_BUDGET_POLICY_V1,
  version: 'v2',
});

export const ROUTING_COST_MODEL_V2 = deepFreeze({
  ...ROUTING_COST_MODEL_V1,
  version: 'v2',
  capabilities: {
    ...ROUTING_COST_MODEL_V1.capabilities,
    ocr: { estimatedMicros: 1_500, ceilingMicros: 1_500, maxBillableAttempts: 1 },
  },
});

export const ROUTING_BUDGET_POLICY_V3 = deepFreeze({
  ...ROUTING_BUDGET_POLICY_V2,
  version: 'v3',
});

export const ROUTING_COST_MODEL_V3 = deepFreeze({
  ...ROUTING_COST_MODEL_V2,
  version: 'v3',
});

const BUDGET_VERSIONS = new Map([
  ['v1:v1', { policy: ROUTING_BUDGET_POLICY_V1, costModel: ROUTING_COST_MODEL_V1 }],
  ['v2:v2', { policy: ROUTING_BUDGET_POLICY_V2, costModel: ROUTING_COST_MODEL_V2 }],
  ['v3:v3', { policy: ROUTING_BUDGET_POLICY_V3, costModel: ROUTING_COST_MODEL_V3 }],
]);

function budgetError(code, message) {
  const error = new Error(message);
  error.name = 'RoutingBudgetError';
  error.code = code;
  return error;
}

function invalid(message) {
  throw budgetError('routing/budget-invalid', message);
}

function conflict(message) {
  throw budgetError('routing/budget-conflict', message);
}

function parseNow(value) {
  const now = IsoDateTimeSchema.safeParse(value);
  if (!now.success) invalid('now is invalid');
  return now.data;
}

function safeMicros(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) invalid(`${name} is invalid`);
  return value;
}

function parseId(value, name) {
  const result = IdSchema.safeParse(value);
  if (!result.success) invalid(`${name} is invalid`);
  return result.data;
}

function safeAdd(left, right, name) {
  const result = left + right;
  if (!Number.isSafeInteger(result)) invalid(`${name} exceeds safe integer range`);
  return result;
}

function stableCodes(codes, name, { allowEmpty = false } = {}) {
  if (!Array.isArray(codes) || (!allowEmpty && codes.length === 0)
    || codes.some((code) => typeof code !== 'string' || !REASON_CODE.test(code))) {
    invalid(`${name} is invalid`);
  }
  const normalized = [...new Set(codes)].sort();
  if (normalized.length !== codes.length) invalid(`${name} must be unique`);
  return normalized;
}

function normalizeIntent(value, capability) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid(`${capability} intent is invalid`);
  }
  const keys = Object.keys(value).sort();
  if (keys.length !== INTENT_KEYS.length
    || keys.some((key, index) => key !== INTENT_KEYS[index])) {
    invalid(`${capability} intent fields are invalid`);
  }
  if (!INTENT_DECISIONS.has(value.decision)
    || !['self', 'representative', 'cohort'].includes(value.scope)) {
    invalid(`${capability} intent is invalid`);
  }
  const executorClass = value.executorClass;
  if ((value.decision === 'approve' && typeof executorClass !== 'string')
    || (value.decision !== 'approve' && executorClass !== null)) {
    invalid(`${capability} executor is invalid`);
  }
  const reconsiderOn = stableCodes(
    value.reconsiderOn,
    `${capability} reconsiderOn`,
    { allowEmpty: true },
  );
  if ((value.decision === 'defer') !== (reconsiderOn.length > 0)) {
    invalid(`${capability} reconsiderOn is invalid`);
  }
  return {
    decision: value.decision,
    executorClass,
    scope: value.scope,
    reasonCodes: stableCodes(value.reasonCodes, `${capability} reasonCodes`),
    reconsiderOn,
  };
}

function persistedDecision(intent, capability, admitted, costModel) {
  const common = { scope: intent.scope };
  if (intent.decision === 'approve' && admitted) {
    const cost = costModel.capabilities[capability];
    return {
      ...common,
      decision: 'approved',
      executorClass: intent.executorClass,
      reasonCodes: intent.reasonCodes,
      budget: {
        class: 'standard',
        currency: 'USD',
        estimatedMicros: cost.estimatedMicros,
        ceilingMicros: cost.ceilingMicros,
        maxBillableAttempts: cost.maxBillableAttempts,
      },
    };
  }
  if (intent.decision === 'approve') {
    return {
      ...common,
      decision: 'blocked',
      executorClass: null,
      reasonCodes: ['budget-limit'],
      budget: null,
    };
  }
  const persistedNames = {
    skip: 'skipped',
    defer: 'deferred',
    block: 'blocked',
  };
  const decision = {
    ...common,
    decision: persistedNames[intent.decision],
    executorClass: null,
    reasonCodes: intent.reasonCodes,
    budget: null,
  };
  if (intent.decision === 'defer') decision.reconsiderOn = intent.reconsiderOn;
  return decision;
}

function budgetVersionFor(routePlan) {
  const versions = BUDGET_VERSIONS.get(
    `${routePlan.router?.policyVersion}:${routePlan.router?.costModelVersion}`,
  );
  if (!versions) invalid('routePlan boundary is invalid');
  return versions;
}

function validateDraftPlan(routePlan, ownerId, batchId, intents, versions) {
  const validationCapabilities = Object.fromEntries(ROUTING_CAPABILITIES.map((capability) => [
    capability,
    persistedDecision(intents[capability], capability, false, versions.costModel),
  ]));
  const candidate = {
    ...routePlan,
    state: 'draft',
    capabilities: validationCapabilities,
    budgetClass: 'deterministic_only',
    approvedAt: null,
    completedAt: null,
    supersededAt: null,
    rejectedAt: null,
  };
  try {
    parseRoutePlan(candidate);
  } catch {
    invalid('routePlan is invalid');
  }
  if (routePlan.state !== 'draft'
    || routePlan.ownerId !== ownerId
    || routePlan.batchRef.id !== batchId) {
    invalid('routePlan boundary is invalid');
  }
}

function ledgerDefinitions({
  ownerId, batchId, routePlanId, capability, utcDay, policy, costModel,
}) {
  const cost = costModel.capabilities[capability];
  return [
    {
      scope: { type: 'user_day', key: utcDay },
      ceilingMicros: policy.userUtcDayCeilingMicros,
    },
    {
      scope: { type: 'batch', key: batchId },
      ceilingMicros: policy.batchCeilingMicros,
    },
    {
      scope: { type: 'route', key: routePlanId },
      ceilingMicros: policy.routeCeilingMicros,
    },
    {
      scope: { type: 'capability', key: capability, routePlanId },
      ceilingMicros: cost.ceilingMicros,
    },
  ].map((definition) => ({
    ...definition,
    id: makeBudgetLedgerId({ ownerId, ...definition.scope }),
  }));
}

function parseLedgers(inputs, ownerId) {
  if (!Array.isArray(inputs)) invalid('ledgers are invalid');
  const byId = new Map();
  for (const input of inputs) {
    let ledger;
    try {
      ledger = parseBudgetLedger(input);
    } catch {
      invalid('ledger is invalid');
    }
    if (ledger.ownerId !== ownerId || byId.has(ledger.id)) invalid('ledger set is invalid');
    byId.set(ledger.id, ledger);
  }
  return byId;
}

function resolveLedgers(byId, definitions, ownerId, now, versions) {
  return definitions.map((definition) => {
    const existing = byId.get(definition.id);
    if (!existing) {
      return {
        id: definition.id,
        ownerId,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        scope: definition.scope,
        currency: 'USD',
        ceilingMicros: definition.ceilingMicros,
        reservedMicros: 0,
        spentMicros: 0,
        policyVersion: versions.policy.version,
        costModelVersion: versions.costModel.version,
      };
    }
    if (JSON.stringify(existing.scope) !== JSON.stringify(definition.scope)
      || existing.ceilingMicros !== definition.ceilingMicros
      || existing.currency !== 'USD'
      || existing.policyVersion !== versions.policy.version
      || existing.costModelVersion !== versions.costModel.version) {
      invalid('ledger policy is invalid');
    }
    return existing;
  });
}

function canReserve(ledgers, ceilingMicros) {
  return ledgers.every((ledger) => (
    safeAdd(ledger.reservedMicros, ledger.spentMicros, 'ledger total')
      <= ledger.ceilingMicros - ceilingMicros
  ));
}

function replaceLedger(byId, ledger) {
  const parsed = parseBudgetLedger(ledger);
  byId.set(parsed.id, parsed);
  return parsed;
}

export function reserveRoutePlanBudget({
  ownerId: ownerInput,
  batchId: batchInput,
  routePlan,
  ledgers: ledgerInputs,
  now: nowInput,
} = {}) {
  const ownerId = parseId(ownerInput, 'ownerId');
  const batchId = parseId(batchInput, 'batchId');
  const now = parseNow(nowInput);
  if (!routePlan || typeof routePlan !== 'object' || Array.isArray(routePlan)) {
    invalid('routePlan is invalid');
  }
  const intents = Object.fromEntries(ROUTING_CAPABILITIES.map((capability) => [
    capability,
    normalizeIntent(routePlan.capabilities?.[capability], capability),
  ]));
  const versions = budgetVersionFor(routePlan);
  validateDraftPlan(routePlan, ownerId, batchId, intents, versions);
  const byId = parseLedgers(ledgerInputs, ownerId);
  const capabilities = {};
  const reservations = [];
  const blockedCapabilities = [];
  const utcDay = now.slice(0, 10);

  for (const capability of ROUTING_CAPABILITIES) {
    const intentValue = intents[capability];
    if (intentValue.decision !== 'approve') {
      capabilities[capability] = persistedDecision(
        intentValue, capability, false, versions.costModel,
      );
      continue;
    }
    const cost = versions.costModel.capabilities[capability];
    const definitions = ledgerDefinitions({
      ownerId,
      batchId,
      routePlanId: routePlan.id,
      capability,
      utcDay,
      ...versions,
    });
    const capabilityLedgers = resolveLedgers(byId, definitions, ownerId, now, versions);
    if (!canReserve(capabilityLedgers, cost.ceilingMicros)) {
      capabilities[capability] = persistedDecision(
        intentValue, capability, false, versions.costModel,
      );
      blockedCapabilities.push(capability);
      continue;
    }
    const updatedLedgers = capabilityLedgers.map((ledger) => replaceLedger(byId, {
      ...ledger,
      reservedMicros: safeAdd(ledger.reservedMicros, cost.ceilingMicros, 'reservedMicros'),
      updatedAt: now,
    }));
    const reservation = parseBudgetReservation({
      id: makeBudgetReservationId({ routePlanId: routePlan.id, capability }),
      ownerId,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      routePlanRef: { type: 'routePlan', id: routePlan.id },
      capability,
      estimatedCostMicros: cost.estimatedMicros,
      ceilingMicros: cost.ceilingMicros,
      currency: 'USD',
      costModelVersion: versions.costModel.version,
      maxBillableAttempts: cost.maxBillableAttempts,
      ledgerRefs: updatedLedgers.map(({ id }) => ({ type: 'budgetLedger', id })),
      state: 'reserved',
      reservedAt: now,
      actualCostMicros: null,
      settledAt: null,
      releasedAt: null,
      releaseReasonCode: null,
    });
    reservations.push(reservation);
    capabilities[capability] = persistedDecision(
      intentValue, capability, true, versions.costModel,
    );
  }

  const hasApproved = Object.values(capabilities)
    .some(({ decision }) => decision === 'approved');
  const approvedPlan = parseRoutePlan({
    ...routePlan,
    capabilities,
    state: 'approved',
    budgetClass: hasApproved ? 'standard' : 'deterministic_only',
    approvedAt: now,
  });
  return deepFreeze({
    routePlan: approvedPlan,
    reservations,
    ledgers: [...byId.values()].sort((left, right) => left.id.localeCompare(right.id)),
    blockedCapabilities,
  });
}

function reservationLedgers(reservation, ledgerInputs) {
  const byId = parseLedgers(ledgerInputs, reservation.ownerId);
  const refs = new Set(reservation.ledgerRefs.map(({ id }) => id));
  if (refs.size !== reservation.ledgerRefs.length) invalid('reservation ledger refs are invalid');
  for (const id of refs) {
    if (!byId.has(id)) invalid('reservation ledger is missing');
  }
  return { byId, refs };
}

function finalizeReservation({
  reservation: reservationInput,
  ledgers: ledgerInputs,
  actualCostMicros,
  now: nowInput,
  releaseReasonCode,
  targetState,
}) {
  let reservation;
  try {
    reservation = parseBudgetReservation(reservationInput);
  } catch {
    invalid('reservation is invalid');
  }
  const now = parseNow(nowInput);
  const actual = targetState === 'settled'
    ? safeMicros(actualCostMicros, 'actualCostMicros')
    : 0;
  if (reservation.state === targetState) {
    const same = targetState === 'settled'
      ? reservation.actualCostMicros === actual
      : reservation.releaseReasonCode === releaseReasonCode;
    if (!same) conflict('reservation terminal value differs');
    const { byId } = reservationLedgers(reservation, ledgerInputs);
    return deepFreeze({
      reservation,
      ledgers: [...byId.values()].sort((left, right) => left.id.localeCompare(right.id)),
      duplicate: true,
    });
  }
  if (reservation.state !== 'reserved') conflict('reservation is already terminal');
  const { byId, refs } = reservationLedgers(reservation, ledgerInputs);
  if (actual > reservation.ceilingMicros) invalid('actual cost exceeds reservation');

  for (const id of refs) {
    const ledger = byId.get(id);
    if (ledger.reservedMicros < reservation.ceilingMicros) {
      invalid('ledger reservation is incomplete');
    }
    const spentMicros = safeAdd(ledger.spentMicros, actual, 'spentMicros');
    replaceLedger(byId, {
      ...ledger,
      reservedMicros: ledger.reservedMicros - reservation.ceilingMicros,
      spentMicros,
      updatedAt: now,
    });
  }
  const nextReservation = parseBudgetReservation({
    ...reservation,
    state: targetState,
    updatedAt: now,
    actualCostMicros: targetState === 'settled' ? actual : null,
    settledAt: targetState === 'settled' ? now : null,
    releasedAt: targetState === 'released' ? now : null,
    releaseReasonCode: targetState === 'released' ? releaseReasonCode : null,
  });
  return deepFreeze({
    reservation: nextReservation,
    ledgers: [...byId.values()].sort((left, right) => left.id.localeCompare(right.id)),
    duplicate: false,
  });
}

export function settleReservation(input = {}) {
  return finalizeReservation({ ...input, targetState: 'settled', releaseReasonCode: null });
}

export function releaseReservation({ reasonCode, ...input } = {}) {
  if (typeof reasonCode !== 'string' || !REASON_CODE.test(reasonCode)) {
    invalid('reasonCode is invalid');
  }
  return finalizeReservation({
    ...input,
    targetState: 'released',
    actualCostMicros: null,
    releaseReasonCode: reasonCode,
  });
}
