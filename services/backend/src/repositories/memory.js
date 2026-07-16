import { parseFragment, parseImportBatch } from '../domain/index.js';
import { assertRepository } from './contract.js';
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

const keyFor = (uid, id) => `${uid}/${id}`;

function createStore(parse) {
  const objects = new Map();

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
      objects.set(keyFor(uid, parsed.id), structuredClone(parsed));
      return parsed;
    },
  };
}

export function createMemoryRepository() {
  const fragments = createStore(parseFragment);
  const importBatches = createStore(parseImportBatch);

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

  return assertRepository({
    createFragment: fragments.create,
    getFragment: fragments.get,
    createImportBatch: importBatches.create,
    getImportBatch: importBatches.get,
    finalizeOriginal,
    rejectOriginal,
  });
}
