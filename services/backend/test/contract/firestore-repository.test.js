import test, { after } from 'node:test';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createFirestoreRepository } from '../../src/repositories/firestore.js';
import { runProcessingRepositoryContract } from './processing-repository.contract.js';
import { runRepositoryContract } from './repository.contract.js';

function createContentHashBarrierDatabase(database) {
  let resolveBarrier;
  let barrierReleased = false;
  let arrivalCount = 0;
  const barrier = new Promise((resolve) => {
    resolveBarrier = resolve;
  });
  const attemptCounts = [];

  const waitForBothMissingReads = async () => {
    arrivalCount += 1;
    if (arrivalCount === 2) {
      barrierReleased = true;
      resolveBarrier();
    }
    if (barrierReleased) return;
    let timeout;
    try {
      await Promise.race([
        barrier,
        new Promise((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('content hash transaction barrier timed out')),
            5_000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  };

  const db = new Proxy(database, {
    get(target, property) {
      if (property !== 'runTransaction') {
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      }
      return (callback, options) => {
        const transactionIndex = attemptCounts.length;
        attemptCounts.push(0);
        return target.runTransaction(async (transaction) => {
          attemptCounts[transactionIndex] += 1;
          const firstAttempt = attemptCounts[transactionIndex] === 1;
          const wrappedTransaction = new Proxy(transaction, {
            get(transactionTarget, transactionProperty) {
              if (transactionProperty !== 'get') {
                const value = Reflect.get(
                  transactionTarget,
                  transactionProperty,
                  transactionTarget,
                );
                return typeof value === 'function' ? value.bind(transactionTarget) : value;
              }
              return async (reference) => {
                const snapshot = await transactionTarget.get(reference);
                if (firstAttempt
                  && reference?.path?.includes('/contentHashes/')
                  && snapshot.exists === false) {
                  await waitForBothMissingReads();
                }
                return snapshot;
              };
            },
          });
          return callback(wrappedTransaction);
        }, options);
      };
    },
  });

  return { db, attemptCounts };
}

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  test('Firestore repository contract requires the Emulator', { skip: true }, () => {});
} else {
  const app = initializeApp(
    { projectId: 'demo-elsewhere' },
    `repository-contract-${process.pid}-${Date.now()}`,
  );
  const database = getFirestore(app);

  after(async () => {
    await deleteApp(app);
  });

  runRepositoryContract({
    name: 'Firestore repository',
    createRepository: async () => {
      await database.recursiveDelete(database.collection('users'));
      return createFirestoreRepository({ db: database });
    },
  });

  runProcessingRepositoryContract({
    name: 'Firestore repository',
    createRepository: async ({ ownerId, context }) => {
      const ownerRef = database.doc(`users/${ownerId}`);
      await database.recursiveDelete(ownerRef);
      context.after(() => database.recursiveDelete(ownerRef));
      return createFirestoreRepository({ db: database });
    },
    firestoreConcurrencyCase: (() => {
      const attempts = new WeakMap();
      return {
        createRepository: async ({ ownerId, context }) => {
          const ownerRef = database.doc(`users/${ownerId}`);
          await database.recursiveDelete(ownerRef);
          context.after(() => database.recursiveDelete(ownerRef));
          const barrierDatabase = createContentHashBarrierDatabase(database);
          const repository = createFirestoreRepository({ db: barrierDatabase.db });
          attempts.set(repository, barrierDatabase.attemptCounts);
          return repository;
        },
        attemptCountsFor: (repository) => attempts.get(repository),
      };
    })(),
    firestoreCandidateCollisionStore: {
      async seed(ownerId, candidate) {
        await database.doc(
          `users/${ownerId}/duplicateCandidates/${candidate.id}`,
        ).set(candidate);
      },
      async read(ownerId, candidateId) {
        const snapshot = await database.doc(
          `users/${ownerId}/duplicateCandidates/${candidateId}`,
        ).get();
        return snapshot.exists ? snapshot.data() : null;
      },
    },
  });
}
