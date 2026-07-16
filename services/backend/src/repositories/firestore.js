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

  return assertRepository({
    createFragment: (uid, input) => create(uid, input, 'fragments', parseFragment),
    getFragment: (uid, id) => get(uid, id, 'fragments', parseFragment),
    createImportBatch: (uid, input) => create(uid, input, 'importBatches', parseImportBatch),
    getImportBatch: (uid, id) => get(uid, id, 'importBatches', parseImportBatch),
    finalizeOriginal: (uid, input) => applyInTransaction(uid, input, 'finalized'),
    rejectOriginal: (uid, input) => applyInTransaction(uid, input, 'failed'),
  });
}
