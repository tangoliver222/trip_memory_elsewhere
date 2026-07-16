import assert from 'node:assert/strict';
import test from 'node:test';
import { deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { deleteApp as deleteClientApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import {
  connectStorageEmulator,
  getStorage,
  ref,
  uploadBytes,
} from 'firebase/storage';
import { createFirebaseObjectInspector } from '../../src/adapters/firebase-object-inspector.js';
import { createFirebaseTokenVerifier } from '../../src/adapters/firebase-token-verifier.js';
import { createFirebaseAdmin } from '../../src/adapters/firebase.js';
import { createApiComposition } from '../../src/composition/api.js';
import { createIngestionComposition } from '../../src/composition/ingestion.js';
import { createFirestoreRepository } from '../../src/repositories/firestore.js';
import { makeLocalFileSource } from '../fixtures/import.js';

const enabled = Boolean(
  process.env.FIREBASE_AUTH_EMULATOR_HOST
  && process.env.FIRESTORE_EMULATOR_HOST
  && process.env.FIREBASE_STORAGE_EMULATOR_HOST,
);

const projectId = 'demo-elsewhere';
const bucketName = 'demo-elsewhere.appspot.com';
const appConfig = Object.freeze({
  nodeEnv: 'test',
  bodyLimit: 32 * 1024,
  logLevel: 'silent',
});

const emulatorAddress = (value) => {
  const url = new URL(`http://${value}`);
  return { host: url.hostname, port: Number(url.port), url: url.origin };
};

test('anonymous user saves one original through Auth, Firestore and Storage Emulators', {
  skip: !enabled,
}, async (t) => {
  const suffix = `${process.pid}-${Date.now()}`;
  const source = makeLocalFileSource({
    originalName: 'bangkok-river.jpg',
    sourceModifiedAt: '2026-07-12T10:22:14Z',
  });
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const clientApp = initializeApp({
    apiKey: 'demo-api-key',
    projectId,
    storageBucket: bucketName,
  }, `import-client-${suffix}`);
  const auth = getAuth(clientApp);
  const authEmulator = emulatorAddress(process.env.FIREBASE_AUTH_EMULATOR_HOST);
  connectAuthEmulator(auth, authEmulator.url, { disableWarnings: true });
  const storage = getStorage(clientApp, `gs://${bucketName}`);
  const storageEmulator = emulatorAddress(process.env.FIREBASE_STORAGE_EMULATOR_HOST);
  connectStorageEmulator(storage, storageEmulator.host, storageEmulator.port);

  const admin = createFirebaseAdmin({ projectId, appName: `import-admin-${suffix}` });
  const repository = createFirestoreRepository({ db: admin.db });
  const tokenVerifier = createFirebaseTokenVerifier({
    auth: admin.auth,
    appCheck: {
      async verifyToken(token) {
        if (token !== 'test-app-check') throw new Error('invalid test token');
        return { appId: 'elsewhere-web-dev' };
      },
    },
  });
  const api = createApiComposition({
    appConfig,
    repository,
    tokenVerifier,
    allowedAppIds: ['elsewhere-web-dev'],
  });
  const ingestion = createIngestionComposition({
    appConfig,
    repository,
    objectInspector: createFirebaseObjectInspector({
      storage: admin.storage,
      allowedBuckets: [bucketName],
    }),
    allowedBuckets: [bucketName],
  });

  let uid;
  let originalPath;
  t.after(async () => {
    await Promise.allSettled([api.close(), ingestion.close()]);
    if (originalPath) {
      await admin.storage.bucket(bucketName).file(originalPath).delete({ ignoreNotFound: true });
    }
    await admin.db.recursiveDelete(admin.db.collection('users'));
    if (uid) await admin.auth.deleteUser(uid).catch(() => {});
    await deleteClientApp(clientApp);
    await deleteAdminApp(admin.app);
  });

  const credential = await signInAnonymously(auth);
  uid = credential.user.uid;
  const idToken = await credential.user.getIdToken();
  const authHeaders = {
    authorization: `Bearer ${idToken}`,
    'x-firebase-appcheck': 'test-app-check',
  };

  const createResponse = await api.inject({
    method: 'POST',
    url: '/v1/import-batches',
    headers: authHeaders,
    payload: {
      items: [{
        sourceType: 'photo',
        declaredContentType: 'image/jpeg',
        declaredSizeBytes: jpeg.byteLength,
        source,
      }],
    },
  });
  assert.equal(createResponse.statusCode, 201);
  const created = createResponse.json();
  assert.equal(created.uploads.length, 1);
  const [upload] = created.uploads;
  originalPath = upload.originalPath;
  assert.equal(originalPath, `users/${uid}/originals/${created.batch.id}/${upload.fragmentId}`);
  assert.deepEqual(upload.allowedContentTypes, [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
  ]);
  assert.equal(upload.maxBytes, 50 * 1024 * 1024);

  const pendingSnapshot = await admin.db
    .doc(`users/${uid}/importBatches/${created.batch.id}`)
    .get();
  const pendingItem = pendingSnapshot.data()?.uploads?.[upload.fragmentId];
  assert.equal(pendingItem?.state, 'pending');
  assert.equal(pendingItem?.originalPath, originalPath);

  await uploadBytes(ref(storage, originalPath), jpeg, { contentType: 'image/jpeg' });
  const [metadata] = await admin.storage
    .bucket(bucketName)
    .file(originalPath)
    .getMetadata();
  assert.equal(metadata.contentType, 'image/jpeg');
  assert.equal(Number(metadata.size), jpeg.byteLength);
  assert.equal(typeof metadata.generation, 'string');
  assert.equal(typeof metadata.crc32c, 'string');

  const eventHeaders = {
    'ce-id': `event-${suffix}`,
    'ce-type': 'google.cloud.storage.object.v1.finalized',
    'ce-source': `//storage.googleapis.com/projects/_/buckets/${bucketName}`,
    'ce-generation': metadata.generation,
  };
  const eventPayload = {
    bucket: bucketName,
    name: originalPath,
    generation: metadata.generation,
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const finalized = await ingestion.inject({
      method: 'POST',
      url: '/events/storage-finalized',
      headers: eventHeaders,
      payload: eventPayload,
    });
    assert.equal(finalized.statusCode, 204);
  }

  const receiptResponse = await api.inject({
    method: 'GET',
    url: `/v1/import-batches/${created.batch.id}`,
    headers: authHeaders,
  });
  assert.equal(receiptResponse.statusCode, 200);
  assert.deepEqual(receiptResponse.json(), {
    id: created.batch.id,
    status: 'processing',
    uploadStatus: 'complete',
    inputCount: 1,
    counters: { saved: 1, processed: 0, failed: 0, needsReview: 0 },
    items: [{ fragmentId: upload.fragmentId, sourceType: 'photo', state: 'finalized' }],
  });

  const fragment = await repository.getFragment(uid, upload.fragmentId);
  assert.deepEqual(fragment.source, source);
  assert.deepEqual(fragment.storage, {
    originalPath,
    generation: metadata.generation,
    contentType: 'image/jpeg',
    sizeBytes: jpeg.byteLength,
    crc32c: metadata.crc32c,
    md5Hash: metadata.md5Hash ?? null,
  });
  assert.deepEqual(fragment.hashes, {});
  assert.deepEqual(fragment.facts, {});

  const fragments = await admin.db.collection(`users/${uid}/fragments`).get();
  assert.equal(fragments.size, 1);
  const finalBatch = await repository.getImportBatch(uid, created.batch.id);
  assert.equal(finalBatch.counters.saved, 1);
});
