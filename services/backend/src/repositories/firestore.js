import { FieldPath } from 'firebase-admin/firestore';
import {
  parseBudgetLedger,
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
  deriveProposedNearCandidateIds,
} from './processing-outcome.js';
import { makeExactCandidateId } from '../processing/identity.js';
import {
  makeBudgetLedgerId,
  makeRoutingHeadId,
} from '../routing/identity.js';
import {
  applyEscalationSubmission,
  applyRoutingApproval,
  applyRoutingDraftSave,
} from './routing-outcome.js';

const isConflict = (error) => (
  error?.code === 6
  || error?.code === '6'
  || error?.code === 'already-exists'
);

export function createFirestoreRepository({ db }) {
  if (!db) throw new TypeError('Firestore database is required');

  const document = (uid, collection, id) => db.doc(`users/${uid}/${collection}/${id}`);
  const collection = (uid, name) => db.collection(`users/${uid}/${name}`);
  const dataOrNull = (snapshot) => (snapshot.exists ? snapshot.data() : null);
  const sortById = (values) => values.sort((left, right) => left.id.localeCompare(right.id));
  const cloneFrozen = (value) => {
    const cloned = structuredClone(value);
    const freeze = (input) => {
      if (!input || typeof input !== 'object' || Object.isFrozen(input)) return input;
      for (const child of Object.values(input)) freeze(child);
      return Object.freeze(input);
    };
    return freeze(cloned);
  };

  const chunks = (values, size = 30) => Array.from(
    { length: Math.ceil(values.length / size) },
    (_, index) => values.slice(index * size, (index + 1) * size),
  );

  async function transactionGetAll(transaction, references) {
    return references.length > 0 ? transaction.getAll(...references) : [];
  }

  async function databaseGetAll(references) {
    return references.length > 0 ? db.getAll(...references) : [];
  }

  async function create(uid, input, collection, parse) {
    if (uid !== input?.ownerId) throw new RepositoryOwnerError();

    const parsed = parse(input);
    try {
      await document(uid, collection, parsed.id).create(parsed);
    } catch (error) {
      if (isConflict(error)) throw new RepositoryConflictError();
      throw error;
    }
    return parsed;
  }

  async function get(uid, id, collection, parse) {
    const snapshot = await document(uid, collection, id).get();
    return snapshot.exists ? parse(snapshot.data()) : null;
  }

  async function applyInTransaction(uid, input, state) {
    const normalized = state === 'finalized'
      ? normalizeFinalizedOriginal(uid, input)
      : normalizeRejectedOriginal(uid, input);
    const batchRef = document(uid, 'importBatches', normalized.batchId);
    const fragmentRef = document(uid, 'fragments', normalized.fragmentId);

    try {
      return await db.runTransaction(async (transaction) => {
        const batchSnapshot = await transaction.get(batchRef);
        const fragmentSnapshot = await transaction.get(fragmentRef);
        const batch = batchSnapshot.exists ? parseImportBatch(batchSnapshot.data()) : null;
        const storedFragment = fragmentSnapshot.exists
          ? parseFragment(fragmentSnapshot.data())
          : null;
        const transition = applyOriginalOutcome(uid, batch, normalized, state);

        if (transition.outcome === 'duplicate') {
          return {
            outcome: 'duplicate',
            batch: transition.batch,
            ...(storedFragment ? { fragment: storedFragment } : {}),
          };
        }
        if (storedFragment) throw new RepositoryOriginalConflictError();

        if (state === 'finalized') transaction.create(fragmentRef, normalized.fragment);
        transaction.set(batchRef, transition.batch);
        return {
          outcome: 'applied',
          batch: transition.batch,
          ...(state === 'finalized' ? { fragment: normalized.fragment } : {}),
        };
      });
    } catch (error) {
      if (isConflict(error)) throw new RepositoryOriginalConflictError();
      throw error;
    }
  }

  async function claimProcessingTask(uid, input) {
    const taskRef = document(uid, 'processingTasks', input?.taskId);
    const fragmentRef = document(uid, 'fragments', input?.fragmentId);
    const batchRef = document(uid, 'importBatches', input?.batchId);
    return db.runTransaction(async (transaction) => {
      const taskSnapshot = await transaction.get(taskRef);
      const fragmentSnapshot = await transaction.get(fragmentRef);
      const batchSnapshot = await transaction.get(batchRef);
      const transition = applyProcessingClaim(
        uid,
        dataOrNull(taskSnapshot),
        dataOrNull(fragmentSnapshot),
        dataOrNull(batchSnapshot),
        input,
      );
      if (transition.outcome !== 'claimed') return transition;

      transaction.set(taskRef, transition.task);
      transaction.set(fragmentRef, transition.fragment);
      transaction.set(batchRef, transition.batch);
      return transition;
    });
  }

  async function heartbeatProcessingTask(uid, input) {
    const taskRef = document(uid, 'processingTasks', input?.taskId);
    return db.runTransaction(async (transaction) => {
      const taskSnapshot = await transaction.get(taskRef);
      const transition = applyProcessingHeartbeat(uid, dataOrNull(taskSnapshot), input);
      transaction.set(taskRef, transition.task);
      return transition;
    });
  }

  async function failDeterministicProcessing(uid, input) {
    const taskRef = document(uid, 'processingTasks', input?.taskId);
    return db.runTransaction(async (transaction) => {
      const taskSnapshot = await transaction.get(taskRef);
      const task = dataOrNull(taskSnapshot);
      const batchRef = task ? document(uid, 'importBatches', task.batchId) : null;
      const batchSnapshot = batchRef ? await transaction.get(batchRef) : null;
      const transition = applyRetryableProcessingFailure(
        uid,
        task,
        batchSnapshot ? dataOrNull(batchSnapshot) : null,
        input,
      );
      if (transition.outcome === 'duplicate') return transition;

      transaction.set(taskRef, transition.task);
      transaction.set(batchRef, transition.batch);
      return transition;
    });
  }

  async function registerContentHash(uid, input) {
    const taskRef = document(uid, 'processingTasks', input?.taskId);
    const contentHashRef = document(uid, 'contentHashes', input?.sha256);
    return db.runTransaction(async (transaction) => {
      const taskSnapshot = await transaction.get(taskRef);
      const task = dataOrNull(taskSnapshot);
      const fragmentRef = task ? document(uid, 'fragments', task.fragmentId) : null;
      const fragmentSnapshot = fragmentRef ? await transaction.get(fragmentRef) : null;
      const contentHashSnapshot = await transaction.get(contentHashRef);
      const contentHash = dataOrNull(contentHashSnapshot);
      const canonicalFragmentRef = contentHash
        ? document(uid, 'fragments', contentHash.canonicalFragmentRef.id)
        : null;
      const canonicalFragmentSnapshot = canonicalFragmentRef
        ? await transaction.get(canonicalFragmentRef)
        : null;
      const candidateId = task && contentHash
        && contentHash.canonicalFragmentRef.id !== task.fragmentId
        ? makeExactCandidateId({
          algorithmVersion: 'v1',
          canonicalFragmentId: contentHash.canonicalFragmentRef.id,
          candidateFragmentId: task.fragmentId,
        })
        : null;
      const candidateRef = candidateId
        ? document(uid, 'duplicateCandidates', candidateId)
        : null;
      const candidateSnapshot = candidateRef ? await transaction.get(candidateRef) : null;
      const transition = applyContentHashRegistration(
        uid,
        task,
        fragmentSnapshot ? dataOrNull(fragmentSnapshot) : null,
        contentHash,
        canonicalFragmentSnapshot ? dataOrNull(canonicalFragmentSnapshot) : null,
        candidateSnapshot ? dataOrNull(candidateSnapshot) : null,
        input,
      );

      transaction.set(taskRef, transition.task);
      transaction.set(fragmentRef, transition.fragment);
      if (contentHashSnapshot.exists) {
        transaction.set(contentHashRef, transition.contentHash);
      } else {
        transaction.create(contentHashRef, transition.contentHash);
      }
      if (transition.exactCandidate) {
        transaction.set(
          document(uid, 'duplicateCandidates', transition.exactCandidate.id),
          transition.exactCandidate,
        );
      }
      return transition.result;
    });
  }

  async function findNearDuplicateInputs(uid, input) {
    applyNearDuplicateInputQuery(uid, [], input);
    const snapshot = await collection(uid, 'fragments')
      .where('hashes.perceptualHashBands', 'array-contains-any', input.bands)
      .orderBy(FieldPath.documentId(), 'asc')
      .limit(202)
      .get();
    return applyNearDuplicateInputQuery(
      uid,
      snapshot.docs.map((candidate) => candidate.data()),
      input,
    );
  }

  async function completeDeterministicProcessing(uid, input) {
    const taskRef = document(uid, 'processingTasks', input?.taskId);
    return db.runTransaction(async (transaction) => {
      const taskSnapshot = await transaction.get(taskRef);
      const task = dataOrNull(taskSnapshot);
      if (task && ['succeeded', 'failed_terminal'].includes(task.state)) {
        return applyDeterministicCompletion(uid, task, null, null, [], [], false, input);
      }

      const fragmentRef = task ? document(uid, 'fragments', task.fragmentId) : null;
      const batchRef = task ? document(uid, 'importBatches', task.batchId) : null;
      const fragmentSnapshot = fragmentRef ? await transaction.get(fragmentRef) : null;
      const batchSnapshot = batchRef ? await transaction.get(batchRef) : null;
      const proposedCandidateIds = deriveProposedNearCandidateIds(uid, task, input);
      const matchedIds = input.nearMatches.map((match) => match.fragmentId);
      const matchedSnapshots = [];
      for (const fragmentId of matchedIds) {
        matchedSnapshots.push(await transaction.get(document(uid, 'fragments', fragmentId)));
      }
      const candidatesSnapshot = task
        ? await transaction.get(collection(uid, 'duplicateCandidates')
          .where('createdByTaskId', '==', task.id))
        : null;
      const proposedCandidateSnapshots = [];
      for (const candidateId of proposedCandidateIds) {
        proposedCandidateSnapshots.push(await transaction.get(
          document(uid, 'duplicateCandidates', candidateId),
        ));
      }
      const existingCandidatesById = new Map((candidatesSnapshot
        ? candidatesSnapshot.docs.map((candidate) => candidate.data())
        : []).map((candidate) => [candidate.id, candidate]));
      for (const candidateSnapshot of proposedCandidateSnapshots) {
        if (candidateSnapshot.exists) {
          const candidate = candidateSnapshot.data();
          existingCandidatesById.set(candidate.id, candidate);
        }
      }
      const existingCandidates = [...existingCandidatesById.values()];
      const transition = applyDeterministicCompletion(
        uid,
        task,
        fragmentSnapshot ? dataOrNull(fragmentSnapshot) : null,
        batchSnapshot ? dataOrNull(batchSnapshot) : null,
        matchedSnapshots.filter((snapshot) => snapshot.exists).map((snapshot) => snapshot.data()),
        existingCandidates,
        existingCandidates.some((candidate) => candidate.kind === 'exact'),
        input,
      );
      if (transition.outcome === 'duplicate') return transition;

      transaction.set(taskRef, transition.task);
      transaction.set(fragmentRef, transition.fragment);
      transaction.set(batchRef, transition.batch);
      for (const candidate of transition.candidates) {
        transaction.set(document(uid, 'duplicateCandidates', candidate.id), candidate);
      }
      return transition;
    });
  }

  async function saveRoutingDraft(uid, input) {
    const routePlan = input?.routePlan;
    const batchRef = document(uid, 'importBatches', routePlan?.batchRef?.id);
    const fragmentRef = document(uid, 'fragments', routePlan?.fragmentRef?.id);
    const taskRef = document(uid, 'processingTasks', routePlan?.inputs?.deterministicTaskId);
    const planRef = document(uid, 'routePlans', routePlan?.id);
    return db.runTransaction(async (transaction) => {
      const [batchSnapshot, fragmentSnapshot, taskSnapshot, planSnapshot] = await Promise.all([
        transaction.get(batchRef),
        transaction.get(fragmentRef),
        transaction.get(taskRef),
        transaction.get(planRef),
      ]);
      const batch = dataOrNull(batchSnapshot);
      const batchFragmentIds = batch
        ? Object.values(batch.uploads)
          .filter(({ state }) => state === 'finalized')
          .map(({ fragmentId }) => fragmentId)
          .sort()
        : [];
      const headSnapshots = await transactionGetAll(
        transaction,
        batchFragmentIds.map((fragmentId) => document(
          uid,
          'routingHeads',
          makeRoutingHeadId({ ownerId: uid, fragmentId, routerName: 'fragment-routing' }),
        )),
      );
      const plansSnapshot = batch
        ? await transaction.get(collection(uid, 'routePlans').where('batchRef.id', '==', batch.id))
        : null;
      const transition = applyRoutingDraftSave({
        uid,
        batch,
        fragment: dataOrNull(fragmentSnapshot),
        task: dataOrNull(taskSnapshot),
        storedPlan: dataOrNull(planSnapshot),
        plans: sortById(plansSnapshot?.docs.map((snapshot) => snapshot.data()) ?? []),
        heads: sortById(headSnapshots
          .filter(({ exists }) => exists)
          .map((snapshot) => snapshot.data())),
        routePlan,
      });
      if (transition.outcome === 'duplicate') return transition;
      transaction.create(planRef, transition.routePlan);
      transaction.set(batchRef, transition.batch);
      return transition;
    });
  }

  async function loadCandidatesForTasks(uid, taskIds) {
    const candidatesById = new Map();
    for (const taskChunk of chunks(taskIds)) {
      const snapshot = await collection(uid, 'duplicateCandidates')
        .where('createdByTaskId', 'in', taskChunk)
        .get();
      for (const candidate of sortById(snapshot.docs.map((doc) => doc.data()))) {
        candidatesById.set(candidate.id, parseDuplicateCandidate(candidate));
      }
    }
    return candidatesById;
  }

  async function closeNearCandidateGraph(uid, initialIds, candidatesById) {
    const memberIds = new Set(initialIds);
    const queue = [...initialIds].sort();
    while (queue.length > 0 && memberIds.size < 200) {
      const fragmentId = queue.shift();
      const snapshot = await collection(uid, 'duplicateCandidates')
        .where('pairRefs', 'array-contains', { type: 'fragment', id: fragmentId })
        .get();
      const adjacent = sortById(snapshot.docs.map((doc) => doc.data()))
        .filter(({ kind }) => kind === 'near');
      for (const candidateInput of adjacent) {
        const candidate = parseDuplicateCandidate(candidateInput);
        candidatesById.set(candidate.id, candidate);
        for (const { id } of candidate.pairRefs) {
          if (!memberIds.has(id) && memberIds.size < 200) {
            memberIds.add(id);
            queue.push(id);
            queue.sort();
          }
        }
      }
    }
    for (const candidate of candidatesById.values()) {
      for (const { id } of candidate.pairRefs) {
        if (memberIds.size < 200 || memberIds.has(id)) memberIds.add(id);
      }
    }
    return memberIds;
  }

  async function loadRoutingSnapshot(uid, input) {
    const batchSnapshot = await document(uid, 'importBatches', input?.batchId).get();
    if (!batchSnapshot.exists) return null;
    const batch = parseImportBatch(batchSnapshot.data());
    const batchFragmentIds = Object.values(batch.uploads)
      .filter(({ state }) => state === 'finalized')
      .map(({ fragmentId }) => fragmentId)
      .sort();
    const fragmentSnapshots = await databaseGetAll(batchFragmentIds.map((id) => (
      document(uid, 'fragments', id)
    )));
    const batchFragments = sortById(fragmentSnapshots
      .filter(({ exists }) => exists)
      .map((snapshot) => parseFragment(snapshot.data())));
    if (batchFragments.length !== batchFragmentIds.length) throw new RepositoryRoutingTargetError();
    const taskIds = batchFragments.map((fragment) => fragment.processing.deterministic?.taskId);
    if (taskIds.some((id) => !id)) throw new RepositoryRoutingTargetError();
    const taskSnapshots = await databaseGetAll(taskIds.map((id) => (
      document(uid, 'processingTasks', id)
    )));
    const processingTasks = sortById(taskSnapshots
      .filter(({ exists }) => exists)
      .map((snapshot) => parseProcessingTask(snapshot.data())));
    if (processingTasks.length !== taskIds.length
      || processingTasks.some(({ state }) => !['succeeded', 'failed_terminal'].includes(state))
      || batchFragments.some(({ processing }) => (
        !['succeeded', 'failed_terminal'].includes(processing.deterministic?.state)
      ))) throw new RepositoryRoutingTargetError();

    const candidatesById = await loadCandidatesForTasks(uid, taskIds);
    const memberIds = await closeNearCandidateGraph(uid, batchFragmentIds, candidatesById);
    const memberSnapshots = await databaseGetAll([...memberIds].sort().map((id) => (
      document(uid, 'fragments', id)
    )));
    const snapshotFragments = sortById(memberSnapshots
      .filter(({ exists }) => exists)
      .map((snapshot) => parseFragment(snapshot.data())));
    const plansSnapshot = await collection(uid, 'routePlans')
      .where('batchRef.id', '==', batch.id)
      .get();
    const routePlans = sortById(plansSnapshot.docs.map((snapshot) => (
      parseRoutePlan(snapshot.data())
    )));
    const headSnapshots = await databaseGetAll([...memberIds].sort().map((fragmentId) => (
      document(
        uid,
        'routingHeads',
        makeRoutingHeadId({ ownerId: uid, fragmentId, routerName: 'fragment-routing' }),
      )
    )));
    const routingHeads = sortById(headSnapshots
      .filter(({ exists }) => exists)
      .map((snapshot) => parseRoutingHead(snapshot.data())));
    const cohortsById = new Map();
    for (const fragmentId of [...memberIds].sort()) {
      const snapshot = await collection(uid, 'routingCohorts')
        .where('memberRefs', 'array-contains', { type: 'fragment', id: fragmentId })
        .get();
      for (const cohort of sortById(snapshot.docs.map((doc) => doc.data()))) {
        cohortsById.set(cohort.id, parseRoutingCohort(cohort));
      }
    }
    const escalationById = new Map();
    for (const planIdChunk of chunks(routePlans.map(({ id }) => id))) {
      const snapshot = await collection(uid, 'escalationRequests')
        .where('fromRoutePlanRef.id', 'in', planIdChunk)
        .get();
      for (const request of sortById(snapshot.docs.map((doc) => doc.data()))) {
        escalationById.set(request.id, parseEscalationRequest(request));
      }
    }
    return cloneFrozen({
      batch,
      fragments: snapshotFragments,
      processingTasks,
      duplicateCandidates: sortById([...candidatesById.values()]),
      routePlans,
      routingHeads,
      routingCohorts: sortById([...cohortsById.values()]),
      escalationRequests: sortById([...escalationById.values()]),
    });
  }

  function ledgerIdsForApproval(uid, batchId, routePlanId, capabilityIntents, now) {
    const ids = [];
    for (const [capability, intent] of Object.entries(capabilityIntents)) {
      if (intent?.decision !== 'approve') continue;
      ids.push(
        makeBudgetLedgerId({ ownerId: uid, type: 'user_day', key: now.slice(0, 10) }),
        makeBudgetLedgerId({ ownerId: uid, type: 'batch', key: batchId }),
        makeBudgetLedgerId({ ownerId: uid, type: 'route', key: routePlanId }),
        makeBudgetLedgerId({
          ownerId: uid,
          type: 'capability',
          key: capability,
          routePlanId,
        }),
      );
    }
    return [...new Set(ids)].sort();
  }

  async function commitRoutingApproval(uid, input) {
    const batchRef = document(uid, 'importBatches', input?.batchId);
    return db.runTransaction(async (transaction) => {
      const batchSnapshot = await transaction.get(batchRef);
      const batch = dataOrNull(batchSnapshot);
      if (!batch) throw new RepositoryRoutingTargetError();
      const planRefs = (input?.approvals ?? []).map(({ routePlanId }) => (
        document(uid, 'routePlans', routePlanId)
      ));
      const planSnapshots = await transactionGetAll(transaction, planRefs);
      const requestedPlans = planSnapshots
        .filter(({ exists }) => exists)
        .map((snapshot) => snapshot.data());
      if (requestedPlans.length !== planRefs.length) throw new RepositoryRoutingTargetError();
      const fragmentIds = new Set([
        ...requestedPlans.map(({ fragmentRef }) => fragmentRef.id),
        ...(input?.cohorts ?? []).flatMap(({ memberRefs }) => memberRefs.map(({ id }) => id)),
      ]);
      const fragmentSnapshots = await transactionGetAll(
        transaction,
        [...fragmentIds].sort().map((id) => document(uid, 'fragments', id)),
      );
      const taskSnapshots = await transactionGetAll(
        transaction,
        requestedPlans.map(({ inputs }) => document(
          uid,
          'processingTasks',
          inputs.deterministicTaskId,
        )),
      );
      const headRefs = requestedPlans.map(({ fragmentRef }) => document(
        uid,
        'routingHeads',
        makeRoutingHeadId({
          ownerId: uid,
          fragmentId: fragmentRef.id,
          routerName: 'fragment-routing',
        }),
      ));
      const headSnapshots = await transactionGetAll(transaction, headRefs);
      const allPlansSnapshot = await transaction.get(
        collection(uid, 'routePlans').where('batchRef.id', '==', batch.id),
      );
      const ledgerIds = (input?.approvals ?? []).flatMap(({ routePlanId, capabilityIntents }) => (
        ledgerIdsForApproval(uid, batch.id, routePlanId, capabilityIntents, input.approvedAt)
      ));
      const ledgerSnapshots = await transactionGetAll(
        transaction,
        [...new Set(ledgerIds)].sort().map((id) => document(uid, 'budgetLedgers', id)),
      );
      const cohortRefs = (input?.cohorts ?? []).map(({ id }) => (
        document(uid, 'routingCohorts', id)
      ));
      const cohortSnapshots = await transactionGetAll(transaction, cohortRefs);
      for (const [index, snapshot] of cohortSnapshots.entries()) {
        const inputCohort = input.cohorts[index];
        if (inputCohort.ownerId !== uid) throw new RepositoryOwnerError();
        if (snapshot.exists && JSON.stringify(snapshot.data()) !== JSON.stringify(inputCohort)) {
          throw new RepositoryConflictError();
        }
      }
      const transition = applyRoutingApproval({
        uid,
        batch,
        approvals: input?.approvals,
        cohortInputs: input?.cohorts ?? [],
        fragments: sortById(fragmentSnapshots
          .filter(({ exists }) => exists)
          .map((snapshot) => parseFragment(snapshot.data()))),
        tasks: sortById(taskSnapshots
          .filter(({ exists }) => exists)
          .map((snapshot) => parseProcessingTask(snapshot.data()))),
        plans: sortById(allPlansSnapshot.docs.map((snapshot) => (
          parseRoutePlan(snapshot.data())
        ))),
        heads: sortById(headSnapshots
          .filter(({ exists }) => exists)
          .map((snapshot) => parseRoutingHead(snapshot.data()))),
        ledgers: sortById(ledgerSnapshots
          .filter(({ exists }) => exists)
          .map((snapshot) => parseBudgetLedger(snapshot.data()))),
        now: input?.approvedAt,
      });
      if (transition.outcome === 'duplicate') return transition;
      for (const plan of [...transition.supersededPlans, ...transition.plans]) {
        transaction.set(document(uid, 'routePlans', plan.id), plan);
      }
      for (const head of transition.heads) {
        transaction.set(document(uid, 'routingHeads', head.id), head);
      }
      for (const [index, cohort] of transition.cohorts.entries()) {
        if (!cohortSnapshots[index]?.exists) {
          transaction.create(document(uid, 'routingCohorts', cohort.id), cohort);
        }
      }
      for (const reservation of transition.reservations) {
        transaction.create(document(uid, 'budgetReservations', reservation.id), reservation);
      }
      for (const ledger of transition.ledgers) {
        transaction.set(document(uid, 'budgetLedgers', ledger.id), ledger);
      }
      transaction.set(batchRef, transition.batch);
      return transition;
    });
  }

  async function submitEscalationRequest(uid, input) {
    const requestRef = document(uid, 'escalationRequests', input?.id);
    const planRef = document(uid, 'routePlans', input?.fromRoutePlanRef?.id);
    return db.runTransaction(async (transaction) => {
      const [requestSnapshot, planSnapshot] = await Promise.all([
        transaction.get(requestRef),
        transaction.get(planRef),
      ]);
      const transition = applyEscalationSubmission(
        uid,
        dataOrNull(requestSnapshot),
        input,
        planSnapshot.exists ? [parseRoutePlan(planSnapshot.data())] : [],
      );
      if (transition.outcome === 'created') transaction.create(requestRef, transition.request);
      return transition;
    });
  }

  const capabilityLifecyclePending = async () => {
    throw new RepositoryRoutingTargetError('Capability authorization is not implemented');
  };

  const repository = assertRepository({
    createFragment: (uid, input) => create(uid, input, 'fragments', parseFragment),
    getFragment: (uid, id) => get(uid, id, 'fragments', parseFragment),
    createImportBatch: (uid, input) => create(uid, input, 'importBatches', parseImportBatch),
    getImportBatch: (uid, id) => get(uid, id, 'importBatches', parseImportBatch),
    finalizeOriginal: (uid, input) => applyInTransaction(uid, input, 'finalized'),
    rejectOriginal: (uid, input) => applyInTransaction(uid, input, 'failed'),
    claimProcessingTask,
    heartbeatProcessingTask,
    failDeterministicProcessing,
    registerContentHash,
    findNearDuplicateInputs,
    completeDeterministicProcessing,
    saveRoutingDraft,
    loadRoutingSnapshot,
    commitRoutingApproval,
    submitEscalationRequest,
    claimCapabilityExecution: capabilityLifecyclePending,
    markCapabilityCalling: capabilityLifecyclePending,
    recordCapabilityReceipt: capabilityLifecyclePending,
    settleCapabilityExecution: capabilityLifecyclePending,
    markCapabilityBillingUncertain: capabilityLifecyclePending,
  });
  assertProcessingRepository(repository);
  return assertRoutingRepository(repository);
}
