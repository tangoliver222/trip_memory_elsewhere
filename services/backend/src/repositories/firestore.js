import { parseFragment, parseImportBatch } from '../domain/index.js';
import { assertRepository } from './contract.js';
import { RepositoryConflictError, RepositoryOwnerError } from './errors.js';

const isConflict = (error) => (
  error?.code === 6
  || error?.code === '6'
  || error?.code === 'already-exists'
);

export function createFirestoreRepository({ db }) {
  if (!db) throw new TypeError('Firestore database is required');

  const document = (uid, collection, id) => db.doc(`users/${uid}/${collection}/${id}`);

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

  return assertRepository({
    createFragment: (uid, input) => create(uid, input, 'fragments', parseFragment),
    getFragment: (uid, id) => get(uid, id, 'fragments', parseFragment),
    createImportBatch: (uid, input) => create(uid, input, 'importBatches', parseImportBatch),
    getImportBatch: (uid, id) => get(uid, id, 'importBatches', parseImportBatch),
  });
}
