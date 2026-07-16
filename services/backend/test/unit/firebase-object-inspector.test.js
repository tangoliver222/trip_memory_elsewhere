import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createFirebaseObjectInspector } from '../../src/adapters/firebase-object-inspector.js';

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

const policy = (overrides = {}) => ({
  sourceType: 'photo',
  allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
  maxBytes: 50 * 1024 * 1024,
  ...overrides,
});

function createStorageFake({ metadata = {}, chunks = [jpeg], metadataError, streamError } = {}) {
  const calls = { bucket: [], file: [], metadata: 0, streams: [] };
  const completeMetadata = {
    generation: '1740000000000001',
    size: String(jpeg.byteLength),
    crc32c: 'ImIEBA==',
    md5Hash: undefined,
    contentType: 'image/jpeg',
    ...metadata,
  };
  const file = {
    async getMetadata() {
      calls.metadata += 1;
      if (metadataError) throw metadataError;
      return [completeMetadata];
    },
    createReadStream(options = {}) {
      calls.streams.push(options);
      if (streamError) return Readable.from((async function* fail() { throw streamError; }()));
      return Readable.from(chunks);
    },
  };
  const storage = {
    bucket(bucketName) {
      calls.bucket.push(bucketName);
      return {
        file(objectName, options) {
          calls.file.push({ objectName, options });
          return file;
        },
      };
    },
  };
  return { storage, calls };
}

const inspect = (storage, input = {}) => createFirebaseObjectInspector({
  storage,
  allowedBuckets: ['demo-elsewhere.appspot.com'],
}).inspectOriginal({
  bucket: 'demo-elsewhere.appspot.com',
  objectName: 'users/user_alpha/originals/batch_12345678/frag_12345678',
  generation: '1740000000000001',
  expectedPolicy: policy(),
  ...input,
});

test('rejects unallowlisted bucket and missing generation before Storage access', async () => {
  const { storage, calls } = createStorageFake();
  await assert.rejects(
    () => inspect(storage, { bucket: 'other.appspot.com' }),
    { code: 'ingestion/invalid-original', permanent: true },
  );
  await assert.rejects(
    () => inspect(storage, { generation: '' }),
    { code: 'ingestion/invalid-original', permanent: true },
  );
  assert.equal(calls.bucket.length, 0);
});

test('pins the file handle to the requested generation and returns frozen facts', async () => {
  const { storage, calls } = createStorageFake();
  const result = await inspect(storage);

  assert.deepEqual(calls.file, [{
    objectName: 'users/user_alpha/originals/batch_12345678/frag_12345678',
    options: { generation: '1740000000000001' },
  }]);
  assert.deepEqual(result, {
    detectedFormat: 'jpeg',
    storageFacts: {
      generation: '1740000000000001',
      contentType: 'image/jpeg',
      sizeBytes: 4,
      crc32c: 'ImIEBA==',
      md5Hash: null,
    },
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.storageFacts), true);
  assert.deepEqual(calls.streams, [{ start: 0, end: 31, validation: false }]);
});

test('validates required metadata and policy before reading bytes', async () => {
  const cases = [
    { metadata: { generation: 'different' } },
    { metadata: { size: undefined } },
    { metadata: { size: '0' } },
    { metadata: { crc32c: undefined } },
    { metadata: { contentType: 'application/pdf' } },
    { metadata: { size: '5' }, expectedPolicy: policy({ maxBytes: 4 }) },
  ];

  for (const { metadata, expectedPolicy } of cases) {
    const { storage, calls } = createStorageFake({ metadata });
    await assert.rejects(
      () => inspect(storage, expectedPolicy ? { expectedPolicy } : {}),
      { code: 'ingestion/invalid-original', permanent: true },
    );
    assert.equal(calls.streams.length, 0);
  }
});

test('rejects content type and actual signature mismatch', async () => {
  const { storage } = createStorageFake({
    metadata: { contentType: 'image/png', size: '4' },
  });
  await assert.rejects(
    () => inspect(storage),
    { code: 'ingestion/invalid-original', permanent: true },
  );
});

test('accepts PDF only for document source types', async () => {
  const pdfBytes = new TextEncoder().encode('%PDF-1.7');
  for (const [sourceType, succeeds] of [['photo', false], ['receipt', true], ['ticket', true], ['menu', true]]) {
    const { storage } = createStorageFake({
      metadata: { contentType: 'application/pdf', size: String(pdfBytes.byteLength) },
      chunks: [pdfBytes],
    });
    const operation = () => inspect(storage, {
      expectedPolicy: policy({
        sourceType,
        allowedContentTypes: ['image/jpeg', 'application/pdf'],
      }),
    });
    if (succeeds) assert.equal((await operation()).detectedFormat, 'pdf');
    else await assert.rejects(operation, { code: 'ingestion/invalid-original' });
  }
});

test('validates text as strict streaming UTF-8 across chunk boundaries', async () => {
  const encoded = new TextEncoder().encode('旅程');
  const chunks = [encoded.subarray(0, 1), encoded.subarray(1, 4), encoded.subarray(4)];
  const { storage, calls } = createStorageFake({
    metadata: {
      contentType: 'text/plain',
      size: String(encoded.byteLength),
    },
    chunks,
  });
  const result = await inspect(storage, {
    expectedPolicy: policy({
      sourceType: 'text',
      allowedContentTypes: ['text/plain'],
    }),
  });

  assert.equal(result.detectedFormat, 'utf8-text');
  assert.deepEqual(calls.streams, [{ validation: false }]);
});

test('rejects malformed UTF-8 as a permanent original error', async () => {
  const bytes = new Uint8Array([0xc3, 0x28]);
  const { storage } = createStorageFake({
    metadata: { contentType: 'text/plain', size: '2' },
    chunks: [bytes],
  });
  await assert.rejects(
    () => inspect(storage, {
      expectedPolicy: policy({ sourceType: 'text', allowedContentTypes: ['text/plain'] }),
    }),
    { code: 'ingestion/invalid-original', permanent: true },
  );
});

test('redacts transient Storage metadata and stream errors', async () => {
  const textPolicy = policy({ sourceType: 'text', allowedContentTypes: ['text/plain'] });
  for (const { setup, input = {} } of [
    { setup: { metadataError: new Error('raw storage credential') } },
    { setup: { streamError: new Error('raw object path and provider detail') } },
    {
      setup: {
        metadata: { contentType: 'text/plain' },
        streamError: new TypeError('raw stream implementation detail'),
      },
      input: { expectedPolicy: textPolicy },
    },
  ]) {
    const { storage } = createStorageFake(setup);
    await assert.rejects(
      () => inspect(storage, input),
      (error) => (
        error.code === 'internal/error'
        && error.permanent === false
        && !error.message.includes('raw')
      ),
    );
  }
});
