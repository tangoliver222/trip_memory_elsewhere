import test, { after } from 'node:test';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createFirestoreRepository } from '../../src/repositories/firestore.js';
import { runProcessingRepositoryContract } from './processing-repository.contract.js';
import { runRepositoryContract } from './repository.contract.js';

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
    includeFirestoreConcurrencyCase: true,
  });
}
