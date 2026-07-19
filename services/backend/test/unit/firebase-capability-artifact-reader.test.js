import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { createFirebaseCapabilityArtifactReader } from '../../src/adapters/firebase-capability-artifact-reader.js';

const BUCKET = 'elsewhere-memory-tyx-2026.firebasestorage.app';
const OWNER_ID = 'user_artifact';
const EXECUTION_ID = 'execution_12345678';
const OBJECT_NAME = `users/${OWNER_ID}/capability-results/${EXECUTION_ID}/normalized.json.gz`;
const GENERATION = '1740000000000300';
const VALUE = Object.freeze({
  schemaVersion: 1,
  executionId: EXECUTION_ID,
  fragmentId: 'fragment_12345678',
  text: 'COMMON GROUNDS\nAmericano 90.00\n',
  pageCount: 1,
});

function gzip(value = VALUE) {
  return gzipSync(Buffer.from(JSON.stringify(value), 'utf8'), { level: 9, mtime: 0 });
}

function readerHarness({ bytes = gzip(), metadataOverrides = {}, downloadError = null } = {}) {
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const calls = { buckets: [], files: [], metadata: 0, downloads: [] };
  const metadata = {
    bucket: BUCKET,
    name: OBJECT_NAME,
    generation: GENERATION,
    contentType: 'application/gzip',
    size: String(bytes.byteLength),
    metadata: {
      executionId: EXECUTION_ID,
      kind: 'normalized',
      ownerId: OWNER_ID,
      sha256,
    },
    ...metadataOverrides,
  };
  const storage = {
    bucket(name) {
      calls.buckets.push(name);
      return {
        file(name, options) {
          calls.files.push({ name, options });
          return {
            async getMetadata() {
              calls.metadata += 1;
              return [metadata];
            },
            async download(options) {
              calls.downloads.push(options);
              if (downloadError) throw downloadError;
              return [bytes];
            },
          };
        },
      };
    },
  };
  const artifactRef = {
    kind: 'normalized',
    bucket: BUCKET,
    objectName: OBJECT_NAME,
    generation: GENERATION,
    contentType: 'application/gzip',
    sizeBytes: bytes.byteLength,
    sha256,
  };
  return {
    calls,
    artifactRef,
    reader: createFirebaseCapabilityArtifactReader({ storage, allowedBuckets: [BUCKET] }),
  };
}

test('reads one generation-pinned normalized artifact and deeply freezes it', async () => {
  const { reader, artifactRef, calls } = readerHarness();
  const result = await reader.readNormalizedArtifact({
    ownerId: OWNER_ID,
    executionId: EXECUTION_ID,
    artifactRef,
  });

  assert.deepEqual(result, VALUE);
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(calls.files, [{ name: OBJECT_NAME, options: { generation: GENERATION } }]);
  assert.deepEqual(calls.downloads, [{ validation: 'crc32c', decompress: false }]);
});

test('rejects owner path bucket generation content type size hash and metadata contradictions', async () => {
  const cases = [
    ({ artifactRef }) => ({ ownerId: 'user_other', artifactRef }),
    ({ artifactRef }) => ({ artifactRef: { ...artifactRef, objectName: `${OBJECT_NAME}.forged` } }),
    ({ artifactRef }) => ({ artifactRef: { ...artifactRef, bucket: 'other.firebasestorage.app' } }),
    ({ artifactRef }) => ({ artifactRef: { ...artifactRef, generation: '1740000000000301' } }),
    ({ artifactRef }) => ({ artifactRef: { ...artifactRef, contentType: 'application/json' } }),
    ({ artifactRef }) => ({ artifactRef: { ...artifactRef, sizeBytes: artifactRef.sizeBytes + 1 } }),
    ({ artifactRef }) => ({ artifactRef: { ...artifactRef, sha256: 'a'.repeat(64) } }),
  ];
  for (const mutate of cases) {
    const harness = readerHarness();
    const changed = mutate(harness);
    await assert.rejects(() => harness.reader.readNormalizedArtifact({
      ownerId: OWNER_ID,
      executionId: EXECUTION_ID,
      artifactRef: harness.artifactRef,
      ...changed,
    }));
  }
  for (const metadataOverrides of [
    { name: `${OBJECT_NAME}.forged` },
    { generation: '1740000000000301' },
    { contentType: 'application/json' },
    { size: '1' },
    { metadata: { executionId: EXECUTION_ID, kind: 'provider', ownerId: OWNER_ID, sha256: 'a'.repeat(64) } },
  ]) {
    const harness = readerHarness({ metadataOverrides });
    await assert.rejects(() => harness.reader.readNormalizedArtifact({
      ownerId: OWNER_ID,
      executionId: EXECUTION_ID,
      artifactRef: harness.artifactRef,
    }), { code: 'capability/artifact-conflict' });
  }
});

test('rejects malformed gzip invalid JSON and bounded decompression overflow', async () => {
  for (const bytes of [
    Buffer.from('not-gzip'),
    gzipSync(Buffer.from('{invalid-json', 'utf8')),
    gzipSync(Buffer.alloc(2 * 1024 * 1024, 97), { level: 9, mtime: 0 }),
  ]) {
    const harness = readerHarness({ bytes });
    await assert.rejects(() => harness.reader.readNormalizedArtifact({
      ownerId: OWNER_ID,
      executionId: EXECUTION_ID,
      artifactRef: harness.artifactRef,
    }), { code: 'capability/artifact-conflict' });
  }
});

test('storage failures are retryable and never expose private errors', async () => {
  const harness = readerHarness({ downloadError: new Error('private bucket and object path') });
  let caught;
  try {
    await harness.reader.readNormalizedArtifact({
      ownerId: OWNER_ID,
      executionId: EXECUTION_ID,
      artifactRef: harness.artifactRef,
    });
  } catch (error) {
    caught = error;
  }
  assert.equal(caught?.code, 'capability/repository-unavailable');
  assert.equal(caught?.retryable, true);
  assert.doesNotMatch(caught?.message ?? '', /private|bucket|object path/i);
});
