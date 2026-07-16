import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

test('Firestore rules isolate owner data and block client-derived writes', { skip: !enabled }, async (t) => {
  const rules = await readFile(
    new URL('../../../../firebase/firestore.rules', import.meta.url),
    'utf8',
  );
  const environment = await initializeTestEnvironment({
    projectId: 'demo-elsewhere',
    firestore: { rules },
  });

  try {
    const path = 'users/user_alpha/fragments/frag_12345678';
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), path), { ownerId: 'user_alpha' });
    });

    await t.test('owner can read an owned fragment', async () => {
      const database = environment.authenticatedContext('user_alpha').firestore();
      const snapshot = await assertSucceeds(getDoc(doc(database, path)));
      assert.equal(snapshot.data().ownerId, 'user_alpha');
    });

    await t.test('another user cannot read the fragment', async () => {
      const database = environment.authenticatedContext('user_beta').firestore();
      await assertFails(getDoc(doc(database, path)));
    });

    await t.test('the owner cannot write server-derived fragments', async () => {
      const database = environment.authenticatedContext('user_alpha').firestore();
      await assertFails(setDoc(doc(database, `${path}_new`), { ownerId: 'user_alpha' }));
    });

    await t.test('the owner cannot forge ImportBatch manifests or derived state', async () => {
      const batchPath = 'users/user_alpha/importBatches/batch_12345678';
      await environment.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), batchPath), {
          ownerId: 'user_alpha',
          status: 'open',
          uploadStatus: 'pending',
          counters: { saved: 0 },
          uploads: {},
        });
      });
      const database = environment.authenticatedContext('user_alpha').firestore();

      await assertFails(setDoc(doc(database, `${batchPath}_new`), {
        ownerId: 'user_alpha',
        uploads: { frag_forged01: { state: 'pending' } },
      }));
      await assertFails(updateDoc(doc(database, batchPath), {
        status: 'processing',
        uploadStatus: 'complete',
        'counters.saved': 1,
      }));
      await assertFails(deleteDoc(doc(database, batchPath)));
    });
  } finally {
    await environment.cleanup();
  }
});
