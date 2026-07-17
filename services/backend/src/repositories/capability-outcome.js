import {
  parseBudgetReservation,
  parseCapabilityExecution,
  parseCapabilityResult,
  parseFragment,
  parseImportBatch,
  ProviderReceiptSchema,
  parseRoutePlan,
  parseRoutingHead,
} from '../domain/index.js';
import { makeCapabilityIdentity } from '../capabilities/identity.js';
import { releaseReservation, settleReservation } from '../routing/budget.js';
import {
  RepositoryConflictError,
  RepositoryOwnerError,
  RepositoryRoutingTargetError,
} from './errors.js';
import { assertApprovedPlanMutation, deriveRoutingSummary } from './routing-outcome.js';

const ref = (type, id) => ({ type, id });
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const ACTIVE_STATES = new Set(['claimed', 'calling', 'provider_succeeded', 'settling']);
const TERMINAL_STATES = new Set([
  'completed', 'failed_terminal', 'billing_uncertain',
]);

function targetError(message = 'Capability does not match the current routing plan') {
  throw new RepositoryRoutingTargetError(message);
}

function assertOwner(uid, value) {
  if (value?.ownerId !== uid) throw new RepositoryOwnerError();
}

function supports(versions, group, name, version) {
  return Array.isArray(versions?.[group]?.[name])
    && versions[group][name].includes(version);
}

function sourceMatches(fragment, plan, head) {
  const source = plan.sourceRevision;
  return head.currentPlanRef.id === plan.id
    && head.currentRevision === plan.revision
    && same(head.sourceRevision, source)
    && fragment.id === plan.fragmentRef.id
    && fragment.batchId === plan.batchRef.id
    && fragment.storage.bucket === source.bucket
    && fragment.storage.originalPath === source.objectName
    && fragment.storage.generation === source.generation
    && fragment.hashes.sha256 === source.inputHash;
}

function identityFor(execution) {
  return makeCapabilityIdentity({
    ownerId: execution.ownerId,
    fragmentId: execution.fragmentRef.id,
    sourceRevision: execution.sourceRevision,
    routePlanRevision: execution.routePlanRevision,
    capability: execution.capability,
    provider: execution.providerName,
    providerVersion: execution.providerVersion,
  });
}

function validateBoundary({
  uid,
  execution: executionInput,
  plan: planInput,
  head: headInput,
  fragment: fragmentInput,
  reservation: reservationInput,
  supportedVersions,
}) {
  if (!executionInput || !planInput || !headInput || !fragmentInput || !reservationInput) {
    targetError();
  }
  const execution = parseCapabilityExecution(executionInput);
  const plan = parseRoutePlan(planInput);
  const head = parseRoutingHead(headInput);
  const fragment = parseFragment(fragmentInput);
  const reservation = parseBudgetReservation(reservationInput);
  for (const value of [execution, plan, head, fragment, reservation]) assertOwner(uid, value);
  const decision = plan.capabilities[execution.capability];
  const identity = identityFor(execution);
  if (!['approved', 'executing'].includes(plan.state)
    || !sourceMatches(fragment, plan, head)
    || !same(execution.sourceRevision, plan.sourceRevision)
    || execution.routePlanRef.id !== plan.id
    || execution.routePlanRevision !== plan.revision
    || execution.fragmentRef.id !== fragment.id
    || execution.reservationRef.id !== reservation.id
    || reservation.routePlanRef.id !== plan.id
    || reservation.capability !== execution.capability
    || reservation.state !== 'reserved'
    || decision?.decision !== 'approved'
    || decision.executorClass !== execution.executorName
    || execution.id !== identity.executionId
    || execution.idempotencyKey !== identity.idempotencyKey
    || !supportedVersions?.router?.includes(plan.router.version)
    || !supportedVersions?.policy?.includes(plan.router.policyVersion)
    || !supportedVersions?.costModel?.includes(plan.router.costModelVersion)
    || !supports(supportedVersions, 'executors', execution.executorName, execution.executorVersion)
    || !supports(supportedVersions, 'providers', execution.providerName, execution.providerVersion)) {
    targetError();
  }
  return { execution, plan, head, fragment, reservation, identity };
}

function authorization(execution, reservation) {
  return {
    executionId: execution.id,
    routePlanId: execution.routePlanRef.id,
    routePlanRevision: execution.routePlanRevision,
    fragmentId: execution.fragmentRef.id,
    capability: execution.capability,
    executorName: execution.executorName,
    executorVersion: execution.executorVersion,
    providerName: execution.providerName,
    providerVersion: execution.providerVersion,
    idempotencyKey: execution.idempotencyKey,
    ceilingMicros: reservation.ceilingMicros,
  };
}

function requireLease(execution, input) {
  if (execution.leaseOwner !== input?.leaseOwner) {
    throw new RepositoryConflictError('Capability lease is not held by this delivery');
  }
}

export function applyCapabilityPreparation(context) {
  if (context.storedExecution) {
    const candidate = parseCapabilityExecution(context.execution);
    const stored = parseCapabilityExecution(context.storedExecution);
    assertOwner(context.uid, stored);
    assertOwner(context.uid, candidate);
    if (same(stored, candidate)) {
      return { outcome: 'duplicate', execution: stored };
    }
    throw new RepositoryConflictError();
  }
  const parsed = validateBoundary(context);
  if (parsed.execution.state !== 'reserved') throw new RepositoryConflictError();
  return { outcome: 'created', execution: parsed.execution };
}

export function applyCapabilityQueued(uid, executionInput, input) {
  const execution = parseCapabilityExecution(executionInput);
  assertOwner(uid, execution);
  if (execution.id !== input?.executionId) targetError();
  if (execution.state === 'queued') {
    if (execution.taskName === input.taskName && execution.queuedAt === input.queuedAt) {
      return { outcome: 'duplicate', execution };
    }
    throw new RepositoryConflictError();
  }
  if (execution.state !== 'reserved') throw new RepositoryConflictError();
  return {
    outcome: 'applied',
    execution: parseCapabilityExecution({
      ...execution,
      state: 'queued',
      taskName: input.taskName,
      queuedAt: input.queuedAt,
      updatedAt: input.queuedAt,
    }),
  };
}

export function applyCapabilityClaim(context) {
  const candidate = parseCapabilityExecution(context.execution);
  assertOwner(context.uid, candidate);
  if (TERMINAL_STATES.has(candidate.state) || candidate.state === 'failed_retryable') {
    throw new RepositoryConflictError();
  }
  const parsed = validateBoundary(context);
  const { input } = context;
  let { execution } = parsed;
  if (execution.id !== input?.executionId) targetError();
  if (execution.state === 'reserved') throw new RepositoryConflictError();
  if (execution.state === 'calling') throw new RepositoryConflictError();

  if (ACTIVE_STATES.has(execution.state)) {
    const sameDelivery = execution.leaseOwner === input.leaseOwner;
    const expired = input.claimedAt >= execution.leaseExpiresAt;
    if (!sameDelivery && !expired) throw new RepositoryConflictError();
    if (sameDelivery && execution.leaseExpiresAt === input.leaseExpiresAt) {
      return {
        outcome: execution.state === 'claimed' ? 'duplicate' : 'resume',
        execution,
        routePlan: parsed.plan,
        authorization: authorization(execution, parsed.reservation),
      };
    }
    execution = parseCapabilityExecution({
      ...execution,
      leaseOwner: input.leaseOwner,
      leaseExpiresAt: input.leaseExpiresAt,
      updatedAt: input.claimedAt,
      ...(execution.state === 'claimed' ? { startedAt: input.claimedAt } : {}),
    });
  } else if (execution.state === 'queued') {
    execution = parseCapabilityExecution({
      ...execution,
      state: 'claimed',
      leaseOwner: input.leaseOwner,
      leaseExpiresAt: input.leaseExpiresAt,
      startedAt: input.claimedAt,
      updatedAt: input.claimedAt,
    });
  } else {
    throw new RepositoryConflictError();
  }

  const routePlan = parsed.plan.state === 'approved'
    ? parseRoutePlan({ ...parsed.plan, state: 'executing', updatedAt: input.claimedAt })
    : parsed.plan;
  assertApprovedPlanMutation(parsed.plan, routePlan);
  return {
    outcome: 'claimed',
    execution,
    routePlan,
    authorization: authorization(execution, parsed.reservation),
  };
}

export function applyCapabilityCalling(uid, executionInput, reservationInput, input) {
  const execution = parseCapabilityExecution(executionInput);
  const reservation = parseBudgetReservation(reservationInput);
  assertOwner(uid, execution);
  assertOwner(uid, reservation);
  if (execution.id !== input?.executionId) targetError();
  requireLease(execution, input);
  if (execution.state === 'calling') return { outcome: 'duplicate', execution };
  if (execution.state !== 'claimed'
    || execution.billableAttempts >= reservation.maxBillableAttempts) {
    throw new RepositoryConflictError();
  }
  return {
    outcome: 'applied',
    execution: parseCapabilityExecution({
      ...execution,
      state: 'calling',
      billableAttempts: execution.billableAttempts + 1,
      startedAt: execution.startedAt ?? input.calledAt,
      updatedAt: input.calledAt,
    }),
  };
}

function validateProviderResult(uid, execution, reservation, receiptInput, resultInput) {
  const receipt = ProviderReceiptSchema.parse(receiptInput);
  const result = parseCapabilityResult(resultInput);
  assertOwner(uid, result);
  const identity = identityFor(execution);
  if (result.outcome === 'unsupported'
    || result.id !== identity.resultId
    || receipt.clientRequestId !== identity.clientRequestId
    || result.executionRef.id !== execution.id
    || result.routePlanRef.id !== execution.routePlanRef.id
    || result.routePlanRevision !== execution.routePlanRevision
    || result.fragmentRef.id !== execution.fragmentRef.id
    || !same(result.sourceRevision, execution.sourceRevision)
    || result.capability !== execution.capability
    || result.executorName !== execution.executorName
    || result.executorVersion !== execution.executorVersion
    || result.providerName !== execution.providerName
    || result.providerVersion !== execution.providerVersion
    || result.requestCount !== receipt.requestCount
    || result.pageCount !== receipt.actualPages
    || result.actualCostMicros !== receipt.actualCostMicros
    || result.estimatedCostMicros !== receipt.estimatedCostMicros
    || receipt.actualCostMicros > reservation.ceilingMicros) {
    targetError('Provider result does not match the authorized execution');
  }
  return result;
}

export function applyCapabilityResult({
  uid,
  execution: executionInput,
  reservation: reservationInput,
  storedResult,
  input,
}) {
  const execution = parseCapabilityExecution(executionInput);
  const reservation = parseBudgetReservation(reservationInput);
  assertOwner(uid, execution);
  requireLease(execution, input);
  const result = validateProviderResult(uid, execution, reservation, input.receipt, input.result);
  if (storedResult && !same(parseCapabilityResult(storedResult), result)) {
    throw new RepositoryConflictError();
  }
  if (execution.state === 'provider_succeeded') {
    if (same(execution.receipt, input.receipt) && execution.resultRef?.id === result.id) {
      return { outcome: 'duplicate', execution, result };
    }
    throw new RepositoryConflictError();
  }
  if (execution.state !== 'calling') throw new RepositoryConflictError();
  return {
    outcome: 'applied',
    result,
    execution: parseCapabilityExecution({
      ...execution,
      state: 'provider_succeeded',
      receipt: input.receipt,
      resultRef: ref('capabilityResult', result.id),
      updatedAt: input.recordedAt,
    }),
  };
}

function capabilitySummary(batch, executions, results, plans, heads, now) {
  const currentPlanIds = new Set(heads.map(({ currentPlanRef }) => currentPlanRef.id));
  const batchPlanIds = new Set();
  for (const plan of plans) {
    if (plan.batchRef.id === batch.id && currentPlanIds.has(plan.id)) batchPlanIds.add(plan.id);
  }
  const resultByExecution = new Map(results.map((result) => [result.executionRef.id, result]));
  const byProcessorInput = new Map();
  for (const execution of executions) {
    if (!batchPlanIds.has(execution.routePlanRef.id)) continue;
    const key = [execution.fragmentRef.id, execution.executorName, execution.executorVersion].join(':');
    const previous = byProcessorInput.get(key);
    if (!previous || `${execution.updatedAt}:${execution.id}` > `${previous.updatedAt}:${previous.id}`) {
      byProcessorInput.set(key, execution);
    }
  }
  const counts = {
    queued: 0,
    running: 0,
    completed: 0,
    insufficient: 0,
    unsupported: 0,
    failed: 0,
    billingUncertain: 0,
  };
  for (const execution of byProcessorInput.values()) {
    if (['reserved', 'queued'].includes(execution.state)) counts.queued += 1;
    else if (ACTIVE_STATES.has(execution.state)) counts.running += 1;
    else if (execution.state === 'billing_uncertain') counts.billingUncertain += 1;
    else if (['failed_retryable', 'failed_terminal'].includes(execution.state)) counts.failed += 1;
    else {
      const outcome = resultByExecution.get(execution.id)?.outcome;
      if (outcome === 'completed') counts.completed += 1;
      else if (outcome === 'insufficient_input') counts.insufficient += 1;
      else if (outcome === 'unsupported') counts.unsupported += 1;
      else counts.failed += 1;
    }
  }
  return {
    processorName: 'capability-execution',
    processorVersion: 'v1',
    eligible: byProcessorInput.size,
    ...counts,
    updatedAt: now,
  };
}

function completePlan(plan, executions, escalations, now) {
  if (!['approved', 'executing'].includes(plan.state)) return plan;
  const approved = Object.entries(plan.capabilities)
    .filter(([, decision]) => decision.decision === 'approved')
    .map(([capability]) => capability);
  const terminal = approved.every((capability) => executions.some((execution) => (
    execution.routePlanRef.id === plan.id
      && execution.capability === capability
      && TERMINAL_STATES.has(execution.state)
  )));
  const pendingEscalation = escalations.some((request) => (
    request.fromRoutePlanRef.id === plan.id && request.state === 'pending'
  ));
  if (!terminal || pendingEscalation) return plan;
  const completed = parseRoutePlan({
    ...plan,
    state: 'completed',
    completedAt: now,
    updatedAt: now,
  });
  assertApprovedPlanMutation(plan, completed);
  return completed;
}

function completion({ batch, plan, plans, heads, executions, results, escalations, now }) {
  const routePlan = completePlan(plan, executions, escalations, now);
  const nextPlans = plans.map((value) => (value.id === routePlan.id ? routePlan : value));
  const nextBatch = parseImportBatch({
    ...batch,
    routingSummary: deriveRoutingSummary(batch, nextPlans, heads, now),
    capabilitySummary: capabilitySummary(batch, executions, results, nextPlans, heads, now),
    updatedAt: now,
  });
  return { routePlan, batch: nextBatch };
}

function projectOcrFacts(fragmentInput, result, now) {
  const fragment = parseFragment(fragmentInput);
  const sourceRefs = [
    ref('capabilityResult', result.id),
    ref('fragment', fragment.id),
  ];
  const provenance = (value, confidence) => ({
    value,
    sourceType: 'ocr',
    sourceRefs,
    processor: {
      name: result.providerName,
      version: result.executorVersion,
      modelAlias: null,
      promptVersion: null,
    },
    confidence,
    status: 'suggested',
    observedAt: now,
  });
  const additions = {
    ocrPageCount: provenance(result.pageCount, 1),
    ocrQualitySummary: provenance(
      result.qualitySummary,
      result.qualitySummary.averageConfidence ?? 0,
    ),
    ocrResultRef: provenance(ref('capabilityResult', result.id), 1),
  };
  const facts = { ...fragment.facts };
  for (const key of result.suggestedFactKeys) {
    if (Object.hasOwn(additions, key) && !Object.hasOwn(facts, key)) facts[key] = additions[key];
  }
  return parseFragment({ ...fragment, facts, updatedAt: now });
}

export function applyCapabilitySettlement(context) {
  const {
    uid, input, ledgers, executions: executionInputs, results: resultInputs,
    plans: planInputs, heads, escalations,
  } = context;
  const execution = parseCapabilityExecution(context.execution);
  assertOwner(uid, execution);
  if (execution.id !== input?.executionId) targetError();
  if (execution.state === 'completed') return { outcome: 'duplicate' };
  requireLease(execution, input);
  if (execution.state !== 'provider_succeeded') throw new RepositoryConflictError();
  const reservation = parseBudgetReservation(context.reservation);
  const result = parseCapabilityResult(context.result);
  if (execution.resultRef?.id !== result.id) targetError();
  const budget = settleReservation({
    reservation,
    ledgers,
    actualCostMicros: execution.receipt.actualCostMicros,
    now: input.settledAt,
  });
  const nextExecution = parseCapabilityExecution({
    ...execution,
    state: 'completed',
    leaseOwner: null,
    leaseExpiresAt: null,
    completedAt: input.settledAt,
    updatedAt: input.settledAt,
  });
  const executions = executionInputs.map((value) => (
    value.id === nextExecution.id ? nextExecution : parseCapabilityExecution(value)
  ));
  const results = resultInputs.map((value) => parseCapabilityResult(value));
  const plan = parseRoutePlan(context.routePlan);
  const batch = parseImportBatch(context.batch);
  const currentHead = heads.find(({ fragmentRef }) => fragmentRef.id === execution.fragmentRef.id);
  const publish = currentHead?.currentPlanRef.id === plan.id
    && same(currentHead.sourceRevision, execution.sourceRevision);
  const fragment = publish
    ? projectOcrFacts(context.fragment, result, input.settledAt)
    : parseFragment(context.fragment);
  return {
    outcome: 'applied',
    execution: nextExecution,
    reservation: budget.reservation,
    ledgers: budget.ledgers,
    fragment,
    ...completion({
      batch,
      plan,
      plans: planInputs.map((value) => parseRoutePlan(value)),
      heads,
      executions,
      results,
      escalations,
      now: input.settledAt,
    }),
  };
}

export function applyCapabilityFailure(context) {
  const {
    uid, input, ledgers, executions: executionInputs, results: resultInputs,
    plans: planInputs, heads, escalations,
  } = context;
  const execution = parseCapabilityExecution(context.execution);
  assertOwner(uid, execution);
  if (execution.id !== input?.executionId) targetError();
  if (['completed', 'failed_retryable', 'failed_terminal'].includes(execution.state)) {
    return { outcome: 'duplicate' };
  }
  requireLease(execution, input);
  if (!['claimed', 'calling'].includes(execution.state)) throw new RepositoryConflictError();
  const reservation = parseBudgetReservation(context.reservation);
  let result = null;
  if (input.outcome === 'unsupported') {
    result = parseCapabilityResult(input.result);
    if (execution.state !== 'claimed'
      || result.outcome !== 'unsupported'
      || result.id !== identityFor(execution).resultId
      || result.executionRef.id !== execution.id
      || !same(result.sourceRevision, execution.sourceRevision)) targetError();
  } else if (input.result !== null) {
    targetError();
  }
  const release = input.outcome === 'failed_retryable'
    ? { reservation, ledgers }
    : releaseReservation({
      reservation,
      ledgers,
      reasonCode: input.errorCode,
      now: input.completedAt,
    });
  const state = input.outcome === 'unsupported' ? 'completed' : input.outcome;
  const nextExecution = parseCapabilityExecution({
    ...execution,
    state,
    leaseOwner: null,
    leaseExpiresAt: null,
    receipt: null,
    resultRef: result ? ref('capabilityResult', result.id) : null,
    errorCode: state === 'completed' ? null : input.errorCode,
    startedAt: state === 'completed' ? null : execution.startedAt,
    completedAt: input.completedAt,
    updatedAt: input.completedAt,
  });
  const executions = executionInputs.map((value) => (
    value.id === nextExecution.id ? nextExecution : parseCapabilityExecution(value)
  ));
  const results = result
    ? [...resultInputs.filter(({ id }) => id !== result.id), result]
    : resultInputs;
  const plan = parseRoutePlan(context.routePlan);
  return {
    outcome: 'applied',
    execution: nextExecution,
    result,
    reservation: release.reservation,
    ledgers: release.ledgers,
    ...completion({
      batch: parseImportBatch(context.batch),
      plan,
      plans: planInputs.map((value) => parseRoutePlan(value)),
      heads,
      executions,
      results: results.map((value) => parseCapabilityResult(value)),
      escalations,
      now: input.completedAt,
    }),
  };
}

export function applyCapabilityBillingUncertain(context) {
  const {
    uid, input, executions: executionInputs, results: resultInputs,
    plans: planInputs, heads, escalations,
  } = context;
  const execution = parseCapabilityExecution(context.execution);
  assertOwner(uid, execution);
  if (execution.id !== input?.executionId) targetError();
  if (execution.state === 'billing_uncertain') return { outcome: 'duplicate' };
  requireLease(execution, input);
  if (execution.state !== 'calling') throw new RepositoryConflictError();
  const nextExecution = parseCapabilityExecution({
    ...execution,
    state: 'billing_uncertain',
    leaseOwner: null,
    leaseExpiresAt: null,
    errorCode: input.errorCode,
    completedAt: input.completedAt,
    updatedAt: input.completedAt,
  });
  const executions = executionInputs.map((value) => (
    value.id === nextExecution.id ? nextExecution : parseCapabilityExecution(value)
  ));
  return {
    outcome: 'applied',
    execution: nextExecution,
    reservation: parseBudgetReservation(context.reservation),
    ...completion({
      batch: parseImportBatch(context.batch),
      plan: parseRoutePlan(context.routePlan),
      plans: planInputs.map((value) => parseRoutePlan(value)),
      heads,
      executions,
      results: resultInputs.map((value) => parseCapabilityResult(value)),
      escalations,
      now: input.completedAt,
    }),
  };
}
