import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

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
  } finally {
    await environment.cleanup();
  }
});
