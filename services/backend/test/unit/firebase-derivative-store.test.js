import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { createFirebaseDerivativeStore } from '../../src/adapters/firebase-derivative-store.js';
import { makeDerivativePath } from '../../src/processing/identity.js';

const BUCKET = 'demo-elsewhere.appspot.com';
const OWNER_ID = 'user_alpha';
const FRAGMENT_ID = 'frag_12345678';
const INPUT_HASH = 'a'.repeat(64);
const PROCESSOR_NAME = 'deterministic-media';
const PROCESSOR_VERSION = 'v1';
const FUTURE_DEADLINE = '2099-01-01T00:00:00.000Z';
const THUMBNAIL = Object.freeze({
  buffer: Buffer.from('immutable-webp-thumbnail'),
  width: 512,
  height: 384,
});
const PATH = makeDerivativePath({
  ownerId: OWNER_ID,
  fragmentId: FRAGMENT_ID,
  processorName: PROCESSOR_NAME,
  processorVersion: PROCESSOR_VERSION,
  inputHash: INPUT_HASH,
});

function crc32cBase64(bytes) {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0x82f6_3b78 : 0);
    }
  }
  const encoded = Buffer.allocUnsafe(4);
  encoded.writeUInt32BE((crc ^ 0xffff_ffff) >>> 0);
  return encoded.toString('base64');
}

assert.equal(crc32cBase64(Buffer.from('123456789')), '4waSgw==');
const CRC32C = crc32cBase64(THUMBNAIL.buffer);

function frozenCustomMetadata(overrides = {}) {
  return {
    ownerId: OWNER_ID,
    fragmentId: FRAGMENT_ID,
    processorName: PROCESSOR_NAME,
    processorVersion: PROCESSOR_VERSION,
    inputHash: INPUT_HASH,
    width: String(THUMBNAIL.width),
    height: String(THUMBNAIL.height),
    ...overrides,
  };
}

function liveMetadata(overrides = {}) {
  return {
    bucket: BUCKET,
    name: PATH,
    generation: '1740000000000001',
    metageneration: '1',
    contentType: 'image/webp',
    size: String(THUMBNAIL.buffer.byteLength),
    crc32c: CRC32C,
    metadata: frozenCustomMetadata(),
    ...overrides,
  };
}

function createStorageFake({
  metadata = liveMetadata(),
  saveError = null,
  metadataError = null,
  bucketError = null,
  fileError = null,
  holdUpload = false,
  metadataDelayMs = 0,
} = {}) {
  const calls = {
    buckets: [],
    files: [],
    saves: [],
    metadata: 0,
    destroyed: 0,
    order: [],
  };
  const file = {
    async save(bytes, options) {
      calls.order.push('save');
      calls.saves.push({ bytes, options });
      if (saveError) throw saveError;
    },
    createWriteStream(options) {
      calls.order.push('createWriteStream');
      const record = { bytes: Buffer.alloc(0), options };
      calls.saves.push(record);
      const chunks = [];
      let heldWrite = null;
      return new Writable({
        write(chunk, _encoding, callback) {
          chunks.push(Buffer.from(chunk));
          record.bytes = Buffer.concat(chunks);
          if (holdUpload) heldWrite = callback;
          else callback();
        },
        final(callback) {
          if (saveError) callback(saveError);
          else callback();
        },
        destroy(error, callback) {
          calls.destroyed += 1;
          if (heldWrite) {
            const pending = heldWrite;
            heldWrite = null;
            pending(error);
          }
          callback(error);
        },
      });
    },
    async getMetadata() {
      calls.order.push('getMetadata');
      calls.metadata += 1;
      if (metadataDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, metadataDelayMs));
      }
      if (metadataError) throw metadataError;
      return [metadata];
    },
  };
  const storage = {
    bucket(bucketName) {
      calls.buckets.push(bucketName);
      if (bucketError) throw bucketError;
      return {
        file(path) {
          calls.files.push(path);
          if (fileError) throw fileError;
          return file;
        },
      };
    },
  };
  return { storage, calls };
}

function createStore(storage, allowedBuckets = [BUCKET]) {
  return createFirebaseDerivativeStore({ storage, allowedBuckets });
}

function putThumbnail(store, overrides = {}) {
  return store.putThumbnail({
    bucket: BUCKET,
    ownerId: OWNER_ID,
    fragmentId: FRAGMENT_ID,
    inputHash: INPUT_HASH,
    thumbnail: THUMBNAIL,
    signal: new AbortController().signal,
    deadlineAt: FUTURE_DEADLINE,
    ...overrides,
  });
}

function expectedSaveOptions() {
  return {
    resumable: false,
    preconditionOpts: { ifGenerationMatch: 0 },
    validation: 'crc32c',
    metadata: {
      contentType: 'image/webp',
      metadata: frozenCustomMetadata(),
    },
  };
}

function assertStableError(error, code, retryable) {
  assert.equal(error.name, 'ProcessingError');
  assert.equal(error.code, code);
  assert.equal(error.retryable, retryable);
  assert.equal(error.cause, undefined);
  assert.equal(error.message.includes('secret'), false);
  return true;
}

test('creates the deterministic thumbnail path with generation zero precondition', async () => {
  const { storage, calls } = createStorageFake();

  await putThumbnail(createStore(storage));

  assert.deepEqual(calls.buckets, [BUCKET]);
  assert.deepEqual(calls.files, [PATH]);
  assert.deepEqual(calls.order, ['createWriteStream', 'getMetadata']);
  assert.equal(calls.saves.length, 1);
  assert.deepEqual(calls.saves[0].bytes, THUMBNAIL.buffer);
  assert.deepEqual(calls.saves[0].options, expectedSaveOptions());
});

test('returns frozen authoritative normalized object facts after creation', async () => {
  const metadata = liveMetadata({
    generation: 7,
    metageneration: 3,
    size: THUMBNAIL.buffer.byteLength,
  });
  delete metadata.bucket;
  const { storage, calls } = createStorageFake({
    metadata,
  });

  const result = await putThumbnail(createStore(storage));

  assert.equal(calls.metadata, 1);
  assert.deepEqual(result, {
    path: PATH,
    generation: '7',
    metageneration: '3',
    contentType: 'image/webp',
    sizeBytes: THUMBNAIL.buffer.byteLength,
    crc32c: CRC32C,
    width: THUMBNAIL.width,
    height: THUMBNAIL.height,
  });
  assert.equal(Object.isFrozen(result), true);
});

test('computes the production CRC32C for the standard vector on create and reuse', async (t) => {
  const thumbnail = Object.freeze({
    ...THUMBNAIL,
    buffer: Buffer.from('123456789'),
  });
  const metadata = liveMetadata({
    size: String(thumbnail.buffer.byteLength),
    crc32c: '4waSgw==',
  });

  for (const saveError of [null, { code: 412 }]) {
    await t.test(saveError === null ? 'create' : 'reuse', async () => {
      const { storage } = createStorageFake({ metadata, saveError });

      const result = await putThumbnail(createStore(storage), { thumbnail });

      assert.equal(result.crc32c, '4waSgw==');
      assert.equal(result.sizeBytes, 9);
    });
  }
});

test('a numeric or string 412 reuses only a byte-identical frozen derivative', async (t) => {
  for (const code of [412, '412']) {
    await t.test(`code ${JSON.stringify(code)}`, async () => {
      const { storage, calls } = createStorageFake({
        saveError: { code, message: 'secret provider precondition detail' },
      });

      const result = await putThumbnail(createStore(storage));

      assert.equal(result.path, PATH);
      assert.equal(result.crc32c, CRC32C);
      assert.deepEqual(calls.order, ['createWriteStream', 'getMetadata']);
      assert.equal(calls.saves.length, 1);
      assert.equal(calls.metadata, 1);
    });
  }
});

test('a 412 with any frozen object fact mismatch is terminal conflict without overwrite', async (t) => {
  const mismatches = [
    ['bucket', { bucket: 'other.appspot.com' }],
    ['path', { name: PATH.replace(OWNER_ID, 'user_beta') }],
    ['owner', { metadata: frozenCustomMetadata({ ownerId: 'user_beta' }) }],
    ['fragment', { metadata: frozenCustomMetadata({ fragmentId: 'frag_87654321' }) }],
    ['hash', { metadata: frozenCustomMetadata({ inputHash: 'b'.repeat(64) }) }],
    ['processor', { metadata: frozenCustomMetadata({ processorName: 'other-media' }) }],
    ['version', { metadata: frozenCustomMetadata({ processorVersion: 'v2' }) }],
    ['MIME', { contentType: 'image/png' }],
    ['size', { size: String(THUMBNAIL.buffer.byteLength + 1) }],
    ['checksum', { crc32c: crc32cBase64(Buffer.from('different bytes')) }],
    ['width', { metadata: frozenCustomMetadata({ width: '511' }) }],
    ['height', { metadata: frozenCustomMetadata({ height: '383' }) }],
    ['generation', { generation: '' }],
    ['metageneration', { metageneration: '' }],
    ['missing custom field', (() => {
      const metadata = frozenCustomMetadata();
      delete metadata.inputHash;
      return { metadata };
    })()],
    ['extra custom field', {
      metadata: frozenCustomMetadata({ unexpected: 'not-frozen-contract' }),
    }],
  ];

  for (const [name, override] of mismatches) {
    await t.test(name, async () => {
      const { storage, calls } = createStorageFake({
        saveError: { code: 412 },
        metadata: liveMetadata(override),
      });

      await assert.rejects(
        () => putThumbnail(createStore(storage)),
        (error) => assertStableError(error, 'processing/derivative-conflict', false),
      );
      assert.equal(calls.saves.length, 1);
      assert.equal(calls.metadata, 1);
    });
  }
});

test('successful creation also rejects mismatched authoritative metadata', async () => {
  for (const override of [
    { bucket: 'other.appspot.com' },
    { crc32c: crc32cBase64(Buffer.from('forged')) },
  ]) {
    const { storage, calls } = createStorageFake({
      metadata: liveMetadata(override),
    });

    await assert.rejects(
      () => putThumbnail(createStore(storage)),
      (error) => assertStableError(error, 'processing/derivative-conflict', false),
    );
    assert.deepEqual(calls.order, ['createWriteStream', 'getMetadata']);
  }
});

test('generation metageneration and size accept only canonical positive integer forms', async (t) => {
  const invalidFacts = [
    ['generation whitespace', { generation: ' 1' }],
    ['generation plus', { generation: '+1' }],
    ['generation minus', { generation: '-1' }],
    ['generation zero string', { generation: '0' }],
    ['generation zero number', { generation: 0 }],
    ['generation fraction string', { generation: '1.5' }],
    ['generation fraction number', { generation: 1.5 }],
    ['generation exponent string', { generation: '1e2' }],
    ['generation NaN', { generation: Number.NaN }],
    ['generation Infinity', { generation: Number.POSITIVE_INFINITY }],
    ['generation unsafe number', { generation: Number.MAX_SAFE_INTEGER + 1 }],
    ['generation leading zero', { generation: '01' }],
    ['metageneration leading zero', { metageneration: '01' }],
    ['metageneration unsafe number', { metageneration: Number.MAX_SAFE_INTEGER + 1 }],
    ['size leading zero', { size: `0${THUMBNAIL.buffer.byteLength}` }],
    ['size exponent', { size: `${THUMBNAIL.buffer.byteLength}e0` }],
    ['size unsafe number', { size: Number.MAX_SAFE_INTEGER + 1 }],
  ];

  for (const [name, override] of invalidFacts) {
    await t.test(name, async () => {
      const { storage } = createStorageFake({
        saveError: { code: 412 },
        metadata: liveMetadata(override),
      });

      await assert.rejects(
        () => putThumbnail(createStore(storage)),
        (error) => assertStableError(error, 'processing/derivative-conflict', false),
      );
    });
  }
});

test('a definitive metadata 404 after create or reuse is terminal conflict by error code only', async (t) => {
  for (const saveError of [null, { code: 412 }]) {
    for (const code of [404, '404']) {
      await t.test(`${saveError === null ? 'create' : 'reuse'} code ${JSON.stringify(code)}`, async () => {
        const { storage, calls } = createStorageFake({
          saveError,
          metadataError: { code, message: 'secret definitive missing object' },
        });

        await assert.rejects(
          () => putThumbnail(createStore(storage)),
          (error) => assertStableError(error, 'processing/derivative-conflict', false),
        );
        assert.equal(calls.metadata, 1);
      });
    }
  }
});

test('only a stable 412 code is reusable and transient provider failures are retryable and redacted', async (t) => {
  const cases = [
    ['save', {
      saveError: { code: 500, message: 'secret save detail mentioning 412' },
    }, 0],
    ['metadata after create', {
      metadataError: { code: 500, message: 'secret metadata detail mentioning 404' },
    }, 1],
    ['metadata after 412', {
      saveError: { code: 412 },
      metadataError: { code: 500, message: 'secret reuse metadata detail mentioning 404' },
    }, 1],
  ];

  for (const [name, setup, expectedMetadataCalls] of cases) {
    await t.test(name, async () => {
      const { storage, calls } = createStorageFake(setup);
      await assert.rejects(
        () => putThumbnail(createStore(storage)),
        (error) => assertStableError(error, 'processing/storage-unavailable', true),
      );
      assert.equal(calls.saves.length, 1);
      assert.equal(calls.metadata, expectedMetadataCalls);
    });
  }
});

test('a 412 while constructing a bucket or file handle never enters object reuse', async (t) => {
  for (const setup of [
    { bucketError: { code: 412, message: 'secret bucket construction failure' } },
    { fileError: { code: '412', message: 'secret file construction failure' } },
  ]) {
    await t.test(setup.bucketError ? 'bucket' : 'file', async () => {
      const { storage, calls } = createStorageFake(setup);

      await assert.rejects(
        () => putThumbnail(createStore(storage)),
        (error) => assertStableError(error, 'processing/storage-unavailable', true),
      );
      assert.deepEqual(calls.saves, []);
      assert.equal(calls.metadata, 0);
    });
  }
});

test('unallowlisted buckets invalid identities and client paths fail before Storage access', async (t) => {
  const invalidInputs = [
    ['unallowlisted bucket', { bucket: 'other.appspot.com' }],
    ['owner ID', { ownerId: 'short' }],
    ['fragment ID', { fragmentId: 'short' }],
    ['input hash', { inputHash: 'not-a-sha256' }],
    ['empty thumbnail', { thumbnail: { ...THUMBNAIL, buffer: Buffer.alloc(0) } }],
    ['oversize width', { thumbnail: { ...THUMBNAIL, width: 513 } }],
    ['client path', { path: PATH }],
    ['cross-owner client path', { path: PATH.replace(OWNER_ID, 'user_beta') }],
    ['client processor override', { processorVersion: 'v2' }],
    ['missing signal', { signal: undefined }],
    ['forged signal', { signal: { aborted: false } }],
    ['missing deadline', { deadlineAt: undefined }],
    ['invalid deadline', { deadlineAt: 'not-an-instant' }],
    ['extra operation field', { operationId: 'client-value' }],
  ];

  for (const [name, override] of invalidInputs) {
    await t.test(name, async () => {
      const { storage, calls } = createStorageFake();
      await assert.rejects(
        () => putThumbnail(createStore(storage), override),
        (error) => assertStableError(error, 'processing/invalid-media', false),
      );
      assert.deepEqual(calls.buckets, []);
      assert.deepEqual(calls.files, []);
      assert.deepEqual(calls.saves, []);
      assert.equal(calls.metadata, 0);
    });
  }
});

test('pre-aborted signals and expired absolute deadlines stop before Storage access', async () => {
  const aborted = new AbortController();
  aborted.abort();
  for (const overrides of [
    { signal: aborted.signal },
    { deadlineAt: '2020-01-01T00:00:00.000Z' },
  ]) {
    const { storage, calls } = createStorageFake();
    await assert.rejects(
      () => putThumbnail(createStore(storage), overrides),
      (error) => assertStableError(error, 'processing/soft-timeout', true),
    );
    assert.deepEqual(calls.buckets, []);
    assert.deepEqual(calls.files, []);
  }
});

test('abort and deadline destroy an in-flight create-only upload without metadata read', async (t) => {
  for (const mode of ['signal', 'deadline']) {
    await t.test(mode, async () => {
      const controller = new AbortController();
      const { storage, calls } = createStorageFake({ holdUpload: true });
      const deadlineAt = mode === 'deadline'
        ? new Date(Date.now() + 15).toISOString()
        : FUTURE_DEADLINE;
      const operation = putThumbnail(createStore(storage), {
        signal: controller.signal,
        deadlineAt,
      });
      if (mode === 'signal') setImmediate(() => controller.abort());

      await assert.rejects(
        () => operation,
        (error) => assertStableError(error, 'processing/soft-timeout', true),
      );
      assert.equal(calls.saves.length, 1);
      assert.equal(calls.destroyed, 1);
      assert.equal(calls.metadata, 0);
    });
  }
});

test('metadata read is deadline-bound and observes a late provider rejection', async () => {
  const controller = new AbortController();
  const { storage, calls } = createStorageFake({
    metadataDelayMs: 50,
    metadataError: new Error('secret late metadata rejection'),
  });
  const operation = putThumbnail(createStore(storage), { signal: controller.signal });
  setTimeout(() => controller.abort(), 5);

  const settled = await Promise.race([
    operation.then(
      () => ({ outcome: 'resolved' }),
      (error) => ({ outcome: 'rejected', error }),
    ),
    new Promise((resolve) => setTimeout(() => resolve({ outcome: 'late' }), 30)),
  ]);
  assert.equal(settled.outcome, 'rejected');
  assertStableError(settled.error, 'processing/soft-timeout', true);
  assert.equal(calls.metadata, 1);
  await new Promise((resolve) => setTimeout(resolve, 40));
});
