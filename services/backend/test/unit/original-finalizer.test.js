import test from 'node:test';
import assert from 'node:assert/strict';
import { createOriginalFinalizer } from '../../src/ingestion/service.js';
import { IngestionError } from '../../src/ingestion/errors.js';
import { createMemoryRepository } from '../../src/repositories/memory.js';
import { makePendingBatch } from '../fixtures/import.js';

const event = Object.freeze({
  eventId: 'event-12345678',
  bucket: 'demo-elsewhere.appspot.com',
  objectName: 'users/user_alpha/originals/batch_12345678/frag_12345678',
  generation: '1740000000000001',
  uid: 'user_alpha',
  batchId: 'batch_12345678',
  fragmentId: 'frag_12345678',
});

const storageFacts = Object.freeze({
  generation: event.generation,
  contentType: 'image/jpeg',
  sizeBytes: 2_841_930,
  crc32c: 'ImIEBA==',
  md5Hash: null,
});

const fixedClock = () => '2026-07-16T06:10:00.000Z';

const createSystem = async ({ repository = createMemoryRepository(), objectInspector } = {}) => {
  await repository.createImportBatch('user_alpha', makePendingBatch());
  const inspector = objectInspector ?? {
    inspectOriginal: async () => ({ detectedFormat: 'jpeg', storageFacts }),
  };
  return {
    repository,
    finalizer: createOriginalFinalizer({ repository, objectInspector: inspector, clock: fixedClock }),
  };
};

test('unregistered batch never reaches object inspection', async () => {
  let inspectCalls = 0;
  const repository = createMemoryRepository();
  const finalizer = createOriginalFinalizer({
    repository,
    objectInspector: { inspectOriginal: async () => { inspectCalls += 1; } },
    clock: fixedClock,
  });

  await assert.rejects(
    () => finalizer.handle(event),
    { code: 'ingestion/unregistered-original', permanent: true },
  );
  assert.equal(inspectCalls, 0);
});

test('passes exact manifest policy to inspector and creates one uploaded Fragment', async () => {
  const calls = [];
  const { finalizer, repository } = await createSystem({
    objectInspector: {
      async inspectOriginal(input) {
        calls.push(input);
        return { detectedFormat: 'jpeg', storageFacts };
      },
    },
  });

  const result = await finalizer.handle(event);
  assert.deepEqual(result, { outcome: 'applied' });
  assert.deepEqual(calls, [{
    bucket: event.bucket,
    objectName: event.objectName,
    generation: event.generation,
    expectedPolicy: {
      sourceType: 'photo',
      allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
      maxBytes: 50 * 1024 * 1024,
    },
  }]);

  const fragment = await repository.getFragment('user_alpha', event.fragmentId);
  assert.equal(fragment.status, 'uploaded');
  assert.equal(fragment.type, 'photo');
  assert.deepEqual(fragment.storage, {
    bucket: event.bucket,
    originalPath: event.objectName,
    ...storageFacts,
  });
  assert.equal(fragment.source.originalName, 'IMG_1842.JPG');
  assert.deepEqual(fragment.hashes, {
    sha256: null,
    perceptualHash: null,
    perceptualHashAlgorithm: null,
    perceptualHashVersion: null,
    perceptualHashBands: null,
  });
  assert.equal(fragment.technicalMetadata, null);
  assert.deepEqual(fragment.derivatives, { thumbnail: null });
  assert.deepEqual(fragment.processing, { deterministic: null });
  assert.deepEqual(fragment.facts, {});
  assert.equal(fragment.journeyId, null);
  assert.equal(fragment.createdAt, fixedClock());
});

test('permanent object failure records one rejected outcome without Fragment', async () => {
  const { finalizer, repository } = await createSystem({
    objectInspector: {
      async inspectOriginal() {
        throw new IngestionError('ingestion/invalid-original', { permanent: true });
      },
    },
  });

  assert.deepEqual(await finalizer.handle(event), { outcome: 'rejected' });
  assert.equal(await repository.getFragment('user_alpha', event.fragmentId), null);
  const batch = await repository.getImportBatch('user_alpha', event.batchId);
  assert.equal(batch.uploads[event.fragmentId].state, 'failed');
  assert.equal(batch.counters.failed, 1);

  assert.deepEqual(await finalizer.handle(event), { outcome: 'duplicate' });
  assert.equal((await repository.getImportBatch('user_alpha', event.batchId)).counters.failed, 1);
});

test('retryable object failure leaves manifest pending', async () => {
  const { finalizer, repository } = await createSystem({
    objectInspector: {
      async inspectOriginal() {
        throw new IngestionError('internal/error', { permanent: false });
      },
    },
  });

  await assert.rejects(
    () => finalizer.handle(event),
    { code: 'internal/error', permanent: false },
  );
  const batch = await repository.getImportBatch('user_alpha', event.batchId);
  assert.equal(batch.uploads[event.fragmentId].state, 'pending');
  assert.equal(batch.counters.failed, 0);
});

test('same generation is duplicate and a different generation conflicts', async () => {
  let inspectCalls = 0;
  const { finalizer } = await createSystem({
    objectInspector: {
      async inspectOriginal() {
        inspectCalls += 1;
        return { detectedFormat: 'jpeg', storageFacts };
      },
    },
  });
  assert.deepEqual(await finalizer.handle(event), { outcome: 'applied' });
  assert.deepEqual(await finalizer.handle(event), { outcome: 'duplicate' });
  assert.equal(inspectCalls, 1);

  await assert.rejects(
    () => finalizer.handle({ ...event, generation: 'different-generation' }),
    { code: 'ingestion/original-conflict', permanent: true },
  );
  assert.equal(inspectCalls, 1);
});

test('finalizer errors expose no Source Descriptor or object path detail', async () => {
  const finalizer = createOriginalFinalizer({
    repository: createMemoryRepository(),
    objectInspector: { inspectOriginal: async () => {} },
    clock: fixedClock,
  });
  await assert.rejects(
    () => finalizer.handle(event),
    (error) => (
      error.code === 'ingestion/unregistered-original'
      && !error.message.includes('users/user_alpha')
      && !error.message.includes('IMG_1842')
    ),
  );
});
