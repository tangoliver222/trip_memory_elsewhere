import test from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { createFirebaseCapabilityArtifactStore } from '../../src/adapters/firebase-capability-artifact-store.js';

const BUCKET = 'demo-elsewhere.appspot.com';
const OWNER_ID = 'user_artifact';
const EXECUTION_ID = 'execution_12345678';
const VALUE = Object.freeze({
  text: 'COMMON GROUNDS\nAmericano 90.00\n',
  nested: Object.freeze({ z: 2, a: 1 }),
});

function storageFake({ saveError = null, existingBytes = null, metadataOverrides = {} } = {}) {
  const calls = { buckets: [], paths: [], saves: [], downloads: 0, metadata: 0 };
  let savedBytes = null;
  const file = {
    async save(bytes, options) {
      calls.saves.push({ bytes: Buffer.from(bytes), options });
      if (saveError) throw saveError;
      savedBytes = Buffer.from(bytes);
    },
    async download() {
      calls.downloads += 1;
      return [existingBytes ?? savedBytes];
    },
    async getMetadata() {
      calls.metadata += 1;
      const save = calls.saves[0];
      const bytes = existingBytes ?? savedBytes ?? save?.bytes;
      return [{
        bucket: BUCKET,
        name: calls.paths[0],
        generation: '1740000000000300',
        contentType: 'application/gzip',
        size: String(bytes.byteLength),
        metadata: save?.options.metadata.metadata,
        ...metadataOverrides,
      }];
    },
  };
  return {
    calls,
    storage: {
      bucket(name) {
        calls.buckets.push(name);
        return {
          file(path) {
            calls.paths.push(path);
            return file;
          },
        };
      },
    },
  };
}

function put(store, kind = 'provider', value = VALUE) {
  const method = kind === 'provider' ? 'putProviderArtifact' : 'putNormalizedArtifact';
  return store[method]({
    bucket: BUCKET,
    ownerId: OWNER_ID,
    executionId: EXECUTION_ID,
    value,
  });
}

test('writes deterministic canonical gzip with generation-zero precondition and safe metadata', async () => {
  const { storage, calls } = storageFake();
  const store = createFirebaseCapabilityArtifactStore({ storage, allowedBuckets: [BUCKET] });
  const result = await put(store);

  assert.deepEqual(calls.buckets, [BUCKET]);
  assert.deepEqual(calls.paths, [
    `users/${OWNER_ID}/capability-results/${EXECUTION_ID}/provider.json.gz`,
  ]);
  assert.equal(calls.saves.length, 1);
  assert.deepEqual(calls.saves[0].options, {
    resumable: false,
    preconditionOpts: { ifGenerationMatch: 0 },
    validation: 'crc32c',
    metadata: {
      contentType: 'application/gzip',
      metadata: {
        executionId: EXECUTION_ID,
        kind: 'provider',
        ownerId: OWNER_ID,
        sha256: result.sha256,
      },
    },
  });
  assert.equal(
    gunzipSync(calls.saves[0].bytes).toString('utf8'),
    '{"nested":{"a":1,"z":2},"text":"COMMON GROUNDS\\nAmericano 90.00\\n"}',
  );
  assert.equal(JSON.stringify(calls.saves[0].options).includes('COMMON GROUNDS'), false);
  assert.deepEqual(result, {
    kind: 'provider',
    bucket: BUCKET,
    objectName: calls.paths[0],
    generation: '1740000000000300',
    contentType: 'application/gzip',
    sizeBytes: calls.saves[0].bytes.byteLength,
    sha256: result.sha256,
  });
  assert.equal(Object.isFrozen(result), true);
});

test('stores provider and normalized artifacts at distinct server-only paths', async () => {
  const { storage, calls } = storageFake();
  const store = createFirebaseCapabilityArtifactStore({ storage, allowedBuckets: [BUCKET] });
  await put(store, 'provider');
  await put(store, 'normalized');
  assert.deepEqual(calls.paths, [
    `users/${OWNER_ID}/capability-results/${EXECUTION_ID}/provider.json.gz`,
    `users/${OWNER_ID}/capability-results/${EXECUTION_ID}/normalized.json.gz`,
  ]);
});

test('412 reuses only byte-identical immutable content and metadata', async () => {
  const first = storageFake();
  const firstStore = createFirebaseCapabilityArtifactStore({
    storage: first.storage, allowedBuckets: [BUCKET],
  });
  const created = await put(firstStore);
  const bytes = first.calls.saves[0].bytes;
  const reused = storageFake({ saveError: { code: 412 }, existingBytes: bytes });
  const reusedStore = createFirebaseCapabilityArtifactStore({
    storage: reused.storage, allowedBuckets: [BUCKET],
  });

  assert.deepEqual(await put(reusedStore), created);
  assert.equal(reused.calls.downloads, 1);
  assert.equal(reused.calls.metadata, 1);
});

test('412 byte or metadata mismatch is a stable artifact conflict', async () => {
  for (const options of [
    { existingBytes: Buffer.from('different-gzip') },
    { metadataOverrides: { contentType: 'application/json' } },
    { metadataOverrides: { generation: null } },
  ]) {
    const { storage } = storageFake({ saveError: { code: '412' }, ...options });
    const store = createFirebaseCapabilityArtifactStore({ storage, allowedBuckets: [BUCKET] });
    await assert.rejects(
      () => put(store),
      { code: 'capability/artifact-conflict', billingUncertain: true },
    );
  }
});

test('strict input and storage failures expose no OCR or provider details', async () => {
  const privateMessage = 'private storage path and COMMON GROUNDS';
  const { storage, calls } = storageFake({ saveError: new Error(privateMessage) });
  const store = createFirebaseCapabilityArtifactStore({ storage, allowedBuckets: [BUCKET] });
  let caught;
  try {
    await put(store);
  } catch (error) {
    caught = error;
  }
  assert.equal(caught?.code, 'capability/repository-unavailable');
  assert.equal(caught?.message.includes(privateMessage), false);
  await assert.rejects(() => put(store, 'provider', { bytes: Buffer.from('private') }), TypeError);
  assert.equal(calls.saves.length, 1);
});
