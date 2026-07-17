import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
import sharp from 'sharp';
import { createFirebaseDerivativeStore } from '../../src/adapters/firebase-derivative-store.js';
import { createFirebaseObjectInspector } from '../../src/adapters/firebase-object-inspector.js';
import { createFirebaseSourceMaterializer } from '../../src/adapters/firebase-source-materializer.js';
import { createFirebaseTokenVerifier } from '../../src/adapters/firebase-token-verifier.js';
import { createFirebaseAdmin } from '../../src/adapters/firebase.js';
import { createMediaMetadataReader } from '../../src/adapters/media-metadata-reader.js';
import { createSharpImageProcessor } from '../../src/adapters/sharp-image-processor.js';
import { createApiComposition } from '../../src/composition/api.js';
import { createIngestionComposition } from '../../src/composition/ingestion.js';
import { createDeterministicProcessor } from '../../src/processing/service.js';
import { createFirestoreRepository } from '../../src/repositories/firestore.js';
import { makeLocalFileSource } from '../fixtures/import.js';

const enabled = Boolean(
  process.env.FIREBASE_AUTH_EMULATOR_HOST
  && process.env.FIRESTORE_EMULATOR_HOST
  && process.env.FIREBASE_STORAGE_EMULATOR_HOST,
);

const projectId = 'demo-elsewhere';
const bucketName = 'demo-elsewhere.appspot.com';
const processing = Object.freeze({
  timeouts: Object.freeze({
    softMs: 30_000,
    leaseMs: 45_000,
    requestMs: 60_000,
    cleanupMarginMs: 5_000,
  }),
  limits: Object.freeze({
    maxInputBytes: 50 * 1024 * 1024,
    maxInputPixels: 60_000_000,
    maxImageWidth: 20_000,
    maxImageHeight: 20_000,
    maxPageCount: 100,
    maxMetadataDecompressedBytes: 16 * 1024 * 1024,
  }),
});
const appConfig = Object.freeze({
  nodeEnv: 'test',
  bodyLimit: 32 * 1024,
  logLevel: 'silent',
  processing,
});

const emulatorAddress = (value) => {
  const url = new URL(`http://${value}`);
  return { host: url.hostname, port: Number(url.port), url: url.origin };
};

async function makeDeterministicPng() {
  const width = 32;
  const height = 24;
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3;
      pixels[offset] = (x * 7) % 256;
      pixels[offset + 1] = (y * 11) % 256;
      pixels[offset + 2] = ((x + y) * 5) % 256;
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
}

test('real Emulators persist one deterministic pipeline result exactly once per Fragment', {
  skip: !enabled,
}, async (t) => {
  const suffix = `${process.pid}-${Date.now()}`;
  const png = await makeDeterministicPng();
  const sha256 = createHash('sha256').update(png).digest('hex');
  const clientApp = initializeApp({
    apiKey: 'demo-api-key',
    projectId,
    storageBucket: bucketName,
  }, `processing-client-${suffix}`);
  const auth = getAuth(clientApp);
  const authEmulator = emulatorAddress(process.env.FIREBASE_AUTH_EMULATOR_HOST);
  connectAuthEmulator(auth, authEmulator.url, { disableWarnings: true });
  const clientStorage = getStorage(clientApp, `gs://${bucketName}`);
  const storageEmulator = emulatorAddress(process.env.FIREBASE_STORAGE_EMULATOR_HOST);
  connectStorageEmulator(clientStorage, storageEmulator.host, storageEmulator.port);

  const admin = createFirebaseAdmin({ projectId, appName: `processing-admin-${suffix}` });
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
  const adapterConfig = { storage: admin.storage, allowedBuckets: [bucketName] };
  const deterministicProcessor = createDeterministicProcessor({
    repository,
    materializer: createFirebaseSourceMaterializer(adapterConfig),
    metadataReader: createMediaMetadataReader({ limits: processing.limits }),
    imageProcessor: createSharpImageProcessor({ limits: processing.limits }),
    derivativeStore: createFirebaseDerivativeStore(adapterConfig),
    processingConfig: processing,
    clock: () => new Date().toISOString(),
    randomUUID: () => `lease_${crypto.randomUUID()}`,
  });
  const ingestion = createIngestionComposition({
    appConfig,
    repository,
    objectInspector: createFirebaseObjectInspector(adapterConfig),
    deterministicProcessor,
    allowedBuckets: [bucketName],
  });

  let uid;
  t.after(async () => {
    await Promise.allSettled([api.close(), ingestion.close()]);
    if (uid) {
      await admin.storage.bucket(bucketName).deleteFiles({ prefix: `users/${uid}/` });
      await admin.db.recursiveDelete(admin.db.doc(`users/${uid}`));
      await admin.auth.deleteUser(uid).catch(() => {});
    }
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

  const createAndUpload = async (originalName) => {
    const createResponse = await api.inject({
      method: 'POST',
      url: '/v1/import-batches',
      headers: authHeaders,
      payload: {
        items: [{
          sourceType: 'photo',
          declaredContentType: 'image/png',
          declaredSizeBytes: png.byteLength,
          source: makeLocalFileSource({
            originalName,
            media: { width: 32, height: 24 },
          }),
        }],
      },
    });
    assert.equal(createResponse.statusCode, 201);
    const created = createResponse.json();
    const [upload] = created.uploads;
    await uploadBytes(ref(clientStorage, upload.originalPath), png, {
      contentType: 'image/png',
    });
    const [metadata] = await admin.storage
      .bucket(bucketName)
      .file(upload.originalPath)
      .getMetadata();
    return {
      batchId: created.batch.id,
      fragmentId: upload.fragmentId,
      originalPath: upload.originalPath,
      generation: metadata.generation,
      crc32c: metadata.crc32c,
    };
  };

  const dispatch = async (upload, eventId) => ingestion.inject({
    method: 'POST',
    url: '/events/storage-finalized',
    headers: {
      'ce-id': eventId,
      'ce-type': 'google.cloud.storage.object.v1.finalized',
      'ce-source': `//storage.googleapis.com/projects/_/buckets/${bucketName}`,
      'ce-generation': upload.generation,
    },
    payload: {
      bucket: bucketName,
      name: upload.originalPath,
      generation: upload.generation,
    },
  });

  const first = await createAndUpload('deterministic-first.png');
  const firstResponse = await dispatch(first, `event-first-${suffix}`);
  assert.equal(firstResponse.statusCode, 204);

  const firstTasks = await admin.db.collection(`users/${uid}/processingTasks`).get();
  assert.equal(firstTasks.size, 1);
  const firstTask = firstTasks.docs[0].data();
  assert.equal(firstTask.fragmentId, first.fragmentId);
  assert.equal(firstTask.state, 'succeeded');
  assert.equal(firstTask.attemptCount, 1);
  assert.equal(firstTask.inputHash, sha256);

  const firstFragment = await repository.getFragment(uid, first.fragmentId);
  assert.equal(firstFragment.storage.bucket, bucketName);
  assert.equal(firstFragment.storage.originalPath, first.originalPath);
  assert.equal(firstFragment.storage.generation, first.generation);
  assert.equal(firstFragment.storage.sizeBytes, png.byteLength);
  assert.equal(firstFragment.storage.crc32c, first.crc32c);
  assert.equal(firstFragment.hashes.sha256, sha256);
  assert.match(firstFragment.hashes.perceptualHash, /^[a-f0-9]{16}$/);
  assert.deepEqual(
    firstFragment.hashes.perceptualHashBands,
    Array.from({ length: 8 }, (_, index) => (
      `${index}:${firstFragment.hashes.perceptualHash.slice(index * 2, (index + 1) * 2)}`
    )),
  );
  assert.equal(firstFragment.technicalMetadata.format, 'png');
  assert.equal(firstFragment.technicalMetadata.width, 32);
  assert.equal(firstFragment.technicalMetadata.height, 24);
  assert.equal(firstFragment.technicalMetadata.pageCount, null);
  assert.equal(firstFragment.technicalMetadata.cameraMake, null);
  assert.equal(firstFragment.technicalMetadata.cameraModel, null);
  assert.equal(firstFragment.processing.deterministic.state, 'succeeded');

  const derivative = firstFragment.derivatives.thumbnail;
  assert.equal(derivative.contentType, 'image/webp');
  assert.equal(typeof derivative.generation, 'string');
  assert.equal(typeof derivative.crc32c, 'string');
  const [derivativeMetadata] = await admin.storage
    .bucket(bucketName)
    .file(derivative.path)
    .getMetadata();
  assert.equal(derivativeMetadata.generation, derivative.generation);
  assert.equal(derivativeMetadata.crc32c, derivative.crc32c);
  assert.equal(derivativeMetadata.contentType, 'image/webp');
  const [derivativeBytes] = await admin.storage.bucket(bucketName).file(derivative.path).download();
  assert.equal(derivativeBytes.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(derivativeBytes.subarray(8, 12).toString('ascii'), 'WEBP');

  const firstBatch = await repository.getImportBatch(uid, first.batchId);
  assert.equal(firstBatch.status, 'completed');
  assert.deepEqual(firstBatch.counters, {
    saved: 1,
    processed: 1,
    failed: 0,
    needsReview: 0,
  });
  assert.deepEqual(
    {
      processorName: firstBatch.processingSummary.deterministic.processorName,
      processorVersion: firstBatch.processingSummary.deterministic.processorVersion,
      eligible: firstBatch.processingSummary.deterministic.eligible,
      running: firstBatch.processingSummary.deterministic.running,
      succeeded: firstBatch.processingSummary.deterministic.succeeded,
      failedRetryable: firstBatch.processingSummary.deterministic.failedRetryable,
      failedTerminal: firstBatch.processingSummary.deterministic.failedTerminal,
    },
    {
      processorName: 'deterministic-media',
      processorVersion: 'v1',
      eligible: 1,
      running: 0,
      succeeded: 1,
      failedRetryable: 0,
      failedTerminal: 0,
    },
  );

  const replayResponse = await dispatch(first, `event-first-replay-${suffix}`);
  assert.equal(replayResponse.statusCode, 204);
  const firstTaskAfterReplay = (await admin.db.doc(firstTasks.docs[0].ref.path).get()).data();
  assert.deepEqual(firstTaskAfterReplay, firstTask);
  const firstBatchAfterReplay = await repository.getImportBatch(uid, first.batchId);
  assert.deepEqual(firstBatchAfterReplay, firstBatch);

  const second = await createAndUpload('deterministic-second.png');
  const secondResponse = await dispatch(second, `event-second-${suffix}`);
  assert.equal(secondResponse.statusCode, 204);

  const fragments = await admin.db.collection(`users/${uid}/fragments`).get();
  assert.equal(fragments.size, 2);
  assert.deepEqual(
    fragments.docs.map((snapshot) => snapshot.data().hashes.sha256),
    [sha256, sha256],
  );
  const contentHash = (await admin.db
    .doc(`users/${uid}/contentHashes/${sha256}`)
    .get()).data();
  assert.equal(contentHash.fragmentCount, 2);
  assert.equal(contentHash.canonicalFragmentRef.id, first.fragmentId);

  const candidates = await admin.db.collection(`users/${uid}/duplicateCandidates`).get();
  const exactCandidates = candidates.docs
    .map((snapshot) => snapshot.data())
    .filter((candidate) => candidate.kind === 'exact');
  assert.equal(exactCandidates.length, 1);
  assert.equal(exactCandidates[0].canonicalFragmentRef.id, first.fragmentId);
  assert.equal(exactCandidates[0].candidateFragmentRef.id, second.fragmentId);
  assert.deepEqual(
    exactCandidates[0].pairRefs.map(({ id }) => id),
    [first.fragmentId, second.fragmentId].sort(),
  );

  const allTasks = await admin.db.collection(`users/${uid}/processingTasks`).get();
  assert.equal(allTasks.size, 2);
  assert.deepEqual(
    allTasks.docs.map((snapshot) => snapshot.data().attemptCount).sort(),
    [1, 1],
  );
  const secondBatch = await repository.getImportBatch(uid, second.batchId);
  assert.equal(secondBatch.status, 'completed');
  assert.equal(secondBatch.counters.processed, 1);
  assert.equal(secondBatch.processingSummary.deterministic.eligible, 1);
  assert.equal(secondBatch.processingSummary.deterministic.succeeded, 1);
});
