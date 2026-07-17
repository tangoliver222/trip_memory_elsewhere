import {
  parseBudgetLedger,
  parseBudgetReservation,
  parseCapabilityExecution,
  parseCapabilityResult,
  parseContentHash,
  parseDuplicateCandidate,
  parseEscalationRequest,
  parseFragment,
  parseImportBatch,
  parseProcessingTask,
  parseRoutePlan,
  parseRoutingCohort,
  parseRoutingHead,
} from '../domain/index.js';
import {
  assertProcessingRepository,
  assertRepository,
  assertRoutingRepository,
  assertCapabilityRepository,
} from './contract.js';
import {
  RepositoryConflictError,
  RepositoryOriginalConflictError,
  RepositoryOwnerError,
  RepositoryRoutingTargetError,
} from './errors.js';
import {
  applyOriginalOutcome,
  normalizeFinalizedOriginal,
  normalizeRejectedOriginal,
} from './import-outcome.js';
import {
  applyContentHashRegistration,
  applyDeterministicCompletion,
  applyNearDuplicateInputQuery,
  applyProcessingClaim,
  applyProcessingHeartbeat,
  applyRetryableProcessingFailure,
} from './processing-outcome.js';
import { makeExactCandidateId } from '../processing/identity.js';
import {
  applyEscalationSubmission,
  applyRoutingApproval,
  applyRoutingDraftSave,
} from './routing-outcome.js';
import {
  applyCapabilityBillingUncertain,
  applyCapabilityCalling,
  applyCapabilityClaim,
  applyCapabilityFailure,
  applyCapabilityPreparation,
  applyCapabilityQueued,
  applyCapabilityResult,
  applyCapabilitySettlement,
} from './capability-outcome.js';

const keyFor = (uid, id) => `${uid}/${id}`;

const MEMORY_COLLECTIONS = Object.freeze([
  'fragments',
  'importBatches',
  'processingTasks',
  'contentHashes',
  'duplicateCandidates',
  'routePlans',
  'routingHeads',
  'routingCohorts',
  'budgetLedgers',
  'budgetReservations',
  'capabilityExecutions',
  'capabilityResults',
  'escalationRequests',
]);

function createMemoryState() {
  return Object.fromEntries(MEMORY_COLLECTIONS.map((collection) => [collection, new Map()]));
}

export function applyMemoryWrites(state, writes) {
  const nextState = {};
  for (const collection of MEMORY_COLLECTIONS) {
    if (!(state?.[collection] instanceof Map)) throw new TypeError('Invalid memory state');
    nextState[collection] = new Map(state[collection]);
  }
  for (const write of writes) {
    if (!MEMORY_COLLECTIONS.includes(write?.collection)
      || typeof write.key !== 'string'
      || !write.key) {
      throw new TypeError('Invalid memory write');
    }
    nextState[write.collection].set(write.key, structuredClone(write.value));
  }
  return nextState;
}

function createStore(collection, parse, readState, commitWrites) {
  const objects = () => readState()[collection];

  function prepareWrite(uid, object) {
    const parsed = parse(object);
    return Object.freeze({
      collection,
      key: keyFor(uid, parsed.id),
      value: parsed,
    });
  }

  return {
    async create(uid, object) {
      if (uid !== object?.ownerId) throw new RepositoryOwnerError();

      const parsed = parse(object);
      const key = keyFor(uid, parsed.id);
      if (objects().has(key)) throw new RepositoryConflictError();

      commitWrites([prepareWrite(uid, parsed)]);
      return structuredClone(parsed);
    },

    async get(uid, id) {
      const stored = objects().get(keyFor(uid, id));
      return stored ? structuredClone(stored) : null;
    },

    read(uid, id) {
      return objects().get(keyFor(uid, id)) ?? null;
    },

    values(uid) {
      const prefix = `${uid}/`;
      return [...objects().entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([, value]) => value);
    },

    prepareWrite,
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

const cloneFrozen = (value) => deepFreeze(structuredClone(value));

export function createMemoryRepository() {
  let state = createMemoryState();
  const commitWrites = (writes) => {
    state = applyMemoryWrites(state, writes);
  };
  const fragments = createStore('fragments', parseFragment, () => state, commitWrites);
  const importBatches = createStore(
    'importBatches',
    parseImportBatch,
    () => state,
    commitWrites,
  );
  const processingTasks = createStore(
    'processingTasks',
    parseProcessingTask,
    () => state,
    commitWrites,
  );
  const duplicateCandidates = createStore(
    'duplicateCandidates',
    parseDuplicateCandidate,
    () => state,
    commitWrites,
  );
  const routePlans = createStore('routePlans', parseRoutePlan, () => state, commitWrites);
  const routingHeads = createStore('routingHeads', parseRoutingHead, () => state, commitWrites);
  const routingCohorts = createStore(
    'routingCohorts',
    parseRoutingCohort,
    () => state,
    commitWrites,
  );
  const budgetLedgers = createStore(
    'budgetLedgers',
    parseBudgetLedger,
    () => state,
    commitWrites,
  );
  const budgetReservations = createStore(
    'budgetReservations',
    parseBudgetReservation,
    () => state,
    commitWrites,
  );
  const capabilityExecutions = createStore(
    'capabilityExecutions',
    parseCapabilityExecution,
    () => state,
    commitWrites,
  );
  const capabilityResults = createStore(
    'capabilityResults',
    parseCapabilityResult,
    () => state,
    commitWrites,
  );
  const escalationRequests = createStore(
    'escalationRequests',
    parseEscalationRequest,
    () => state,
    commitWrites,
  );

  function prepareContentHashWrite(uid, sha256, input) {
    return Object.freeze({
      collection: 'contentHashes',
      key: keyFor(uid, sha256),
      value: parseContentHash(input),
    });
  }

  const cloneOutcome = (transition, storedFragment) => ({
    outcome: transition.outcome,
    batch: structuredClone(transition.batch),
    ...(storedFragment ? { fragment: structuredClone(storedFragment) } : {}),
  });

  async function finalizeOriginal(uid, input) {
    const normalized = normalizeFinalizedOriginal(uid, input);
    const storedBatch = importBatches.read(uid, normalized.batchId);
    const transition = applyOriginalOutcome(uid, storedBatch, normalized, 'finalized');
    const storedFragment = fragments.read(uid, normalized.fragmentId);

    if (transition.outcome === 'duplicate') {
      return cloneOutcome(transition, storedFragment);
    }
    if (storedFragment) throw new RepositoryOriginalConflictError();

    const fragmentWrite = fragments.prepareWrite(uid, normalized.fragment);
    const batchWrite = importBatches.prepareWrite(uid, transition.batch);
    commitWrites([fragmentWrite, batchWrite]);
    return cloneOutcome(transition, normalized.fragment);
  }

  async function rejectOriginal(uid, input) {
    const normalized = normalizeRejectedOriginal(uid, input);
    const storedBatch = importBatches.read(uid, normalized.batchId);
    const transition = applyOriginalOutcome(uid, storedBatch, normalized, 'failed');
    const storedFragment = fragments.read(uid, normalized.fragmentId);

    if (transition.outcome === 'duplicate') return cloneOutcome(transition, storedFragment);
    if (storedFragment) throw new RepositoryOriginalConflictError();

    commitWrites([importBatches.prepareWrite(uid, transition.batch)]);
    return cloneOutcome(transition, null);
  }

  async function claimProcessingTask(uid, input) {
    const storedTask = processingTasks.read(uid, input?.taskId);
    const storedFragment = fragments.read(uid, input?.fragmentId);
    const storedBatch = importBatches.read(uid, input?.batchId);
    const transition = applyProcessingClaim(
      uid,
      storedTask,
      storedFragment,
      storedBatch,
      input,
    );
    if (transition.outcome !== 'claimed') return cloneFrozen(transition);

    const taskWrite = processingTasks.prepareWrite(uid, transition.task);
    const fragmentWrite = fragments.prepareWrite(uid, transition.fragment);
    const batchWrite = importBatches.prepareWrite(uid, transition.batch);
    commitWrites([taskWrite, fragmentWrite, batchWrite]);
    return cloneFrozen(transition);
  }

  async function heartbeatProcessingTask(uid, input) {
    const transition = applyProcessingHeartbeat(
      uid,
      processingTasks.read(uid, input?.taskId),
      input,
    );
    const taskWrite = processingTasks.prepareWrite(uid, transition.task);
    commitWrites([taskWrite]);
    return cloneFrozen(transition);
  }

  async function failDeterministicProcessing(uid, input) {
    const storedTask = processingTasks.read(uid, input?.taskId);
    const storedBatch = storedTask
      ? importBatches.read(uid, storedTask.batchId)
      : null;
    const transition = applyRetryableProcessingFailure(uid, storedTask, storedBatch, input);
    if (transition.outcome === 'duplicate') return cloneFrozen(transition);

    const taskWrite = processingTasks.prepareWrite(uid, transition.task);
    const batchWrite = importBatches.prepareWrite(uid, transition.batch);
    commitWrites([taskWrite, batchWrite]);
    return cloneFrozen(transition);
  }

  async function registerContentHash(uid, input) {
    const storedTask = processingTasks.read(uid, input?.taskId);
    const storedFragment = storedTask
      ? fragments.read(uid, storedTask.fragmentId)
      : null;
    const storedContentHash = state.contentHashes.get(keyFor(uid, input?.sha256)) ?? null;
    const storedCanonicalFragment = storedContentHash
      ? fragments.read(uid, storedContentHash.canonicalFragmentRef.id)
      : null;
    let storedCandidate = null;
    if (storedTask && storedContentHash
      && storedContentHash.canonicalFragmentRef.id !== storedTask.fragmentId) {
      const candidateId = makeExactCandidateId({
        algorithmVersion: 'v1',
        canonicalFragmentId: storedContentHash.canonicalFragmentRef.id,
        candidateFragmentId: storedTask.fragmentId,
      });
      storedCandidate = duplicateCandidates.read(uid, candidateId);
    }
    const transition = applyContentHashRegistration(
      uid,
      storedTask,
      storedFragment,
      storedContentHash,
      storedCanonicalFragment,
      storedCandidate,
      input,
    );

    const taskWrite = processingTasks.prepareWrite(uid, transition.task);
    const fragmentWrite = fragments.prepareWrite(uid, transition.fragment);
    const contentHashWrite = prepareContentHashWrite(uid, input.sha256, transition.contentHash);
    const candidateWrite = transition.exactCandidate
      ? duplicateCandidates.prepareWrite(uid, transition.exactCandidate)
      : null;
    commitWrites([
      taskWrite,
      fragmentWrite,
      contentHashWrite,
      ...(candidateWrite ? [candidateWrite] : []),
    ]);
    return cloneFrozen(transition.result);
  }

  async function findNearDuplicateInputs(uid, input) {
    return applyNearDuplicateInputQuery(uid, fragments.values(uid), input);
  }

  async function completeDeterministicProcessing(uid, input) {
    const storedTask = processingTasks.read(uid, input?.taskId);
    const storedFragment = storedTask
      ? fragments.read(uid, storedTask.fragmentId)
      : null;
    const storedBatch = storedTask
      ? importBatches.read(uid, storedTask.batchId)
      : null;
    const storedCandidates = duplicateCandidates.values(uid);
    const hasExactCandidate = storedTask ? storedCandidates.some((candidate) => (
      candidate.kind === 'exact' && candidate.createdByTaskId === storedTask.id
    )) : false;
    const transition = applyDeterministicCompletion(
      uid,
      storedTask,
      storedFragment,
      storedBatch,
      fragments.values(uid),
      storedCandidates,
      hasExactCandidate,
      input,
    );
    if (transition.outcome === 'duplicate') return cloneFrozen(transition);

    const taskWrite = processingTasks.prepareWrite(uid, transition.task);
    const fragmentWrite = fragments.prepareWrite(uid, transition.fragment);
    const batchWrite = importBatches.prepareWrite(uid, transition.batch);
    const candidateWrites = transition.candidates.map((candidate) => (
      duplicateCandidates.prepareWrite(uid, candidate)
    ));
    commitWrites([taskWrite, fragmentWrite, batchWrite, ...candidateWrites]);
    return cloneFrozen(transition);
  }

  async function saveRoutingDraft(uid, input) {
    const routePlan = input?.routePlan;
    const storedBatch = importBatches.read(uid, routePlan?.batchRef?.id);
    const storedFragment = fragments.read(uid, routePlan?.fragmentRef?.id);
    const storedTask = processingTasks.read(uid, routePlan?.inputs?.deterministicTaskId);
    const transition = applyRoutingDraftSave({
      uid,
      batch: storedBatch,
      fragment: storedFragment,
      task: storedTask,
      storedPlan: routePlans.read(uid, routePlan?.id),
      plans: routePlans.values(uid),
      heads: routingHeads.values(uid),
      routePlan,
    });
    if (transition.outcome === 'duplicate') return cloneFrozen(transition);
    commitWrites([
      routePlans.prepareWrite(uid, transition.routePlan),
      importBatches.prepareWrite(uid, transition.batch),
    ]);
    return cloneFrozen(transition);
  }

  function directlyRelatedCandidates(uid, initialFragmentIds, taskIds) {
    const candidates = duplicateCandidates.values(uid);
    const selected = new Map(candidates
      .filter(({ createdByTaskId }) => taskIds.has(createdByTaskId))
      .map((candidate) => [candidate.id, candidate]));
    const members = new Set(initialFragmentIds);
    const queue = [...initialFragmentIds].sort();
    while (queue.length > 0 && members.size < 200) {
      const current = queue.shift();
      const adjacent = candidates
        .filter((candidate) => candidate.kind === 'near'
          && candidate.pairRefs.some(({ id }) => id === current))
        .sort((left, right) => left.id.localeCompare(right.id));
      for (const candidate of adjacent) {
        selected.set(candidate.id, candidate);
        for (const { id } of candidate.pairRefs) {
          if (!members.has(id) && members.size < 200) {
            members.add(id);
            queue.push(id);
            queue.sort();
          }
        }
      }
    }
    for (const candidate of selected.values()) {
      for (const { id } of candidate.pairRefs) {
        if (members.size < 200 || members.has(id)) members.add(id);
      }
    }
    return { candidates: [...selected.values()], memberIds: members };
  }

  async function loadRoutingSnapshot(uid, input) {
    const batch = importBatches.read(uid, input?.batchId);
    if (!batch) return null;
    const batchFragments = fragments.values(uid)
      .filter(({ batchId }) => batchId === batch.id)
      .sort((left, right) => left.id.localeCompare(right.id));
    const taskIds = new Set();
    const batchTasks = [];
    for (const fragment of batchFragments) {
      const deterministic = fragment.processing.deterministic;
      const task = deterministic ? processingTasks.read(uid, deterministic.taskId) : null;
      if (!deterministic
        || !['succeeded', 'failed_terminal'].includes(deterministic.state)
        || !task
        || !['succeeded', 'failed_terminal'].includes(task.state)) {
        throw new RepositoryRoutingTargetError();
      }
      taskIds.add(task.id);
      batchTasks.push(task);
    }
    const related = directlyRelatedCandidates(
      uid,
      batchFragments.map(({ id }) => id),
      taskIds,
    );
    const snapshotFragments = fragments.values(uid)
      .filter(({ id }) => related.memberIds.has(id))
      .sort((left, right) => left.id.localeCompare(right.id));
    const plans = routePlans.values(uid)
      .filter(({ batchRef }) => batchRef.id === batch.id)
      .sort((left, right) => left.id.localeCompare(right.id));
    const planIds = new Set(plans.map(({ id }) => id));
    const heads = routingHeads.values(uid)
      .filter(({ fragmentRef }) => related.memberIds.has(fragmentRef.id))
      .sort((left, right) => left.id.localeCompare(right.id));
    const cohorts = routingCohorts.values(uid)
      .filter(({ memberRefs }) => memberRefs.some(({ id }) => related.memberIds.has(id)))
      .sort((left, right) => left.id.localeCompare(right.id));
    const escalations = escalationRequests.values(uid)
      .filter(({ fromRoutePlanRef }) => planIds.has(fromRoutePlanRef.id))
      .sort((left, right) => left.id.localeCompare(right.id));
    const reservations = budgetReservations.values(uid)
      .filter(({ routePlanRef }) => planIds.has(routePlanRef.id))
      .sort((left, right) => left.id.localeCompare(right.id));
    const executions = capabilityExecutions.values(uid)
      .filter(({ routePlanRef }) => planIds.has(routePlanRef.id))
      .sort((left, right) => left.id.localeCompare(right.id));
    const executionIds = new Set(executions.map(({ id }) => id));
    const results = capabilityResults.values(uid)
      .filter(({ executionRef }) => executionIds.has(executionRef.id))
      .sort((left, right) => left.id.localeCompare(right.id));
    return cloneFrozen({
      batch,
      fragments: snapshotFragments,
      processingTasks: batchTasks.sort((left, right) => left.id.localeCompare(right.id)),
      duplicateCandidates: related.candidates.sort((left, right) => left.id.localeCompare(right.id)),
      routePlans: plans,
      routingHeads: heads,
      routingCohorts: cohorts,
      budgetReservations: reservations,
      capabilityExecutions: executions,
      capabilityResults: results,
      escalationRequests: escalations,
    });
  }

  async function commitRoutingApproval(uid, input) {
    const storedBatch = importBatches.read(uid, input?.batchId);
    if (!storedBatch) throw new RepositoryRoutingTargetError();
    for (const cohort of input?.cohorts ?? []) {
      if (cohort?.ownerId !== uid) throw new RepositoryOwnerError();
      const stored = routingCohorts.read(uid, cohort.id);
      if (stored && JSON.stringify(stored) !== JSON.stringify(cohort)) {
        throw new RepositoryConflictError();
      }
    }
    const transition = applyRoutingApproval({
      uid,
      batch: storedBatch,
      approvals: input?.approvals,
      cohortInputs: input?.cohorts ?? [],
      fragments: fragments.values(uid),
      tasks: processingTasks.values(uid),
      plans: routePlans.values(uid),
      heads: routingHeads.values(uid),
      ledgers: budgetLedgers.values(uid),
      now: input?.approvedAt,
    });
    if (transition.outcome === 'duplicate') return cloneFrozen(transition);
    commitWrites([
      ...transition.supersededPlans.map((plan) => routePlans.prepareWrite(uid, plan)),
      ...transition.plans.map((plan) => routePlans.prepareWrite(uid, plan)),
      ...transition.heads.map((head) => routingHeads.prepareWrite(uid, head)),
      ...transition.cohorts.map((cohort) => routingCohorts.prepareWrite(uid, cohort)),
      ...transition.reservations.map((reservation) => (
        budgetReservations.prepareWrite(uid, reservation)
      )),
      ...transition.ledgers.map((ledger) => budgetLedgers.prepareWrite(uid, ledger)),
      importBatches.prepareWrite(uid, transition.batch),
    ]);
    return cloneFrozen(transition);
  }

  async function submitEscalationRequest(uid, input) {
    const transition = applyEscalationSubmission(
      uid,
      escalationRequests.read(uid, input?.id),
      input,
      routePlans.values(uid),
    );
    if (transition.outcome === 'created') {
      commitWrites([escalationRequests.prepareWrite(uid, transition.request)]);
    }
    return cloneFrozen(transition);
  }

  function capabilityState(uid, executionId) {
    const execution = capabilityExecutions.read(uid, executionId);
    const routePlan = routePlans.read(uid, execution?.routePlanRef.id);
    const batch = importBatches.read(uid, routePlan?.batchRef.id);
    const reservation = budgetReservations.read(uid, execution?.reservationRef.id);
    const fragment = fragments.read(uid, execution?.fragmentRef.id);
    const head = routingHeads.values(uid)
      .find(({ fragmentRef }) => fragmentRef.id === execution?.fragmentRef.id) ?? null;
    const result = capabilityResults.read(uid, execution?.resultRef?.id);
    const plans = routePlans.values(uid).filter(({ batchRef }) => batch && batchRef.id === batch.id);
    const planIds = new Set(plans.map(({ id }) => id));
    return {
      execution,
      routePlan,
      batch,
      reservation,
      fragment,
      head,
      result,
      plans,
      executions: capabilityExecutions.values(uid).filter(({ routePlanRef }) => (
        planIds.has(routePlanRef.id)
      )),
      results: capabilityResults.values(uid).filter(({ routePlanRef }) => (
        planIds.has(routePlanRef.id)
      )),
      heads: routingHeads.values(uid).filter(({ currentPlanRef }) => (
        planIds.has(currentPlanRef.id)
      )),
      escalations: escalationRequests.values(uid).filter(({ fromRoutePlanRef }) => (
        planIds.has(fromRoutePlanRef.id)
      )),
    };
  }

  async function prepareCapabilityExecution(uid, input) {
    const execution = input?.execution;
    const routePlan = routePlans.read(uid, execution?.routePlanRef?.id);
    const fragment = fragments.read(uid, execution?.fragmentRef?.id);
    const head = routingHeads.values(uid)
      .find(({ fragmentRef }) => fragmentRef.id === fragment?.id) ?? null;
    const reservation = budgetReservations.read(uid, execution?.reservationRef?.id);
    const transition = applyCapabilityPreparation({
      uid,
      execution,
      storedExecution: capabilityExecutions.read(uid, execution?.id),
      plan: routePlan,
      head,
      fragment,
      reservation,
      supportedVersions: input?.supportedVersions,
    });
    if (transition.outcome === 'created') {
      commitWrites([capabilityExecutions.prepareWrite(uid, transition.execution)]);
    }
    return cloneFrozen(transition);
  }

  async function markCapabilityQueued(uid, input) {
    const transition = applyCapabilityQueued(
      uid,
      capabilityExecutions.read(uid, input?.executionId),
      input,
    );
    if (transition.outcome === 'applied') {
      commitWrites([capabilityExecutions.prepareWrite(uid, transition.execution)]);
    }
    return cloneFrozen(transition);
  }

  async function claimCapabilityExecution(uid, input) {
    const current = capabilityState(uid, input?.executionId);
    const transition = applyCapabilityClaim({
      uid,
      ...current,
      plan: current.routePlan,
      supportedVersions: input?.supportedVersions,
      input,
    });
    if (transition.outcome === 'claimed') {
      commitWrites([
        routePlans.prepareWrite(uid, transition.routePlan),
        capabilityExecutions.prepareWrite(uid, transition.execution),
      ]);
    }
    return cloneFrozen(transition);
  }

  async function markCapabilityCalling(uid, input) {
    const current = capabilityState(uid, input?.executionId);
    const transition = applyCapabilityCalling(uid, current.execution, current.reservation, input);
    if (transition.outcome === 'applied') {
      commitWrites([capabilityExecutions.prepareWrite(uid, transition.execution)]);
    }
    return cloneFrozen(transition);
  }

  async function recordCapabilityResult(uid, input) {
    const current = capabilityState(uid, input?.executionId);
    const transition = applyCapabilityResult({
      uid,
      execution: current.execution,
      reservation: current.reservation,
      storedResult: capabilityResults.read(uid, input?.result?.id),
      input,
    });
    if (transition.outcome === 'applied') {
      commitWrites([
        capabilityResults.prepareWrite(uid, transition.result),
        capabilityExecutions.prepareWrite(uid, transition.execution),
      ]);
    }
    return cloneFrozen(transition);
  }

  async function settleCapabilityExecution(uid, input) {
    const current = capabilityState(uid, input?.executionId);
    const transition = applyCapabilitySettlement({
      uid,
      ...current,
      ledgers: current.reservation?.ledgerRefs.map(({ id }) => (
        budgetLedgers.read(uid, id)
      )).filter(Boolean) ?? [],
      input,
    });
    if (transition.outcome === 'duplicate') return cloneFrozen(transition);
    commitWrites([
      capabilityExecutions.prepareWrite(uid, transition.execution),
      budgetReservations.prepareWrite(uid, transition.reservation),
      ...transition.ledgers.map((ledger) => budgetLedgers.prepareWrite(uid, ledger)),
      routePlans.prepareWrite(uid, transition.routePlan),
      importBatches.prepareWrite(uid, transition.batch),
      fragments.prepareWrite(uid, transition.fragment),
    ]);
    return cloneFrozen(transition);
  }

  async function failCapabilityExecution(uid, input) {
    const current = capabilityState(uid, input?.executionId);
    const transition = applyCapabilityFailure({
      uid,
      ...current,
      ledgers: current.reservation?.ledgerRefs.map(({ id }) => (
        budgetLedgers.read(uid, id)
      )).filter(Boolean) ?? [],
      input,
    });
    if (transition.outcome === 'duplicate') return cloneFrozen(transition);
    commitWrites([
      capabilityExecutions.prepareWrite(uid, transition.execution),
      budgetReservations.prepareWrite(uid, transition.reservation),
      ...transition.ledgers.map((ledger) => budgetLedgers.prepareWrite(uid, ledger)),
      ...(transition.result ? [capabilityResults.prepareWrite(uid, transition.result)] : []),
      routePlans.prepareWrite(uid, transition.routePlan),
      importBatches.prepareWrite(uid, transition.batch),
    ]);
    return cloneFrozen(transition);
  }

  async function markCapabilityBillingUncertain(uid, input) {
    const current = capabilityState(uid, input?.executionId);
    const transition = applyCapabilityBillingUncertain({ uid, ...current, input });
    if (transition.outcome === 'duplicate') return cloneFrozen(transition);
    commitWrites([
      capabilityExecutions.prepareWrite(uid, transition.execution),
      routePlans.prepareWrite(uid, transition.routePlan),
      importBatches.prepareWrite(uid, transition.batch),
    ]);
    return cloneFrozen(transition);
  }

  const repository = assertRepository({
    createFragment: fragments.create,
    getFragment: fragments.get,
    createImportBatch: importBatches.create,
    getImportBatch: importBatches.get,
    finalizeOriginal,
    rejectOriginal,
    claimProcessingTask,
    heartbeatProcessingTask,
    registerContentHash,
    findNearDuplicateInputs,
    completeDeterministicProcessing,
    failDeterministicProcessing,
    saveRoutingDraft,
    loadRoutingSnapshot,
    commitRoutingApproval,
    submitEscalationRequest,
    prepareCapabilityExecution,
    markCapabilityQueued,
    claimCapabilityExecution,
    markCapabilityCalling,
    recordCapabilityResult,
    settleCapabilityExecution,
    failCapabilityExecution,
    markCapabilityBillingUncertain,
  });
  assertProcessingRepository(repository);
  assertRoutingRepository(repository);
  return assertCapabilityRepository(repository);
}
