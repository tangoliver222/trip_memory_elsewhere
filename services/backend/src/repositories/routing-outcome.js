import {
  parseBudgetReservation,
  parseCapabilityExecution,
  parseEscalationRequest,
  parseImportBatch,
  parseRoutePlan,
  parseRoutingCohort,
  parseRoutingHead,
  routePlanImmutablePayload,
} from '../domain/index.js';
import {
  releaseReservation,
  reserveRoutePlanBudget,
  settleReservation,
} from '../routing/budget.js';
import {
  makeBudgetReservationId,
  makeCapabilityExecutionId,
  makeRoutingHeadId,
} from '../routing/identity.js';
import {
  RepositoryConflictError,
  RepositoryOwnerError,
  RepositoryRoutingTargetError,
} from './errors.js';

const CAPABILITIES = ['ocr', 'places', 'embedding', 'gemini'];
const TERMINAL_DETERMINISTIC_STATES = new Set(['succeeded', 'failed_terminal']);

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const ref = (type, id) => ({ type, id });

function assertOwner(uid, value) {
  if (value?.ownerId !== uid) throw new RepositoryOwnerError();
}

function sourceMatches(fragment, routePlan) {
  const deterministic = fragment?.processing?.deterministic;
  const source = routePlan?.sourceRevision;
  return fragment
    && routePlan.fragmentRef.id === fragment.id
    && routePlan.batchRef.id === fragment.batchId
    && source.bucket === fragment.storage.bucket
    && source.objectName === fragment.storage.originalPath
    && source.generation === fragment.storage.generation
    && source.inputHash === fragment.hashes.sha256
    && routePlan.inputs.deterministicTaskId === deterministic?.taskId
    && routePlan.inputs.deterministicProcessorName === deterministic?.processorName
    && routePlan.inputs.deterministicProcessorVersion === deterministic?.processorVersion
    && TERMINAL_DETERMINISTIC_STATES.has(deterministic?.state);
}

function taskMatches(fragment, task) {
  const deterministic = fragment?.processing?.deterministic;
  return task
    && task.id === deterministic?.taskId
    && task.fragmentId === fragment.id
    && task.batchId === fragment.batchId
    && task.processorName === deterministic.processorName
    && task.processorVersion === deterministic.processorVersion
    && TERMINAL_DETERMINISTIC_STATES.has(task.state);
}

function currentPlanFor(fragmentId, plans, heads) {
  const head = heads.find(({ fragmentRef }) => fragmentRef.id === fragmentId);
  if (head) return plans.find(({ id }) => id === head.currentPlanRef.id) ?? null;
  return plans
    .filter((plan) => plan.fragmentRef.id === fragmentId && plan.state === 'draft')
    .sort((left, right) => right.revision - left.revision)[0] ?? null;
}

function summaryState(plan) {
  if (!plan || plan.state === 'draft') return 'drafting';
  if (['approved', 'executing'].includes(plan.state)) return 'approved';
  if (plan.state === 'completed') {
    const decisions = Object.values(plan.capabilities).map(({ decision }) => decision);
    return !decisions.includes('approved') && decisions.includes('blocked')
      ? 'blocked'
      : 'completed';
  }
  return 'blocked';
}

export function deriveRoutingSummary(batchInput, plans, heads, now) {
  const batch = parseImportBatch(batchInput);
  const eligible = batch.processingSummary?.deterministic.eligible ?? 0;
  const fragmentIds = Object.values(batch.uploads)
    .filter(({ state }) => state === 'finalized')
    .map(({ fragmentId }) => fragmentId)
    .sort()
    .slice(0, eligible);
  const counts = { drafting: 0, approved: 0, blocked: 0, completed: 0 };
  for (const fragmentId of fragmentIds) {
    counts[summaryState(currentPlanFor(fragmentId, plans, heads))] += 1;
  }
  while (Object.values(counts).reduce((total, value) => total + value, 0) < eligible) {
    counts.drafting += 1;
  }
  return {
    routerName: 'fragment-routing',
    routerVersion: 'v1',
    policyVersion: 'v1',
    eligible,
    ...counts,
    superseded: plans.filter((plan) => (
      plan.batchRef.id === batch.id && plan.state === 'superseded'
    )).length,
    updatedAt: now,
  };
}

export function applyRoutingDraftSave({
  uid,
  batch: batchInput,
  fragment,
  task,
  storedPlan,
  plans,
  heads,
  routePlan: routePlanInput,
}) {
  const batch = parseImportBatch(batchInput);
  const routePlan = parseRoutePlan(routePlanInput);
  assertOwner(uid, routePlan);
  if (routePlan.state !== 'draft'
    || routePlan.batchRef.id !== batch.id
    || !sourceMatches(fragment, routePlan)
    || !taskMatches(fragment, task)) {
    throw new RepositoryRoutingTargetError();
  }
  if (storedPlan) {
    if (same(storedPlan, routePlan)) {
      return { outcome: 'duplicate', routePlan: storedPlan, batch };
    }
    throw new RepositoryConflictError();
  }
  const previousRevision = plans
    .filter((plan) => plan.fragmentRef.id === fragment.id)
    .reduce((highest, plan) => Math.max(highest, plan.revision), 0);
  if (routePlan.revision !== previousRevision + 1) throw new RepositoryConflictError();
  const nextPlans = [...plans, routePlan];
  const nextBatch = parseImportBatch({
    ...batch,
    routingSummary: deriveRoutingSummary(batch, nextPlans, heads, routePlan.updatedAt),
    updatedAt: routePlan.updatedAt,
  });
  return { outcome: 'created', routePlan, batch: nextBatch };
}

function decisionMatchesIntent(decision, intent) {
  if (intent.decision === 'approve') {
    return (decision.decision === 'approved'
      && decision.executorClass === intent.executorClass
      && decision.scope === intent.scope
      && same(decision.reasonCodes, intent.reasonCodes))
      || (decision.decision === 'blocked'
        && same(decision.reasonCodes, ['budget-limit']));
  }
  const expected = { skip: 'skipped', defer: 'deferred', block: 'blocked' }[intent.decision];
  return decision.decision === expected
    && decision.scope === intent.scope
    && same(decision.reasonCodes, intent.reasonCodes)
    && (intent.decision !== 'defer' || same(decision.reconsiderOn, intent.reconsiderOn));
}

function approvalMatches(plan, capabilityIntents) {
  return CAPABILITIES.every((capability) => (
    decisionMatchesIntent(plan.capabilities[capability], capabilityIntents[capability])
  ));
}

function validateCohorts(uid, cohortInputs, fragments) {
  const byId = new Map(fragments.map((fragment) => [fragment.id, fragment]));
  return cohortInputs.map((input) => {
    const cohort = parseRoutingCohort(input);
    assertOwner(uid, cohort);
    for (const revisionRef of cohort.inputRevisionRefs) {
      const fragment = byId.get(revisionRef.fragmentRef.id);
      if (!fragment || !sourceMatches(fragment, {
        fragmentRef: revisionRef.fragmentRef,
        batchRef: ref('importBatch', fragment.batchId),
        sourceRevision: revisionRef.sourceRevision,
        inputs: {
          deterministicTaskId: fragment.processing.deterministic.taskId,
          deterministicProcessorName: fragment.processing.deterministic.processorName,
          deterministicProcessorVersion: fragment.processing.deterministic.processorVersion,
        },
      })) throw new RepositoryRoutingTargetError();
    }
    return cohort;
  });
}

export function applyRoutingApproval({
  uid,
  batch: batchInput,
  approvals,
  cohortInputs,
  fragments,
  tasks,
  plans,
  heads,
  ledgers,
  now,
}) {
  const batch = parseImportBatch(batchInput);
  if (!Array.isArray(approvals) || approvals.length === 0 || approvals.length > 50) {
    throw new RepositoryConflictError();
  }
  const cohorts = validateCohorts(uid, cohortInputs, fragments);
  const planIds = approvals.map(({ routePlanId }) => routePlanId);
  if (new Set(planIds).size !== planIds.length) throw new RepositoryConflictError();
  const storedPlans = approvals.map(({ routePlanId }) => (
    plans.find(({ id }) => id === routePlanId) ?? null
  ));
  if (storedPlans.some((plan) => !plan)) throw new RepositoryRoutingTargetError();
  const allTerminal = storedPlans.every((plan, index) => (
    plan.state !== 'draft' && approvalMatches(plan, approvals[index].capabilityIntents)
  ));
  if (allTerminal) {
    return {
      outcome: 'duplicate',
      plans: storedPlans,
      supersededPlans: [],
      heads: heads.filter((head) => planIds.includes(head.currentPlanRef.id)),
      cohorts,
      reservations: [],
      ledgers,
      batch,
    };
  }
  if (storedPlans.some((plan) => plan.state !== 'draft')) throw new RepositoryConflictError();

  let nextPlans = [...plans];
  let nextHeads = [...heads];
  let nextLedgers = [...ledgers];
  const approvedPlans = [];
  const supersededPlans = [];
  const reservations = [];
  for (const [index, draft] of storedPlans.entries()) {
    const fragment = fragments.find(({ id }) => id === draft.fragmentRef.id);
    const task = tasks.find(({ id }) => id === draft.inputs.deterministicTaskId);
    if (!sourceMatches(fragment, draft) || !taskMatches(fragment, task)) {
      throw new RepositoryRoutingTargetError();
    }
    const head = nextHeads.find(({ fragmentRef }) => fragmentRef.id === fragment.id) ?? null;
    if ((!head && draft.revision !== 1)
      || (head && draft.revision !== head.currentRevision + 1)) {
      throw new RepositoryConflictError();
    }
    const admitted = reserveRoutePlanBudget({
      ownerId: uid,
      batchId: batch.id,
      routePlan: { ...draft, capabilities: approvals[index].capabilityIntents },
      ledgers: nextLedgers,
      now,
    });
    let approvedPlan = admitted.routePlan;
    if (!Object.values(approvedPlan.capabilities)
      .some(({ decision }) => decision === 'approved')) {
      approvedPlan = parseRoutePlan({
        ...approvedPlan,
        state: 'completed',
        completedAt: now,
      });
    }
    if (head) {
      const prior = nextPlans.find(({ id }) => id === head.currentPlanRef.id);
      if (!prior) throw new RepositoryRoutingTargetError();
      const superseded = parseRoutePlan({
        ...prior,
        state: 'superseded',
        updatedAt: now,
        completedAt: null,
        supersededAt: now,
      });
      nextPlans = nextPlans.map((plan) => (plan.id === superseded.id ? superseded : plan));
      supersededPlans.push(superseded);
    }
    const nextHead = parseRoutingHead({
      id: makeRoutingHeadId({
        ownerId: uid,
        fragmentId: fragment.id,
        routerName: 'fragment-routing',
      }),
      ownerId: uid,
      schemaVersion: 1,
      createdAt: head?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
      fragmentRef: ref('fragment', fragment.id),
      routerName: 'fragment-routing',
      currentPlanRef: ref('routePlan', approvedPlan.id),
      currentRevision: approvedPlan.revision,
      sourceRevision: approvedPlan.sourceRevision,
    });
    nextPlans = nextPlans.map((plan) => (plan.id === approvedPlan.id ? approvedPlan : plan));
    nextHeads = head
      ? nextHeads.map((value) => (value.id === head.id ? nextHead : value))
      : [...nextHeads, nextHead];
    nextLedgers = admitted.ledgers;
    approvedPlans.push(approvedPlan);
    reservations.push(...admitted.reservations);
  }
  const nextBatch = parseImportBatch({
    ...batch,
    routingSummary: deriveRoutingSummary(batch, nextPlans, nextHeads, now),
    updatedAt: now,
  });
  return {
    outcome: 'applied',
    plans: approvedPlans,
    supersededPlans,
    heads: nextHeads.filter((head) => (
      approvedPlans.some((plan) => plan.id === head.currentPlanRef.id)
    )),
    cohorts,
    reservations,
    ledgers: nextLedgers,
    batch: nextBatch,
  };
}

export function applyEscalationSubmission(uid, storedRequest, requestInput, plans) {
  const request = parseEscalationRequest(requestInput);
  assertOwner(uid, request);
  if (!plans.some(({ id }) => id === request.fromRoutePlanRef.id)) {
    throw new RepositoryRoutingTargetError();
  }
  if (!storedRequest) return { outcome: 'created', request };
  if (same(storedRequest, request)) return { outcome: 'duplicate', request: storedRequest };
  throw new RepositoryConflictError();
}

export function assertApprovedPlanMutation(previous, next) {
  if (!same(routePlanImmutablePayload(previous), routePlanImmutablePayload(next))) {
    throw new RepositoryConflictError();
  }
}

function includesVersion(values, version) {
  return Array.isArray(values) && values.includes(version);
}

function capabilityTargetError() {
  throw new RepositoryRoutingTargetError('Capability is not authorized by the current plan');
}

function parseExecutionForOwner(uid, executionInput, executionId) {
  if (!executionInput) capabilityTargetError();
  const execution = parseCapabilityExecution(executionInput);
  assertOwner(uid, execution);
  if (execution.id !== executionId) capabilityTargetError();
  return execution;
}

export function applyCapabilityClaim({
  uid,
  routePlan: routePlanInput,
  head: headInput,
  reservation: reservationInput,
  executions: executionInputs,
  input,
}) {
  if (!routePlanInput || !headInput || !reservationInput || !Array.isArray(executionInputs)) {
    capabilityTargetError();
  }
  const routePlan = parseRoutePlan(routePlanInput);
  const head = parseRoutingHead(headInput);
  const reservation = parseBudgetReservation(reservationInput);
  assertOwner(uid, routePlan);
  assertOwner(uid, head);
  assertOwner(uid, reservation);
  const executions = executionInputs.map((value) => parseCapabilityExecution(value));
  if (executions.some(({ ownerId }) => ownerId !== uid)) throw new RepositoryOwnerError();
  const executionId = makeCapabilityExecutionId({
    routePlanId: routePlan.id,
    capability: input?.capability,
    idempotencyKey: input?.idempotencyKey,
  });
  if (executions.some(({ id }) => id === executionId)) throw new RepositoryConflictError();
  const decision = routePlan.capabilities[input?.capability];
  const versions = input?.supportedVersions;
  const expectedReservationId = makeBudgetReservationId({
    routePlanId: routePlan.id,
    capability: input?.capability,
  });
  if (!['approved', 'executing'].includes(routePlan.state)
    || head.currentPlanRef.id !== routePlan.id
    || head.currentRevision !== routePlan.revision
    || !same(head.sourceRevision, routePlan.sourceRevision)
    || !same(input?.sourceRevision, routePlan.sourceRevision)
    || decision?.decision !== 'approved'
    || decision.executorClass !== input?.executorClass
    || !includesVersion(versions?.router, routePlan.router.version)
    || !includesVersion(versions?.policy, routePlan.router.policyVersion)
    || !includesVersion(versions?.costModel, routePlan.router.costModelVersion)
    || !includesVersion(versions?.executors?.[decision.executorClass], input?.executorVersion)
    || reservation.id !== expectedReservationId
    || reservation.routePlanRef.id !== routePlan.id
    || reservation.capability !== input.capability
    || reservation.state !== 'reserved'
    || reservation.costModelVersion !== routePlan.router.costModelVersion) {
    capabilityTargetError();
  }

  const attempts = executions
    .filter(({ routePlanRef, capability }) => (
      routePlanRef.id === routePlan.id && capability === input.capability
    ))
    .reduce((total, execution) => total + execution.billableAttempts, 0);
  if (attempts >= reservation.maxBillableAttempts) throw new RepositoryConflictError();

  const nextPlan = routePlan.state === 'approved'
    ? parseRoutePlan({ ...routePlan, state: 'executing', updatedAt: input.claimedAt })
    : routePlan;
  assertApprovedPlanMutation(routePlan, nextPlan);
  const execution = parseCapabilityExecution({
    id: executionId,
    ownerId: uid,
    schemaVersion: 1,
    createdAt: input.claimedAt,
    updatedAt: input.claimedAt,
    deletedAt: null,
    routePlanRef: ref('routePlan', routePlan.id),
    reservationRef: ref('budgetReservation', reservation.id),
    capability: input.capability,
    executorName: decision.executorClass,
    executorVersion: input.executorVersion,
    idempotencyKey: input.idempotencyKey,
    state: 'claimed',
    billableAttempts: 1,
    receipt: null,
    resultRef: null,
    errorCode: null,
    startedAt: input.claimedAt,
    completedAt: null,
  });
  return {
    outcome: 'claimed',
    routePlan: nextPlan,
    execution,
    authorization: {
      routePlanId: routePlan.id,
      capability: input.capability,
      executorClass: decision.executorClass,
      scope: decision.scope,
      idempotencyKey: input.idempotencyKey,
      ceilingMicros: reservation.ceilingMicros,
    },
  };
}

export function applyCapabilityCalling(uid, executionInput, input) {
  const execution = parseExecutionForOwner(uid, executionInput, input?.executionId);
  if (execution.state === 'calling') return { outcome: 'duplicate', execution };
  if (execution.state !== 'claimed') throw new RepositoryConflictError();
  return {
    outcome: 'applied',
    execution: parseCapabilityExecution({
      ...execution,
      state: 'calling',
      updatedAt: input.calledAt,
    }),
  };
}

export function applyCapabilityReceipt(uid, executionInput, input) {
  const execution = parseExecutionForOwner(uid, executionInput, input?.executionId);
  const receipt = {
    providerRequestId: input.providerRequestId,
    usage: input.usage,
    actualCostMicros: input.actualCostMicros,
    receivedAt: input.receivedAt,
  };
  if (execution.state === 'provider_succeeded') {
    if (same(execution.receipt, receipt) && same(execution.resultRef, input.resultRef)) {
      return { outcome: 'duplicate', execution };
    }
    throw new RepositoryConflictError();
  }
  if (execution.state !== 'calling') throw new RepositoryConflictError();
  return {
    outcome: 'applied',
    execution: parseCapabilityExecution({
      ...execution,
      state: 'provider_succeeded',
      receipt,
      resultRef: input.resultRef,
      updatedAt: input.receivedAt,
    }),
  };
}

const TERMINAL_EXECUTION_STATES = new Set(['completed', 'failed', 'billing_uncertain']);

function completePlan({ plan, executions, escalations, now }) {
  if (!['approved', 'executing'].includes(plan.state)) return plan;
  const approved = CAPABILITIES.filter((capability) => (
    plan.capabilities[capability].decision === 'approved'
  ));
  const allTerminal = approved.every((capability) => executions.some((execution) => (
    execution.routePlanRef.id === plan.id
      && execution.capability === capability
      && TERMINAL_EXECUTION_STATES.has(execution.state)
  )));
  const pendingEscalation = escalations.some((request) => (
    request.fromRoutePlanRef.id === plan.id && request.state === 'pending'
  ));
  if (!allTerminal || pendingEscalation) return plan;
  const completed = parseRoutePlan({
    ...plan,
    state: 'completed',
    updatedAt: now,
    completedAt: now,
  });
  assertApprovedPlanMutation(plan, completed);
  return completed;
}

function completionState({ batch, plan, plans, heads, executions, escalations, now }) {
  const nextPlan = completePlan({ plan, executions, escalations, now });
  const nextPlans = plans.map((value) => (value.id === nextPlan.id ? nextPlan : value));
  const nextBatch = parseImportBatch({
    ...batch,
    routingSummary: deriveRoutingSummary(batch, nextPlans, heads, now),
    updatedAt: now,
  });
  return { routePlan: nextPlan, batch: nextBatch };
}

export function applyCapabilitySettlement({
  uid,
  batch: batchInput,
  routePlan: routePlanInput,
  reservation: reservationInput,
  ledgers,
  execution: executionInput,
  executions: executionInputs,
  plans: planInputs,
  heads,
  escalations,
  input,
}) {
  if (!batchInput || !routePlanInput || !reservationInput
    || !Array.isArray(ledgers) || !Array.isArray(executionInputs)
    || !Array.isArray(planInputs) || !Array.isArray(heads) || !Array.isArray(escalations)) {
    capabilityTargetError();
  }
  const batch = parseImportBatch(batchInput);
  const routePlan = parseRoutePlan(routePlanInput);
  const reservation = parseBudgetReservation(reservationInput);
  const execution = parseExecutionForOwner(uid, executionInput, input?.executionId);
  assertOwner(uid, batch);
  assertOwner(uid, routePlan);
  assertOwner(uid, reservation);
  if (execution.routePlanRef.id !== routePlan.id
    || execution.reservationRef.id !== reservation.id) capabilityTargetError();
  if (input?.outcome === 'completed') {
    if (execution.state === 'completed') return { outcome: 'duplicate' };
    if (execution.state !== 'provider_succeeded') throw new RepositoryConflictError();
  } else if (input?.outcome === 'failed') {
    if (execution.state === 'failed') {
      if (execution.errorCode === input.errorCode) return { outcome: 'duplicate' };
      throw new RepositoryConflictError();
    }
    if (!['claimed', 'calling'].includes(execution.state)) throw new RepositoryConflictError();
  } else {
    throw new RepositoryConflictError();
  }

  const budget = input.outcome === 'completed'
    ? settleReservation({
      reservation,
      ledgers,
      actualCostMicros: execution.receipt.actualCostMicros,
      now: input.settledAt,
    })
    : releaseReservation({
      reservation,
      ledgers,
      reasonCode: input.errorCode,
      now: input.settledAt,
    });
  const settling = input.outcome === 'completed'
    ? parseCapabilityExecution({ ...execution, state: 'settling', updatedAt: input.settledAt })
    : execution;
  const nextExecution = parseCapabilityExecution({
    ...settling,
    state: input.outcome,
    errorCode: input.outcome === 'failed' ? input.errorCode : null,
    updatedAt: input.settledAt,
    completedAt: input.settledAt,
  });
  const executions = executionInputs.map((value) => (
    value.id === nextExecution.id ? nextExecution : parseCapabilityExecution(value)
  ));
  const completion = completionState({
    batch,
    plan: routePlan,
    plans: planInputs.map((value) => parseRoutePlan(value)),
    heads,
    executions,
    escalations,
    now: input.settledAt,
  });
  return {
    outcome: 'applied',
    execution: nextExecution,
    reservation: budget.reservation,
    ledgers: budget.ledgers,
    ...completion,
  };
}

export function applyCapabilityBillingUncertain({
  uid,
  batch: batchInput,
  routePlan: routePlanInput,
  execution: executionInput,
  executions: executionInputs,
  plans: planInputs,
  heads,
  escalations,
  input,
}) {
  if (!batchInput || !routePlanInput || !Array.isArray(executionInputs)
    || !Array.isArray(planInputs) || !Array.isArray(heads) || !Array.isArray(escalations)) {
    capabilityTargetError();
  }
  const batch = parseImportBatch(batchInput);
  const routePlan = parseRoutePlan(routePlanInput);
  const execution = parseExecutionForOwner(uid, executionInput, input?.executionId);
  assertOwner(uid, batch);
  assertOwner(uid, routePlan);
  if (execution.state === 'billing_uncertain') {
    if (execution.errorCode === input.errorCode) return { outcome: 'duplicate' };
    throw new RepositoryConflictError();
  }
  if (execution.state !== 'calling') throw new RepositoryConflictError();
  const nextExecution = parseCapabilityExecution({
    ...execution,
    state: 'billing_uncertain',
    errorCode: input.errorCode,
    updatedAt: input.completedAt,
    completedAt: input.completedAt,
  });
  const executions = executionInputs.map((value) => (
    value.id === nextExecution.id ? nextExecution : parseCapabilityExecution(value)
  ));
  const completion = completionState({
    batch,
    plan: routePlan,
    plans: planInputs.map((value) => parseRoutePlan(value)),
    heads,
    executions,
    escalations,
    now: input.completedAt,
  });
  return { outcome: 'applied', execution: nextExecution, ...completion };
}
