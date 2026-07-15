import { parseFragment, parseImportBatch } from '../domain/index.js';
import { assertRepository } from './contract.js';
import { RepositoryConflictError, RepositoryOwnerError } from './errors.js';

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
  };
}

export function createMemoryRepository() {
  const fragments = createStore(parseFragment);
  const importBatches = createStore(parseImportBatch);

  return assertRepository({
    createFragment: fragments.create,
    getFragment: fragments.get,
    createImportBatch: importBatches.create,
    getImportBatch: importBatches.get,
  });
}
