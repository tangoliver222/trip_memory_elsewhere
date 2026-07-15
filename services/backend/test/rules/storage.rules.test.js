import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { ref, uploadBytes } from 'firebase/storage';

const enabled = Boolean(process.env.FIREBASE_STORAGE_EMULATOR_HOST);

test('Storage rules accept only owner originals with allowed media types', { skip: !enabled }, async (t) => {
  const rules = await readFile(
    new URL('../../../../firebase/storage.rules', import.meta.url),
    'utf8',
  );
  const environment = await initializeTestEnvironment({
    projectId: 'demo-elsewhere',
    storage: { rules },
  });
  const path = 'users/user_alpha/originals/batch_12345678/frag_12345678';
  const bytes = new Uint8Array([1, 2, 3]);

  try {
    await t.test('owner can create an allowed JPEG', async () => {
      const storage = environment.authenticatedContext('user_alpha').storage();
      await assertSucceeds(uploadBytes(ref(storage, path), bytes, { contentType: 'image/jpeg' }));
    });

    await t.test('another user cannot create at the owner path', async () => {
      const storage = environment.authenticatedContext('user_beta').storage();
      await assertFails(uploadBytes(ref(storage, `${path}_other`), bytes, { contentType: 'image/jpeg' }));
    });

    await t.test('unsupported content types are denied', async () => {
      const storage = environment.authenticatedContext('user_alpha').storage();
      await assertFails(uploadBytes(ref(storage, `${path}_binary`), bytes, {
        contentType: 'application/octet-stream',
      }));
    });
  } finally {
    await environment.cleanup();
  }
});
