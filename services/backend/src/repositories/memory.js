import {
  parseFragment,
  parseImportBatch,
  parseProcessingTask,
} from '../domain/index.js';
import {
  assertProcessingLeaseRepository,
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
  applyProcessingClaim,
  applyProcessingHeartbeat,
  applyRetryableProcessingFailure,
} from './processing-outcome.js';

const keyFor = (uid, id) => `${uid}/${id}`;

function createStore(parse) {
  const objects = new Map();

  function prepareWrite(uid, object) {
    return Object.freeze({
      key: keyFor(uid, object.id),
      value: structuredClone(object),
    });
  }

  function commit(prepared) {
    objects.set(prepared.key, prepared.value);
  }

  return {
    async create(uid, object) {
      if (uid !== object?.ownerId) throw new RepositoryOwnerError();

      const parsed = parse(object);
      const key = keyFor(uid, parsed.id);
      if (objects.has(key)) throw new RepositoryConflictError();

      const stored = structuredClone(parsed);
      objects.set(key, stored);
      return structuredClone(stored);
    },

    async get(uid, id) {
      const stored = objects.get(keyFor(uid, id));
      return stored ? structuredClone(stored) : null;
    },

    read(uid, id) {
      return objects.get(keyFor(uid, id)) ?? null;
    },

    write(uid, object) {
      const parsed = parse(object);
      commit(prepareWrite(uid, parsed));
      return parsed;
    },

    prepareWrite,
    commit,
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

const cloneFrozen = (value) => deepFreeze(structuredClone(value));

export function createMemoryRepository() {
  const fragments = createStore(parseFragment);
  const importBatches = createStore(parseImportBatch);
  const processingTasks = createStore(parseProcessingTask);

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

    fragments.write(uid, normalized.fragment);
    importBatches.write(uid, transition.batch);
    return cloneOutcome(transition, normalized.fragment);
  }

  async function rejectOriginal(uid, input) {
    const normalized = normalizeRejectedOriginal(uid, input);
    const storedBatch = importBatches.read(uid, normalized.batchId);
    const transition = applyOriginalOutcome(uid, storedBatch, normalized, 'failed');
    const storedFragment = fragments.read(uid, normalized.fragmentId);

    if (transition.outcome === 'duplicate') return cloneOutcome(transition, storedFragment);
    if (storedFragment) throw new RepositoryOriginalConflictError();

    importBatches.write(uid, transition.batch);
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
    processingTasks.commit(taskWrite);
    fragments.commit(fragmentWrite);
    importBatches.commit(batchWrite);
    return cloneFrozen(transition);
  }

  async function heartbeatProcessingTask(uid, input) {
    const transition = applyProcessingHeartbeat(
      uid,
      processingTasks.read(uid, input?.taskId),
      input,
    );
    const taskWrite = processingTasks.prepareWrite(uid, transition.task);
    processingTasks.commit(taskWrite);
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
    processingTasks.commit(taskWrite);
    importBatches.commit(batchWrite);
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
    failDeterministicProcessing,
  });
  return assertProcessingLeaseRepository(repository);
}
