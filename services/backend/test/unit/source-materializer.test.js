import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { createFirebaseSourceMaterializer } from '../../src/adapters/firebase-source-materializer.js';

const BUCKET = 'demo-elsewhere.appspot.com';
const OBJECT_NAME = 'users/user_alpha/originals/batch_12345678/frag_12345678';
const GENERATION = '1740000000000001';
const CONTENT_TYPE = 'image/jpeg';
const CRC32C = 'ImIEBA==';
const HARD_MAX_BYTES = 50 * 1024 * 1024;
const SOURCE_BYTES = new TextEncoder().encode('elsewhere-original');

function expectedStorageFacts(overrides = {}) {
  return {
    generation: GENERATION,
    sizeBytes: SOURCE_BYTES.byteLength,
    contentType: CONTENT_TYPE,
    crc32c: CRC32C,
    md5Hash: null,
    ...overrides,
  };
}

function sourceRevision(overrides = {}) {
  return {
    bucket: BUCKET,
    objectName: OBJECT_NAME,
    generation: GENERATION,
    ...overrides,
  };
}

function createStorageFake({
  metadata = {},
  chunks = [SOURCE_BYTES],
  metadataError,
  metadataGate,
  streamFactory,
} = {}) {
  const calls = {
    buckets: [],
    files: [],
    metadata: 0,
    streams: [],
  };
  const completeMetadata = {
    generation: GENERATION,
    size: String(SOURCE_BYTES.byteLength),
    contentType: CONTENT_TYPE,
    crc32c: CRC32C,
    md5Hash: undefined,
    ...metadata,
  };
  const file = {
    async getMetadata() {
      calls.metadata += 1;
      if (metadataGate) await metadataGate;
      if (metadataError) throw metadataError;
      return [completeMetadata];
    },
    createReadStream(options = {}) {
      calls.streams.push(options);
      return streamFactory ? streamFactory() : Readable.from(chunks);
    },
  };
  const storage = {
    bucket(bucketName) {
      calls.buckets.push(bucketName);
      return {
        file(objectName, options) {
          calls.files.push({ objectName, options });
          return file;
        },
      };
    },
  };
  return { storage, calls };
}

async function createTempRoot(t) {
  const root = await mkdtemp(join(tmpdir(), 'elsewhere-materializer-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function createMaterializer(storage, tempRoot, allowedBuckets = [BUCKET]) {
  return createFirebaseSourceMaterializer({ storage, allowedBuckets, tempRoot });
}

function materialize(materializer, overrides = {}) {
  return materializer.materialize({
    sourceRevision: sourceRevision(),
    expectedStorageFacts: expectedStorageFacts(),
    maxBytes: 1024,
    signal: new AbortController().signal,
    deadlineAt: new Date(Date.now() + 5_000).toISOString(),
    ...overrides,
  });
}

test('pins bucket object and generation and computes streaming SHA-256', async (t) => {
  const tempRoot = await createTempRoot(t);
  const { storage, calls } = createStorageFake({
    chunks: [SOURCE_BYTES.subarray(0, 4), SOURCE_BYTES.subarray(4)],
  });

  const result = await materialize(createMaterializer(storage, tempRoot));

  assert.deepEqual(calls.buckets, [BUCKET]);
  assert.deepEqual(calls.files, [{
    objectName: OBJECT_NAME,
    options: { generation: GENERATION },
  }]);
  assert.equal(calls.metadata, 1);
  assert.equal(calls.streams.length, 1);
  assert.equal(result.sizeBytes, SOURCE_BYTES.byteLength);
  assert.equal(
    result.inputHash,
    createHash('sha256').update(SOURCE_BYTES).digest('hex'),
  );
  assert.deepEqual(new Uint8Array(await readFile(result.path)), SOURCE_BYTES);
  assert.equal(Object.isFrozen(result), true);
  await result.cleanup();
});

test('revalidates generation size content type and crc32c before byte streaming', async (t) => {
  const tempRoot = await createTempRoot(t);
  const mismatches = [
    { generation: '1740000000000002' },
    { size: String(SOURCE_BYTES.byteLength + 1) },
    { contentType: 'image/png' },
    { crc32c: 'different==' },
  ];

  for (const metadata of mismatches) {
    const { storage, calls } = createStorageFake({ metadata });
    await assert.rejects(
      () => materialize(createMaterializer(storage, tempRoot)),
      { code: 'processing/invalid-media', retryable: false },
    );
    assert.equal(calls.streams.length, 0);
  }

  const { storage } = createStorageFake({ metadata: { md5Hash: undefined } });
  const result = await materialize(createMaterializer(storage, tempRoot), {
    expectedStorageFacts: expectedStorageFacts({ md5Hash: 'ignored-md5' }),
  });
  assert.equal(result.sizeBytes, SOURCE_BYTES.byteLength);
  await result.cleanup();
});

test('creates a random 0700 directory and a 0600 non-user-named file', async (t) => {
  const tempRoot = await createTempRoot(t);
  const { storage } = createStorageFake();
  const materializer = createMaterializer(storage, tempRoot);
  const injectedName = '../../private/secret-original.jpg';

  const first = await materialize(materializer, { originalName: injectedName });
  const second = await materialize(materializer, { originalName: injectedName });

  assert.notEqual(first.path, second.path);
  for (const result of [first, second]) {
    assert.equal((await stat(join(result.path, '..'))).mode & 0o777, 0o700);
    assert.equal((await stat(result.path)).mode & 0o777, 0o600);
    assert.equal(basename(result.path), 'source');
    assert.equal(result.path.includes('secret-original'), false);
    assert.equal(result.path.includes('frag_12345678'), false);
  }
  await first.cleanup();
  await second.cleanup();
});

test('rejects bytes beyond authoritative size or the 50 MiB hard cap', async (t) => {
  const tempRoot = await createTempRoot(t);

  const policyLimited = createStorageFake();
  await assert.rejects(
    () => materialize(createMaterializer(policyLimited.storage, tempRoot), { maxBytes: 8 }),
    { code: 'processing/media-limits-exceeded', retryable: false },
  );
  assert.equal(policyLimited.calls.streams.length, 0);

  const overHardCap = createStorageFake({
    metadata: { size: String(HARD_MAX_BYTES + 1) },
  });
  await assert.rejects(
    () => materialize(createMaterializer(overHardCap.storage, tempRoot), {
      expectedStorageFacts: expectedStorageFacts({ sizeBytes: HARD_MAX_BYTES + 1 }),
      maxBytes: HARD_MAX_BYTES + 10,
    }),
    { code: 'processing/media-limits-exceeded', retryable: false },
  );
  assert.equal(overHardCap.calls.streams.length, 0);

  const extraByte = createStorageFake({ chunks: [SOURCE_BYTES, new Uint8Array([0])] });
  await assert.rejects(
    () => materialize(createMaterializer(extraByte.storage, tempRoot)),
    { code: 'processing/media-limits-exceeded', retryable: false },
  );
  assert.deepEqual(await readdir(tempRoot), []);
});

test('aborts the source stream at deadline or AbortSignal', async (t) => {
  const tempRoot = await createTempRoot(t);

  for (const useDeadline of [false, true]) {
    const streams = [];
    const { storage } = createStorageFake({
      streamFactory() {
        const stream = new PassThrough();
        streams.push(stream);
        stream.write(SOURCE_BYTES.subarray(0, 3));
        return stream;
      },
    });
    const controller = new AbortController();
    const options = useDeadline
      ? { deadlineAt: new Date(Date.now() + 20).toISOString() }
      : { signal: controller.signal };
    if (!useDeadline) setTimeout(() => controller.abort(), 20);

    await assert.rejects(
      () => materialize(createMaterializer(storage, tempRoot), options),
      { code: 'processing/soft-timeout', retryable: true },
    );
    assert.equal(streams[0].destroyed, true);
    assert.deepEqual(await readdir(tempRoot), []);
  }

  const metadataGate = Promise.withResolvers();
  const duringMetadata = createStorageFake({ metadataGate: metadataGate.promise });
  const controller = new AbortController();
  const pending = materialize(createMaterializer(duringMetadata.storage, tempRoot), {
    signal: controller.signal,
  });
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  metadataGate.resolve();
  await assert.rejects(
    () => pending,
    { code: 'processing/soft-timeout', retryable: true },
  );
  assert.equal(duringMetadata.calls.streams.length, 0);
});

test('cleans partial material after stream and filesystem failures', async (t) => {
  const tempRoot = await createTempRoot(t);
  const rawStreamFailure = new Error('raw provider path users/private/original.jpg');
  const { storage } = createStorageFake({
    streamFactory: () => Readable.from((async function* failAfterPartial() {
      yield SOURCE_BYTES.subarray(0, 3);
      throw rawStreamFailure;
    }())),
  });

  await assert.rejects(
    () => materialize(createMaterializer(storage, tempRoot)),
    { code: 'processing/storage-unavailable', retryable: true },
  );
  assert.deepEqual(await readdir(tempRoot), []);

  const unusableRoot = join(tempRoot, 'not-a-directory');
  await writeFile(unusableRoot, 'occupied');
  const filesystemFailure = createStorageFake();
  await assert.rejects(
    () => materialize(createMaterializer(filesystemFailure.storage, unusableRoot)),
    { code: 'processing/storage-unavailable', retryable: true },
  );
  assert.deepEqual(await readdir(tempRoot), ['not-a-directory']);
});

test('cleanup is idempotent and removes successful material', async (t) => {
  const tempRoot = await createTempRoot(t);
  const { storage } = createStorageFake();
  const result = await materialize(createMaterializer(storage, tempRoot));
  const materialDirectory = join(result.path, '..');

  await result.cleanup();
  await result.cleanup();

  await assert.rejects(() => stat(materialDirectory), { code: 'ENOENT' });
  assert.deepEqual(await readdir(tempRoot), []);
});

test('redacts bucket object path original name and raw Storage errors', async (t) => {
  const tempRoot = await createTempRoot(t);
  const secrets = [BUCKET, OBJECT_NAME, 'secret-original.jpg', 'provider-secret'];
  const cases = [
    createStorageFake({ metadataError: new Error(`provider-secret ${OBJECT_NAME}`) }),
    createStorageFake({
      streamFactory: () => Readable.from((async function* fail() {
        throw new Error(`provider-secret ${BUCKET}`);
      }())),
    }),
  ];

  for (const { storage } of cases) {
    let caught;
    try {
      await materialize(createMaterializer(storage, tempRoot), {
        originalName: '../../secret-original.jpg',
      });
    } catch (error) {
      caught = error;
    }
    assert.equal(caught?.code, 'processing/storage-unavailable');
    assert.equal(caught?.retryable, true);
    for (const secret of secrets) assert.equal(String(caught).includes(secret), false);
  }

  const disallowed = createStorageFake();
  await assert.rejects(
    () => materialize(createMaterializer(disallowed.storage, tempRoot, ['other.appspot.com'])),
    { code: 'processing/invalid-media', retryable: false },
  );
  assert.equal(disallowed.calls.buckets.length, 0);
});
