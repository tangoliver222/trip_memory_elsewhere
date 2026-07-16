import {
  parseContentHash,
  parseDuplicateCandidate,
  parseFragment,
  parseImportBatch,
  parseProcessingTask,
} from '../domain/index.js';
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
} from './processing-outcome.js';
import { makeExactCandidateId } from '../processing/identity.js';

const keyFor = (uid, id) => `${uid}/${id}`;

const MEMORY_COLLECTIONS = Object.freeze([
  'fragments',
  'importBatches',
  'processingTasks',
  'contentHashes',
  'duplicateCandidates',
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
  });
  return assertProcessingRepository(repository);
}
