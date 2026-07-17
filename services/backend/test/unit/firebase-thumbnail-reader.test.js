import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createFirebaseThumbnailReader } from '../../src/adapters/firebase-thumbnail-reader.js';
import { makeUploadedFragment } from '../fixtures/import.js';

const BUCKET = 'demo-elsewhere.appspot.com';
const PATH = 'users/user_alpha/derived/frag_12345678/deterministic-media/v1/hash/thumbnail.webp';
const GENERATION = '1740000000000100';
const BYTES = Buffer.from('bounded-webp-thumbnail');

function makeFragment(overrides = {}) {
  const thumbnail = {
    path: PATH,
    generation: GENERATION,
    metageneration: '1',
    contentType: 'image/webp',
    sizeBytes: BYTES.byteLength,
    crc32c: 'AAAAAA==',
    width: 512,
    height: 384,
    ...overrides,
  };
  return makeUploadedFragment({ derivatives: { thumbnail } });
}

function makeMetadata(overrides = {}) {
  return {
    bucket: BUCKET,
    name: PATH,
    generation: GENERATION,
    contentType: 'image/webp',
    size: String(BYTES.byteLength),
    ...overrides,
  };
}

function createStorageFake({
  metadata = makeMetadata(),
  bytes = BYTES,
  metadataError = null,
  streamError = null,
  hold = false,
} = {}) {
  const calls = { buckets: [], files: [], metadata: 0, streams: 0, destroyed: 0 };
  let heldStream;
  const file = {
    async getMetadata() {
      calls.metadata += 1;
      if (metadataError) throw metadataError;
      return [metadata];
    },
    createReadStream(options) {
      calls.streams += 1;
      calls.streamOptions = options;
      if (hold) {
        heldStream = new Readable({ read() {} });
        const destroy = heldStream.destroy.bind(heldStream);
        heldStream.destroy = (error) => {
          calls.destroyed += 1;
          return destroy(error);
        };
        return heldStream;
      }
      if (streamError) {
        return new Readable({
          read() {
            this.destroy(streamError);
          },
        });
      }
      return Readable.from([bytes]);
    },
  };
  const storage = {
    bucket(bucket) {
      calls.buckets.push(bucket);
      return {
        file(path, options) {
          calls.files.push({ path, options });
          return file;
        },
      };
    },
  };
  return { storage, calls, getHeldStream: () => heldStream };
}

const createReader = (storage, overrides = {}) => createFirebaseThumbnailReader({
  storage,
  allowedBuckets: [BUCKET],
  maxBytes: 2_097_152,
  ...overrides,
});

test('reads only the generation-pinned derivative declared by the Fragment', async () => {
  const { storage, calls } = createStorageFake();
  const signal = new AbortController().signal;

  const result = await createReader(storage).read(makeFragment(), { signal });

  assert.deepEqual(result, BYTES);
  assert.notEqual(result, BYTES);
  assert.deepEqual(calls.buckets, [BUCKET]);
  assert.deepEqual(calls.files, [{ path: PATH, options: { generation: GENERATION } }]);
  assert.equal(calls.metadata, 1);
  assert.equal(calls.streams, 1);
  assert.deepEqual(calls.streamOptions, { validation: 'crc32c', decompress: false });
});

test('rejects an unallowlisted bucket before Storage access', async () => {
  const { storage, calls } = createStorageFake();
  const fragment = makeFragment();
  fragment.storage.bucket = 'other.appspot.com';

  await assert.rejects(
    createReader(storage).read(fragment, { signal: new AbortController().signal }),
  );
  assert.deepEqual(calls.buckets, []);
});

test('validates generation MIME and bounded authoritative size before streaming', async (t) => {
  for (const [name, metadata] of [
    ['generation', makeMetadata({ generation: '1740000000000101' })],
    ['MIME', makeMetadata({ contentType: 'image/png' })],
    ['zero size', makeMetadata({ size: '0' })],
    ['oversize', makeMetadata({ size: String(2_097_153) })],
  ]) {
    await t.test(name, async () => {
      const { storage, calls } = createStorageFake({ metadata });
      await assert.rejects(
        createReader(storage).read(makeFragment(), {
          signal: new AbortController().signal,
        }),
      );
      assert.equal(calls.streams, 0);
    });
  }
});

test('rejects a stream that exceeds or falls short of authoritative metadata size', async (t) => {
  for (const [name, bytes] of [
    ['exceeds', Buffer.concat([BYTES, Buffer.of(0)])],
    ['falls short', BYTES.subarray(0, -1)],
  ]) {
    await t.test(name, async () => {
      const { storage } = createStorageFake({ bytes });
      await assert.rejects(
        createReader(storage).read(makeFragment(), {
          signal: new AbortController().signal,
        }),
      );
    });
  }
});

test('abort destroys an in-flight derivative stream', async () => {
  const { storage, calls } = createStorageFake({ hold: true });
  const controller = new AbortController();
  const pending = createReader(storage).read(makeFragment(), { signal: controller.signal });
  for (let index = 0; index < 20 && calls.streams === 0; index += 1) await Promise.resolve();

  controller.abort();

  await assert.rejects(pending);
  assert.equal(calls.destroyed, 1);
});

test('raw Storage failures and private paths are redacted', async (t) => {
  const secret = 'secret/users/user_alpha/originals/private.jpg';
  for (const fake of [
    createStorageFake({ metadataError: new Error(secret) }),
    createStorageFake({ streamError: new Error(secret) }),
  ]) {
    await t.test(fake.calls.metadata === 0 ? 'stream' : 'storage', async () => {
      await assert.rejects(
        createReader(fake.storage).read(makeFragment(), {
          signal: new AbortController().signal,
        }),
        (error) => {
          assert.equal(error.message.includes(secret), false);
          assert.equal(error.cause, undefined);
          return true;
        },
      );
    });
  }
});
