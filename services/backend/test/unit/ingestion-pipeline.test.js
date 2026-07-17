import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorageFinalizedPipeline } from '../../src/ingestion/pipeline.js';
import { retryableProcessingError } from '../../src/processing/errors.js';

const event = Object.freeze({
  eventId: 'event-12345678',
  bucket: 'demo-elsewhere.appspot.com',
  objectName: 'users/user_alpha/originals/batch_12345678/frag_12345678',
  generation: '1740000000000001',
  uid: 'user_alpha',
  batchId: 'batch_12345678',
  fragmentId: 'frag_12345678',
});

const processorEvent = Object.freeze({
  uid: event.uid,
  batchId: event.batchId,
  fragmentId: event.fragmentId,
  sourceRevision: Object.freeze({
    bucket: event.bucket,
    objectName: event.objectName,
    generation: event.generation,
  }),
});

function createPipeline(finalizerOutcome, processorOutcome = 'succeeded', calls = []) {
  return createStorageFinalizedPipeline({
    originalFinalizer: {
      async handle(received) {
        calls.push(['finalizer', received]);
        return { outcome: finalizerOutcome };
      },
    },
    deterministicProcessor: {
      async handle(received) {
        calls.push(['processor', received]);
        return { outcome: processorOutcome };
      },
    },
  });
}

test('applied original continues into deterministic processing with server-derived identity', async () => {
  const calls = [];
  const result = await createPipeline('applied', 'succeeded', calls).handle(event);

  assert.deepEqual(result, { outcome: 'succeeded' });
  assert.deepEqual(calls, [
    ['finalizer', event],
    ['processor', processorEvent],
  ]);
});

test('same-generation successful duplicate still ensures deterministic processing', async () => {
  const calls = [];
  const result = await createPipeline('duplicate', 'terminal_noop', calls).handle(event);

  assert.deepEqual(result, { outcome: 'terminal_noop' });
  assert.deepEqual(calls, [
    ['finalizer', event],
    ['processor', processorEvent],
  ]);
});

test('rejected upload never creates a processing task', async () => {
  const calls = [];
  const pipeline = createPipeline('rejected', 'succeeded', calls);
  const result = await pipeline.handle(event);
  const repeated = await pipeline.handle(event);

  assert.deepEqual(result, { outcome: 'rejected' });
  assert.deepEqual(repeated, { outcome: 'rejected' });
  assert.deepEqual(calls, [
    ['finalizer', event],
    ['finalizer', event],
  ]);
});

test('retryable processing propagates instead of acknowledging the event', async () => {
  const expected = retryableProcessingError('processing/soft-timeout');
  const pipeline = createStorageFinalizedPipeline({
    originalFinalizer: { async handle() { return { outcome: 'applied' }; } },
    deterministicProcessor: { async handle() { throw expected; } },
  });

  await assert.rejects(() => pipeline.handle(event), (error) => error === expected);
});

test('malformed finalizer and processor outcomes cannot be acknowledged', async () => {
  const malformedFinalizer = createStorageFinalizedPipeline({
    originalFinalizer: { async handle() { return { outcome: 'applied', forged: true }; } },
    deterministicProcessor: { async handle() { return { outcome: 'succeeded' }; } },
  });
  const malformedProcessor = createStorageFinalizedPipeline({
    originalFinalizer: { async handle() { return { outcome: 'applied' }; } },
    deterministicProcessor: { async handle() { return { outcome: 'busy' }; } },
  });

  await assert.rejects(
    () => malformedFinalizer.handle(event),
    { code: 'internal/error', permanent: false },
  );
  await assert.rejects(
    () => malformedProcessor.handle(event),
    { code: 'internal/error', permanent: false },
  );
});
