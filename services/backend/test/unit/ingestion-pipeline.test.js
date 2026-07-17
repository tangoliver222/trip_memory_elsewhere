import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorageFinalizedPipeline } from '../../src/ingestion/pipeline.js';
import { createOriginalFinalizer } from '../../src/ingestion/service.js';
import { IngestionError } from '../../src/ingestion/errors.js';
import { retryableProcessingError } from '../../src/processing/errors.js';
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

const storageFacts = Object.freeze({
  generation: event.generation,
  contentType: 'image/jpeg',
  sizeBytes: 2_841_930,
  crc32c: 'ImIEBA==',
  md5Hash: null,
});

function createPipeline(
  finalizerOutcome,
  processorOutcome = 'succeeded',
  calls = [],
  routingOutcome = 'approved',
) {
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
    authoritativeRouter: {
      async handle(received) {
        calls.push(['router', received]);
        return { outcome: routingOutcome };
      },
    },
    capabilityScheduler: {
      async handle(received) {
        calls.push(['scheduler', received]);
        return { outcome: 'queued' };
      },
    },
  });
}

test('applied original continues into deterministic processing with server-derived identity', async () => {
  const calls = [];
  const result = await createPipeline('applied', 'succeeded', calls).handle(event);

  assert.deepEqual(result, { outcome: 'approved' });
  assert.deepEqual(calls, [
    ['finalizer', event],
    ['processor', processorEvent],
    ['router', processorEvent],
    ['scheduler', { uid: event.uid, batchId: event.batchId }],
  ]);
});

test('same-generation successful duplicate still ensures deterministic processing', async () => {
  const calls = [];
  const result = await createPipeline(
    'duplicate',
    'terminal_noop',
    calls,
    'terminal_noop',
  ).handle(event);

  assert.deepEqual(result, { outcome: 'terminal_noop' });
  assert.deepEqual(calls, [
    ['finalizer', event],
    ['processor', processorEvent],
    ['router', processorEvent],
    ['scheduler', { uid: event.uid, batchId: event.batchId }],
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

test('a concurrent rejection wins over a successful inspection without creating processing work', async () => {
  const repository = createMemoryRepository();
  await repository.createImportBatch(event.uid, makePendingBatch());
  let releaseInspection;
  let markInspectionStarted;
  const inspectionStarted = new Promise((resolve) => { markInspectionStarted = resolve; });
  const inspectionReleased = new Promise((resolve) => { releaseInspection = resolve; });
  const processorCalls = [];
  const deterministicProcessor = {
    async handle(received) {
      processorCalls.push(received);
      return { outcome: 'succeeded' };
    },
  };
  const clock = () => '2026-07-16T06:10:00.000Z';
  const successfulFinalizer = createOriginalFinalizer({
    repository,
    clock,
    objectInspector: {
      async inspectOriginal() {
        markInspectionStarted();
        await inspectionReleased;
        return { detectedFormat: 'jpeg', storageFacts };
      },
    },
  });
  const rejectingFinalizer = createOriginalFinalizer({
    repository,
    clock,
    objectInspector: {
      async inspectOriginal() {
        throw new IngestionError('ingestion/invalid-original', { permanent: true });
      },
    },
  });
  const successfulPipeline = createStorageFinalizedPipeline({
    originalFinalizer: successfulFinalizer,
    deterministicProcessor,
    authoritativeRouter: {
      async handle(received) {
        processorCalls.push(['router', received]);
        return { outcome: 'approved' };
      },
    },
    capabilityScheduler: {
      async handle() { throw new Error('scheduler must not run'); },
    },
  });
  const rejectingPipeline = createStorageFinalizedPipeline({
    originalFinalizer: rejectingFinalizer,
    deterministicProcessor,
    authoritativeRouter: {
      async handle(received) {
        processorCalls.push(['router', received]);
        return { outcome: 'approved' };
      },
    },
    capabilityScheduler: {
      async handle() { throw new Error('scheduler must not run'); },
    },
  });

  const inspected = successfulPipeline.handle(event);
  await inspectionStarted;
  assert.deepEqual(await rejectingPipeline.handle(event), { outcome: 'rejected' });
  releaseInspection();
  assert.deepEqual(await inspected, { outcome: 'rejected' });
  assert.deepEqual(processorCalls, []);
});

test('invalid internal events stop before finalization or processing', async () => {
  const calls = [];
  const pipeline = createPipeline('applied', 'succeeded', calls);
  const malformed = [
    { ...event, uid: 'bad' },
    { ...event, batchId: 'bad' },
    { ...event, fragmentId: 'bad' },
    { ...event, bucket: ' demo-elsewhere.appspot.com' },
    { ...event, generation: '' },
    { ...event, objectName: event.objectName.replace('user_alpha', 'user_other') },
    { ...event, taskId: 'task_forged' },
    { ...event, inputHash: 'a'.repeat(64) },
    { ...event, sourceRevision: processorEvent.sourceRevision },
  ];

  for (const candidate of malformed) {
    await assert.rejects(
      () => pipeline.handle(candidate),
      { code: 'internal/error', permanent: false },
    );
  }
  assert.deepEqual(calls, []);
});

test('retryable processing propagates instead of acknowledging the event', async () => {
  const expected = retryableProcessingError('processing/soft-timeout');
  const pipeline = createStorageFinalizedPipeline({
    originalFinalizer: { async handle() { return { outcome: 'applied' }; } },
    deterministicProcessor: { async handle() { throw expected; } },
    authoritativeRouter: {
      async handle() { throw new Error('router must not run'); },
    },
    capabilityScheduler: {
      async handle() { throw new Error('scheduler must not run'); },
    },
  });

  await assert.rejects(() => pipeline.handle(event), (error) => error === expected);
});

test('malformed finalizer and processor outcomes cannot be acknowledged', async () => {
  const malformedFinalizer = createStorageFinalizedPipeline({
    originalFinalizer: { async handle() { return { outcome: 'applied', forged: true }; } },
    deterministicProcessor: { async handle() { return { outcome: 'succeeded' }; } },
    authoritativeRouter: { async handle() { return { outcome: 'approved' }; } },
    capabilityScheduler: { async handle() { return { outcome: 'queued' }; } },
  });
  const malformedProcessor = createStorageFinalizedPipeline({
    originalFinalizer: { async handle() { return { outcome: 'applied' }; } },
    deterministicProcessor: { async handle() { return { outcome: 'busy' }; } },
    authoritativeRouter: { async handle() { return { outcome: 'approved' }; } },
    capabilityScheduler: { async handle() { return { outcome: 'queued' }; } },
  });
  const malformedRouter = createStorageFinalizedPipeline({
    originalFinalizer: { async handle() { return { outcome: 'applied' }; } },
    deterministicProcessor: { async handle() { return { outcome: 'succeeded' }; } },
    authoritativeRouter: { async handle() { return { outcome: 'suggested' }; } },
    capabilityScheduler: { async handle() { return { outcome: 'queued' }; } },
  });

  await assert.rejects(
    () => malformedFinalizer.handle(event),
    { code: 'internal/error', permanent: false },
  );
  await assert.rejects(
    () => malformedProcessor.handle(event),
    { code: 'internal/error', permanent: false },
  );
  await assert.rejects(
    () => malformedRouter.handle(event),
    { code: 'internal/error', permanent: false },
  );
});

test('every deterministic terminal outcome routes exactly once before acknowledgement', async () => {
  for (const processorOutcome of ['succeeded', 'failed_terminal', 'terminal_noop']) {
    const calls = [];
    const result = await createPipeline(
      'duplicate',
      processorOutcome,
      calls,
      processorOutcome === 'terminal_noop' ? 'terminal_noop' : 'completed',
    ).handle(event);

    assert.deepEqual(result, {
      outcome: processorOutcome === 'terminal_noop' ? 'terminal_noop' : 'completed',
    });
    assert.deepEqual(calls, [
      ['finalizer', event],
      ['processor', processorEvent],
      ['router', processorEvent],
      ['scheduler', { uid: event.uid, batchId: event.batchId }],
    ]);
  }
});

test('routing failure propagates and is never converted into an acknowledgement', async () => {
  const expected = Object.assign(new Error('private database details'), {
    code: 'routing/repository-unavailable',
    retryable: true,
  });
  const pipeline = createStorageFinalizedPipeline({
    originalFinalizer: { async handle() { return { outcome: 'applied' }; } },
    deterministicProcessor: { async handle() { return { outcome: 'succeeded' }; } },
    authoritativeRouter: { async handle() { throw expected; } },
    capabilityScheduler: {
      async handle() { throw new Error('scheduler must not run'); },
    },
  });

  await assert.rejects(() => pipeline.handle(event), (error) => error === expected);
});

test('router no-op still scans persisted current approved OCR plans', async () => {
  const calls = [];
  const pipeline = createStorageFinalizedPipeline({
    originalFinalizer: { async handle() { return { outcome: 'duplicate' }; } },
    deterministicProcessor: { async handle() { return { outcome: 'terminal_noop' }; } },
    authoritativeRouter: { async handle() { return { outcome: 'terminal_noop' }; } },
    capabilityScheduler: {
      async handle(input) {
        calls.push(input);
        return { outcome: 'queued' };
      },
    },
  });

  assert.deepEqual(await pipeline.handle(event), { outcome: 'terminal_noop' });
  assert.deepEqual(calls, [{ uid: event.uid, batchId: event.batchId }]);
});
