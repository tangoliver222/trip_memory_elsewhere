import test, { after } from 'node:test';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createFirestoreRepository } from '../../src/repositories/firestore.js';
import { runCapabilityRepositoryContract } from './capability-repository.contract.js';
import { runProcessingRepositoryContract } from './processing-repository.contract.js';
import { runRepositoryContract } from './repository.contract.js';
import { runRoutingRepositoryContract } from './routing-repository.contract.js';

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

function createRoutingBarrierDatabase(database) {
  let resolveBarrier;
  let arrivals = 0;
  let armed = false;
  const barrier = new Promise((resolve) => {
    resolveBarrier = resolve;
  });
  const attemptCounts = [];
  const waitForBothRoutingHeadReads = async () => {
    arrivals += 1;
    if (arrivals === 2) {
      armed = false;
      resolveBarrier();
    }
    if (arrivals >= 2) return;
    let timeout;
    try {
      await Promise.race([
        barrier,
        new Promise((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('routing transaction barrier timed out')),
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
          const wrapped = new Proxy(transaction, {
            get(transactionTarget, transactionProperty) {
              if (transactionProperty === 'get') {
                return async (reference) => {
                  if (armed && firstAttempt && reference?.path?.includes('/routingHeads/')) {
                    await waitForBothRoutingHeadReads();
                  }
                  return transactionTarget.get(reference);
                };
              }
              if (transactionProperty === 'getAll') {
                return async (...references) => {
                  if (armed && firstAttempt && references.some(
                    (reference) => reference?.path?.includes('/routingHeads/'),
                  )) {
                    await waitForBothRoutingHeadReads();
                  }
                  return transactionTarget.getAll(...references);
                };
              }
              const value = Reflect.get(
                transactionTarget,
                transactionProperty,
                transactionTarget,
              );
              return typeof value === 'function' ? value.bind(transactionTarget) : value;
            },
          });
          return callback(wrapped);
        }, options);
      };
    },
  });
  return {
    db,
    attemptCounts,
    arm() {
      armed = true;
    },
  };
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

  const routingBarriers = new WeakMap();
  runRoutingRepositoryContract({
    name: 'Firestore repository',
    createRepository: async ({ ownerId, context }) => {
      const ownerRef = database.doc(`users/${ownerId}`);
      await database.recursiveDelete(ownerRef);
      context.after(() => database.recursiveDelete(ownerRef));
      return createFirestoreRepository({ db: database });
    },
    firestoreConcurrencyCase: {
      async createRepository({ ownerId, context }) {
        const ownerRef = database.doc(`users/${ownerId}`);
        await database.recursiveDelete(ownerRef);
        context.after(() => database.recursiveDelete(ownerRef));
        const barrier = createRoutingBarrierDatabase(database);
        const repository = createFirestoreRepository({ db: barrier.db });
        routingBarriers.set(repository, barrier);
        return repository;
      },
      attemptCountsFor(repository) {
        return routingBarriers.get(repository).attemptCounts;
      },
      arm(repository) {
        routingBarriers.get(repository).arm();
      },
      async seedLedger(ownerId, ledger) {
        await database.doc(`users/${ownerId}/budgetLedgers/${ledger.id}`).set(ledger);
      },
      async readLedger(ownerId, ledgerId) {
        const snapshot = await database.doc(
          `users/${ownerId}/budgetLedgers/${ledgerId}`,
        ).get();
        return snapshot.data();
      },
      async seedRoutePlan(ownerId, routePlan) {
        await database.doc(`users/${ownerId}/routePlans/${routePlan.id}`).set(routePlan);
      },
      async readHead(ownerId, headId) {
        const snapshot = await database.doc(`users/${ownerId}/routingHeads/${headId}`).get();
        return snapshot.data();
      },
    },
  });

  runCapabilityRepositoryContract({
    name: 'Firestore repository',
    createRepository: async ({ ownerId, context }) => {
      const ownerRef = database.doc(`users/${ownerId}`);
      await database.recursiveDelete(ownerRef);
      context.after(() => database.recursiveDelete(ownerRef));
      return createFirestoreRepository({ db: database });
    },
  });
}
