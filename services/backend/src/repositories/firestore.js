import { FieldPath } from 'firebase-admin/firestore';
import { parseFragment, parseImportBatch } from '../domain/index.js';
import {
  assertProcessingRepository,
  assertRepository,
} from './contract.js';
import {
  RepositoryConflictError,
  RepositoryOriginalConflictError,
  RepositoryOwnerError,
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
  });
  return assertProcessingRepository(repository);
}
