import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import {
  deleteObject,
  getBytes,
  ref,
  uploadBytes,
} from 'firebase/storage';

const enabled = Boolean(
  process.env.FIREBASE_STORAGE_EMULATOR_HOST
  && process.env.FIRESTORE_EMULATOR_HOST,
);

test('Storage rules bind owner creates to pending ImportBatch manifest items', { skip: !enabled }, async (t) => {
  const [storageRules, firestoreRules] = await Promise.all([
    readFile(new URL('../../../../firebase/storage.rules', import.meta.url), 'utf8'),
    readFile(new URL('../../../../firebase/firestore.rules', import.meta.url), 'utf8'),
  ]);
  const environment = await initializeTestEnvironment({
    projectId: 'demo-elsewhere',
    firestore: { rules: firestoreRules },
    storage: { rules: storageRules },
  });
  const bytes = new Uint8Array([1, 2, 3]);

  const seedBatch = async ({
    batchId,
    fragmentId,
    state = 'pending',
    allowedContentTypes = ['image/jpeg'],
    maxBytes = 3,
  }) => {
    const originalPath = `users/user_alpha/originals/${batchId}/${fragmentId}`;
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), `users/user_alpha/importBatches/${batchId}`),
        {
          ownerId: 'user_alpha',
          uploads: {
            [fragmentId]: {
              fragmentId,
              state,
              originalPath,
              allowedContentTypes,
              maxBytes,
            },
          },
        },
      );
    });
    return originalPath;
  };

  try {
    const path = await seedBatch({
      batchId: 'batch_12345678',
      fragmentId: 'frag_12345678',
    });

    await t.test('owner can create and read the exact registered object at item maxBytes', async () => {
      const storage = environment.authenticatedContext('user_alpha').storage();
      const object = ref(storage, path);
      await assertSucceeds(uploadBytes(object, bytes, { contentType: 'image/jpeg' }));
      await assertSucceeds(getBytes(object));
    });

    await t.test('unauthenticated and another user cannot create at the owner path', async () => {
      const anonymous = environment.unauthenticatedContext().storage();
      const other = environment.authenticatedContext('user_beta').storage();
      const otherPath = await seedBatch({
        batchId: 'batch_authdeny1',
        fragmentId: 'frag_authdeny1',
      });
      await assertFails(uploadBytes(ref(anonymous, otherPath), bytes, { contentType: 'image/jpeg' }));
      await assertFails(uploadBytes(ref(other, otherPath), bytes, { contentType: 'image/jpeg' }));
    });

    await t.test('missing batch and unregistered fragment are denied', async () => {
      const storage = environment.authenticatedContext('user_alpha').storage();
      await assertFails(uploadBytes(
        ref(storage, 'users/user_alpha/originals/batch_missing1/frag_missing01'),
        bytes,
        { contentType: 'image/jpeg' },
      ));
      await assertFails(uploadBytes(
        ref(storage, 'users/user_alpha/originals/batch_12345678/frag_missing02'),
        bytes,
        { contentType: 'image/jpeg' },
      ));
    });

    await t.test('finalized and failed manifest items are denied', async () => {
      const storage = environment.authenticatedContext('user_alpha').storage();
      for (const [state, suffix] of [['finalized', 'final001'], ['failed', 'failed001']]) {
        const itemPath = await seedBatch({
          batchId: `batch_${suffix}`,
          fragmentId: `frag_${suffix}`,
          state,
        });
        await assertFails(uploadBytes(ref(storage, itemPath), bytes, { contentType: 'image/jpeg' }));
      }
    });

    await t.test('wrong exact path and source-specific MIME are denied', async () => {
      const storage = environment.authenticatedContext('user_alpha').storage();
      const itemPath = await seedBatch({
        batchId: 'batch_pathmime1',
        fragmentId: 'frag_pathmime1',
        allowedContentTypes: ['text/plain'],
      });
      await assertFails(uploadBytes(
        ref(storage, itemPath.replace('frag_pathmime1', 'frag_pathwrong')),
        bytes,
        { contentType: 'text/plain' },
      ));
      await assertFails(uploadBytes(ref(storage, itemPath), bytes, { contentType: 'image/jpeg' }));
    });

    await t.test('one byte above manifest maxBytes is denied', async () => {
      const storage = environment.authenticatedContext('user_alpha').storage();
      const itemPath = await seedBatch({
        batchId: 'batch_sizefail1',
        fragmentId: 'frag_sizefail1',
        maxBytes: 2,
      });
      await assertFails(uploadBytes(ref(storage, itemPath), bytes, { contentType: 'image/jpeg' }));
    });

    await t.test('overwrite and delete remain denied', async () => {
      const storage = environment.authenticatedContext('user_alpha').storage();
      const object = ref(storage, path);
      await assertFails(uploadBytes(object, bytes, { contentType: 'image/jpeg' }));
      await assertFails(deleteObject(object));
    });

    await t.test('other users cannot read and arbitrary paths stay closed', async () => {
      const other = environment.authenticatedContext('user_beta').storage();
      const owner = environment.authenticatedContext('user_alpha').storage();
      await assertFails(getBytes(ref(other, path)));
      await assertFails(uploadBytes(
        ref(owner, 'users/user_alpha/other/frag_12345678'),
        bytes,
        { contentType: 'image/jpeg' },
      ));
    });

    await t.test('only the owner can read server-created derivatives', async () => {
      const derivedPath = 'users/user_alpha/derived/frag_derived01/deterministic-media/v1/hash/thumb.webp';
      await environment.withSecurityRulesDisabled(async (context) => {
        await uploadBytes(ref(context.storage(), derivedPath), bytes, {
          contentType: 'image/webp',
        });
      });
      const contexts = [
        ['owner', environment.authenticatedContext('user_alpha').storage()],
        ['other', environment.authenticatedContext('user_beta').storage()],
        ['anonymous', environment.unauthenticatedContext().storage()],
      ];

      for (const [label, storage] of contexts) {
        if (label === 'owner') {
          await assertSucceeds(getBytes(ref(storage, derivedPath)));
        } else {
          await assertFails(getBytes(ref(storage, derivedPath)));
        }
      }
    });

    await t.test('every client is denied each derived object mutation', async () => {
      const derivedPath = 'users/user_alpha/derived/frag_derived02/deterministic-media/v1/hash/thumb.webp';
      await environment.withSecurityRulesDisabled(async (context) => {
        await uploadBytes(ref(context.storage(), derivedPath), bytes, {
          contentType: 'image/webp',
        });
      });
      const contexts = [
        ['owner', environment.authenticatedContext('user_alpha').storage()],
        ['other', environment.authenticatedContext('user_beta').storage()],
        ['anonymous', environment.unauthenticatedContext().storage()],
      ];

      for (const [label, storage] of contexts) {
        await assertFails(uploadBytes(
          ref(
            storage,
            `users/user_alpha/derived/frag_create_${label}01/deterministic-media/v1/hash/thumb.webp`,
          ),
          bytes,
          { contentType: 'image/webp' },
        ));
        await assertFails(uploadBytes(ref(storage, derivedPath), bytes, {
          contentType: 'image/webp',
        }));
        await assertFails(deleteObject(ref(storage, derivedPath)));
      }
    });
  } finally {
    await environment.cleanup();
  }
});
