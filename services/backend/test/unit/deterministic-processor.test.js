import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { createFirebaseDerivativeStore } from '../../src/adapters/firebase-derivative-store.js';
import { createDeterministicProcessor } from '../../src/processing/service.js';
import { retryableProcessingError, terminalProcessingError } from '../../src/processing/errors.js';
import { makeDerivativePath, makeProcessingTaskId } from '../../src/processing/identity.js';
import { makeUploadedFragment } from '../fixtures/import.js';

const OWNER_ID = 'user_alpha';
const FRAGMENT_ID = 'frag_12345678';
const BATCH_ID = 'batch_12345678';
const SECRET_OBJECT_PATH = `users/${OWNER_ID}/originals/${BATCH_ID}/${FRAGMENT_ID}`;
const SECRET_LOCAL_PATH = '/tmp/private-secret-filename.jpg';
const SECRET_EXIF = 'private-secret-exif-value';
const SECRET_PROVIDER_ERROR = 'private-secret-provider-error';
const HASH = 'a'.repeat(64);
const OTHER_HASH = 'b'.repeat(64);
const PERCEPTUAL_HASH = '0000000000000000';
const PERCEPTUAL_BANDS = Object.freeze(
  Array.from({ length: 8 }, (_, index) => `${index}:00`),
);
const CLAIMED_AT = '2026-07-16T00:01:00.000Z';
const PROCESSING_CONFIG = Object.freeze({
  timeouts: Object.freeze({
    softMs: 180_000,
    leaseMs: 240_000,
    requestMs: 300_000,
    cleanupMarginMs: 30_000,
  }),
  limits: Object.freeze({
    maxInputBytes: 52_428_800,
    maxInputPixels: 60_000_000,
    maxImageWidth: 20_000,
    maxImageHeight: 20_000,
    maxPageCount: 100,
    maxMetadataDecompressedBytes: 16_777_216,
  }),
});

const EVENT = Object.freeze({
  uid: OWNER_ID,
  fragmentId: FRAGMENT_ID,
  batchId: BATCH_ID,
  sourceRevision: Object.freeze({
    bucket: 'demo-elsewhere.appspot.com',
    objectName: SECRET_OBJECT_PATH,
    generation: '1740000000000001',
  }),
});

const STORAGE = Object.freeze({
  bucket: EVENT.sourceRevision.bucket,
  originalPath: EVENT.sourceRevision.objectName,
  generation: EVENT.sourceRevision.generation,
  contentType: 'image/jpeg',
  sizeBytes: 2_841_930,
  crc32c: 'ImIEBA==',
  md5Hash: null,
});

const JPEG_METADATA = Object.freeze({
  format: 'jpeg',
  width: 4032,
  height: 3024,
  orientation: 1,
  pageCount: null,
  cameraMake: 'Elsewhere',
  cameraModel: null,
  lensModel: null,
  focalLengthMm: null,
  apertureFNumber: null,
  isoEquivalent: null,
  exposureTimeSeconds: null,
  metadataStatus: 'complete',
  warningCodes: Object.freeze([]),
  processorVersion: 'v1',
});

const PDF_METADATA = Object.freeze({
  format: 'pdf',
  width: null,
  height: null,
  orientation: null,
  pageCount: null,
  cameraMake: null,
  cameraModel: null,
  lensModel: null,
  focalLengthMm: null,
  apertureFNumber: null,
  isoEquivalent: null,
  exposureTimeSeconds: null,
  metadataStatus: 'partial',
  warningCodes: Object.freeze(['processing/page-count-unsupported']),
  processorVersion: 'v1',
});

function taskIdFor(event = EVENT) {
  return makeProcessingTaskId({
    ownerId: event.uid,
    fragmentId: event.fragmentId,
    processorName: 'deterministic-media',
    processorVersion: 'v1',
    ...event.sourceRevision,
  });
}

function defaultMetadataResult() {
  return Object.freeze({
    technicalMetadata: JPEG_METADATA,
    factHints: Object.freeze({
      capturedAt: Object.freeze({
        localDateTime: '2024-10-12T08:42:00',
        offsetMinutes: null,
        zoneId: null,
        instant: null,
        sourceType: 'exif',
        status: 'unresolved',
      }),
      geo: Object.freeze({
        lat: 13.7563,
        lng: 100.5018,
        sourceType: 'gps',
        status: 'suggested',
      }),
    }),
    metadataStatus: 'complete',
    warningCodes: Object.freeze([]),
  });
}

function defaultImageResult() {
  return Object.freeze({
    thumbnail: Object.freeze({
      buffer: Buffer.from('safe-thumbnail'),
      width: 512,
      height: 384,
      contentType: 'image/webp',
    }),
    perceptualHash: Object.freeze({
      value: PERCEPTUAL_HASH,
      bands: PERCEPTUAL_BANDS,
    }),
    warnings: Object.freeze([]),
  });
}

function unsupportedImageResult() {
  return Object.freeze({
    thumbnail: null,
    perceptualHash: null,
    warnings: Object.freeze([]),
  });
}

function derivativeFacts() {
  return Object.freeze({
    path: `users/${OWNER_ID}/derived/${FRAGMENT_ID}/deterministic-media/v1/${HASH}/thumbnail.webp`,
    generation: '1740000000000100',
    metageneration: '1',
    contentType: 'image/webp',
    sizeBytes: 48_291,
    crc32c: 'Y3JjIQ==',
    width: 512,
    height: 384,
  });
}

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

function createDerivativeStorageFake() {
  const calls = { writes: [] };
  const thumbnail = defaultImageResult().thumbnail;
  const path = makeDerivativePath({
    ownerId: OWNER_ID,
    fragmentId: FRAGMENT_ID,
    processorName: 'deterministic-media',
    processorVersion: 'v1',
    inputHash: HASH,
  });
  const file = {
    createWriteStream(options) {
      const record = { chunks: [], options };
      calls.writes.push(record);
      return new Writable({
        write(chunk, _encoding, callback) {
          record.chunks.push(Buffer.from(chunk));
          callback();
        },
      });
    },
    async getMetadata() {
      return [{
        bucket: STORAGE.bucket,
        name: path,
        generation: '1740000000000100',
        metageneration: '1',
        contentType: 'image/webp',
        size: String(thumbnail.buffer.byteLength),
        crc32c: crc32cBase64(thumbnail.buffer),
        metadata: {
          ownerId: OWNER_ID,
          fragmentId: FRAGMENT_ID,
          processorName: 'deterministic-media',
          processorVersion: 'v1',
          inputHash: HASH,
          width: String(thumbnail.width),
          height: String(thumbnail.height),
        },
      }];
    },
  };
  return {
    storage: {
      bucket() {
        return { file: () => file };
      },
    },
    calls,
  };
}

function cappedNearInputs() {
  return Array.from({ length: 201 }, (_, index) => ({
    fragmentId: `frag_match${String(index).padStart(4, '0')}`,
    perceptualHash: index === 0 ? '0000000000000001' : 'ffffffffffffffff',
  }));
}

function claimedFragment(overrides = {}) {
  const deterministic = Object.freeze({
    taskId: taskIdFor(),
    processorName: 'deterministic-media',
    processorVersion: 'v1',
    state: 'running',
    metadataStatus: null,
    thumbnailStatus: null,
    perceptualHashStatus: null,
    updatedAt: CLAIMED_AT,
  });
  return Object.freeze(makeUploadedFragment({
    id: FRAGMENT_ID,
    ownerId: OWNER_ID,
    batchId: BATCH_ID,
    updatedAt: CLAIMED_AT,
    status: 'processing',
    storage: STORAGE,
    processing: { deterministic },
    ...overrides,
  }));
}

function claimedTask(claim, inputHash = null, overrides = {}) {
  return Object.freeze({
    id: claim.taskId,
    ownerId: OWNER_ID,
    schemaVersion: 1,
    createdAt: claim.claimedAt,
    updatedAt: claim.claimedAt,
    deletedAt: null,
    fragmentId: FRAGMENT_ID,
    batchId: BATCH_ID,
    processorName: 'deterministic-media',
    processorVersion: 'v1',
    sourceRevision: EVENT.sourceRevision,
    inputHash,
    state: 'running',
    currentStep: inputHash === null ? 'hashing' : 'hash_registered',
    leaseOwner: claim.leaseOwner,
    attemptCount: 1,
    outputs: {
      metadataStatus: null,
      thumbnailStatus: null,
      perceptualHashStatus: null,
      warningCodes: [],
    },
    lastErrorCode: null,
    firstStartedAt: claim.claimedAt,
    attemptStartedAt: claim.claimedAt,
    lastHeartbeatAt: claim.claimedAt,
    softDeadlineAt: claim.softDeadlineAt,
    leaseAcquiredAt: claim.claimedAt,
    leaseExpiresAt: claim.leaseExpiresAt,
    completedAt: null,
    ...overrides,
  });
}

function terminalTask(claim, state = 'succeeded') {
  return claimedTask(claim, HASH, {
    state,
    currentStep: 'complete',
    leaseOwner: null,
    outputs: {
      metadataStatus: state === 'succeeded' ? 'complete' : 'failed',
      thumbnailStatus: state === 'succeeded' ? 'complete' : 'failed',
      perceptualHashStatus: state === 'succeeded' ? 'complete' : 'failed',
      warningCodes: [],
    },
    lastErrorCode: state === 'failed_terminal' ? 'processing/invalid-media' : null,
    leaseAcquiredAt: null,
    leaseExpiresAt: null,
    completedAt: claim.claimedAt,
  });
}

function repositoryError(code) {
  return Object.assign(new Error(`${SECRET_PROVIDER_ERROR}:${code}`), { code });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function waitForCall(calls, name) {
  for (let attempt = 0; attempt < 40 && calls[name].length === 0; attempt += 1) {
    await Promise.resolve();
  }
  assert.equal(calls[name].length, 1);
}

async function readSettlement(operation) {
  let settlement = null;
  void operation.then(
    (value) => {
      settlement = { status: 'fulfilled', value };
    },
    (error) => {
      settlement = { status: 'rejected', error };
    },
  );
  for (let attempt = 0; attempt < 40 && settlement === null; attempt += 1) {
    await Promise.resolve();
  }
  return settlement;
}

function assertStableError(error, code, retryable) {
  assert.equal(error?.name, 'ProcessingError');
  assert.equal(error?.code, code);
  assert.equal(error?.retryable, retryable);
  assert.deepEqual(Object.keys(error).sort(), ['code', 'retryable']);
  for (const secret of [
    SECRET_OBJECT_PATH,
    SECRET_LOCAL_PATH,
    SECRET_EXIF,
    SECRET_PROVIDER_ERROR,
  ]) {
    assert.equal(JSON.stringify({
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      stack: error.stack,
    }).includes(secret), false);
  }
  return true;
}

function createHarness(options = {}) {
  const calls = {
    order: [],
    claim: [],
    materialize: [],
    register: [],
    metadata: [],
    image: [],
    derivative: [],
    near: [],
    complete: [],
    fail: [],
    cleanup: 0,
  };
  let materialSignal;

  const repository = {
    async claimProcessingTask(uid, input) {
      calls.order.push('claim');
      calls.claim.push({ uid, input });
      if (options.claimError) throw options.claimError;
      if (options.claimDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.claimDelayMs));
      }
      options.claimHook?.(input);
      if (options.claimResult) return options.claimResult(input);
      const outcome = options.claimOutcome ?? 'claimed';
      if (outcome === 'busy' || outcome === 'terminal') {
        return Object.freeze({
          outcome,
          task: outcome === 'terminal'
            ? terminalTask(input, options.terminalState ?? 'succeeded')
            : claimedTask(input, options.taskInputHash ?? null),
        });
      }
      return Object.freeze({
        outcome: 'claimed',
        task: claimedTask(
          input,
          options.taskInputHash ?? null,
          options.taskOverrides,
        ),
        fragment: claimedFragment(options.fragmentOverrides),
      });
    },
    async heartbeatProcessingTask() {
      throw new Error('Task 11 must not add an unplanned heartbeat');
    },
    async registerContentHash(uid, input) {
      calls.order.push('register');
      calls.register.push({ uid, input });
      if (options.registerError) throw options.registerError;
      return Object.freeze({
        canonicalFragmentRef: Object.freeze({ type: 'fragment', id: FRAGMENT_ID }),
        exactCandidate: null,
      });
    },
    async findNearDuplicateInputs(uid, input) {
      calls.order.push('near');
      calls.near.push({ uid, input });
      if (options.nearError) throw options.nearError;
      return options.nearInputs ?? cappedNearInputs();
    },
    async completeDeterministicProcessing(uid, input) {
      calls.order.push('complete');
      calls.complete.push({ uid, input });
      options.completeHook?.(input);
      if (options.completePromise) return options.completePromise;
      if (options.completeError) throw options.completeError;
      return Object.freeze({ outcome: options.completeOutcome ?? 'applied' });
    },
    async failDeterministicProcessing(uid, input) {
      calls.order.push('fail');
      calls.fail.push({ uid, input });
      if (options.failError) throw options.failError;
      return Object.freeze({ outcome: 'applied' });
    },
  };

  const materializer = {
    async materialize(input) {
      calls.order.push('materialize');
      calls.materialize.push(input);
      materialSignal = input.signal;
      options.materializeHook?.(input);
      if (options.materializeWaitForAbort) {
        await new Promise((resolve, reject) => {
          if (input.signal.aborted) {
            reject(retryableProcessingError('processing/soft-timeout'));
            return;
          }
          input.signal.addEventListener('abort', () => {
            reject(retryableProcessingError('processing/soft-timeout'));
          }, { once: true });
        });
      }
      if (options.materializeError) throw options.materializeError;
      if (options.materialResult) return options.materialResult;
      return Object.freeze({
        path: SECRET_LOCAL_PATH,
        sizeBytes: STORAGE.sizeBytes,
        inputHash: options.materialHash ?? HASH,
        cleanup: async () => {
          calls.order.push('cleanup');
          calls.cleanup += 1;
          if (options.cleanupError) throw options.cleanupError;
        },
      });
    },
  };

  const metadataReader = {
    async read(input) {
      calls.order.push('metadata');
      calls.metadata.push(input);
      options.metadataHook?.(input);
      if (options.metadataWaitForAbort) {
        await new Promise((resolve, reject) => {
          if (input.signal.aborted) {
            reject(retryableProcessingError('processing/soft-timeout'));
            return;
          }
          input.signal.addEventListener('abort', () => {
            reject(retryableProcessingError('processing/soft-timeout'));
          }, { once: true });
        });
      }
      if (options.metadataError) throw options.metadataError;
      return options.metadataResult ?? defaultMetadataResult();
    },
  };

  const imageProcessor = {
    async process(input) {
      calls.order.push('image');
      calls.image.push(input);
      options.imageHook?.(input);
      if (options.imageError) throw options.imageError;
      return options.imageResult ?? defaultImageResult();
    },
  };

  const fakeDerivativeStore = {
    async putThumbnail(input) {
      calls.order.push('derivative');
      calls.derivative.push(input);
      options.derivativeHook?.(input);
      if (options.derivativeError) throw options.derivativeError;
      return options.derivativeResult ?? derivativeFacts();
    },
  };

  const processor = createDeterministicProcessor({
    repository,
    materializer,
    metadataReader,
    imageProcessor,
    derivativeStore: options.derivativeStore ?? fakeDerivativeStore,
    processingConfig: options.processingConfig ?? PROCESSING_CONFIG,
    clock: options.clock ?? (() => CLAIMED_AT),
    randomUUID: options.randomUUID ?? (() => 'attempt0001'),
  });

  return { processor, calls, getMaterialSignal: () => materialSignal };
}

test('claims hashes checkpoints extracts derives searches and commits in order', async () => {
  const { processor, calls, getMaterialSignal } = createHarness();

  const result = await processor.handle(EVENT);

  assert.deepEqual(result, { outcome: 'succeeded' });
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(calls.order, [
    'claim',
    'materialize',
    'register',
    'metadata',
    'image',
    'derivative',
    'near',
    'complete',
    'cleanup',
  ]);

  const claim = calls.claim[0];
  assert.equal(claim.uid, OWNER_ID);
  assert.deepEqual(claim.input, {
    taskId: taskIdFor(),
    fragmentId: FRAGMENT_ID,
    batchId: BATCH_ID,
    processorName: 'deterministic-media',
    processorVersion: 'v1',
    sourceRevision: EVENT.sourceRevision,
    leaseOwner: 'exec_attempt0001',
    claimedAt: CLAIMED_AT,
    softDeadlineAt: '2026-07-16T00:04:00.000Z',
    leaseExpiresAt: '2026-07-16T00:05:00.000Z',
  });

  assert.deepEqual(calls.materialize[0], {
    sourceRevision: EVENT.sourceRevision,
    expectedStorageFacts: STORAGE,
    maxBytes: PROCESSING_CONFIG.limits.maxInputBytes,
    signal: calls.materialize[0].signal,
    deadlineAt: claim.input.softDeadlineAt,
  });
  assert.deepEqual(calls.register[0], {
    uid: OWNER_ID,
    input: {
      taskId: taskIdFor(),
      leaseOwner: claim.input.leaseOwner,
      registeredAt: CLAIMED_AT,
      sha256: HASH,
    },
  });
  assert.deepEqual(calls.metadata[0], {
    path: SECRET_LOCAL_PATH,
    sourceType: 'photo',
    contentType: STORAGE.contentType,
    signal: calls.materialize[0].signal,
    deadlineAt: claim.input.softDeadlineAt,
  });
  assert.deepEqual(calls.image[0], {
    path: SECRET_LOCAL_PATH,
    contentType: STORAGE.contentType,
    signal: calls.materialize[0].signal,
    deadlineAt: claim.input.softDeadlineAt,
  });
  assert.equal(calls.materialize[0].signal, calls.metadata[0].signal);
  assert.equal(calls.materialize[0].signal, calls.image[0].signal);
  assert.equal(calls.materialize[0].deadlineAt, calls.metadata[0].deadlineAt);
  assert.equal(calls.materialize[0].deadlineAt, calls.image[0].deadlineAt);
  assert.equal(getMaterialSignal().aborted, true);

  assert.deepEqual(calls.derivative[0], {
    bucket: STORAGE.bucket,
    ownerId: OWNER_ID,
    fragmentId: FRAGMENT_ID,
    inputHash: HASH,
    thumbnail: {
      buffer: defaultImageResult().thumbnail.buffer,
      width: defaultImageResult().thumbnail.width,
      height: defaultImageResult().thumbnail.height,
    },
    signal: calls.materialize[0].signal,
    deadlineAt: claim.input.softDeadlineAt,
  });
  assert.deepEqual(calls.near[0], {
    uid: OWNER_ID,
    input: { fragmentId: FRAGMENT_ID, bands: PERCEPTUAL_BANDS },
  });

  const completion = calls.complete[0];
  assert.equal(completion.uid, OWNER_ID);
  assert.deepEqual(completion.input, {
    taskId: taskIdFor(),
    leaseOwner: claim.input.leaseOwner,
    completedAt: CLAIMED_AT,
    technicalMetadata: JPEG_METADATA,
    factSuggestions: {
      capturedAt: {
        value: {
          localDateTime: '2024-10-12T08:42:00',
          offsetMinutes: null,
          zoneId: null,
          instant: null,
        },
        sourceType: 'exif',
        sourceRefs: [{ type: 'fragment', id: FRAGMENT_ID }],
        processor: {
          name: 'deterministic-media',
          version: 'v1',
          modelAlias: null,
          promptVersion: null,
        },
        confidence: 1,
        status: 'suggested',
        observedAt: CLAIMED_AT,
      },
      geo: {
        value: { lat: 13.7563, lng: 100.5018 },
        sourceType: 'gps',
        sourceRefs: [{ type: 'fragment', id: FRAGMENT_ID }],
        processor: {
          name: 'deterministic-media',
          version: 'v1',
          modelAlias: null,
          promptVersion: null,
        },
        confidence: 1,
        status: 'suggested',
        observedAt: CLAIMED_AT,
      },
    },
    derivative: derivativeFacts(),
    perceptualHash: defaultImageResult().perceptualHash,
    capabilityStatuses: {
      metadata: 'complete',
      thumbnail: 'complete',
      perceptualHash: 'complete',
    },
    warningCodes: ['processing/near-scan-truncated'],
    nearMatches: [{ fragmentId: 'frag_match0000', distance: 1, rank: 1 }],
    errorCode: null,
  });
  assert.equal(JSON.stringify({ result, completion: completion.input }).includes(SECRET_EXIF), false);
});

test('projects the Task 9 thumbnail contract through the real derivative adapter', async () => {
  const { storage, calls: storageCalls } = createDerivativeStorageFake();
  const derivativeStore = createFirebaseDerivativeStore({
    storage,
    allowedBuckets: [STORAGE.bucket],
  });
  const { processor, calls } = createHarness({
    derivativeStore,
    clock: () => new Date().toISOString(),
  });

  assert.deepEqual(await processor.handle(EVENT), { outcome: 'succeeded' });
  assert.equal(storageCalls.writes.length, 1);
  assert.deepEqual(
    Buffer.concat(storageCalls.writes[0].chunks),
    defaultImageResult().thumbnail.buffer,
  );
  assert.equal(calls.complete[0].input.derivative.path, derivativeFacts().path);
  assert.deepEqual(calls.order, [
    'claim', 'materialize', 'register', 'metadata', 'image',
    'near', 'complete', 'cleanup',
  ]);
});

test('event contract excludes user-controlled task execution and hash identities', async () => {
  for (const extra of [
    { taskId: 'task_attacker1' },
    { executionId: 'exec_attacker1' },
    { inputHash: OTHER_HASH },
  ]) {
    const { processor, calls } = createHarness();
    await assert.rejects(
      () => processor.handle({ ...EVENT, ...extra }),
      (error) => assertStableError(error, 'processing/invalid-media', false),
    );
    assert.deepEqual(calls.order, []);
  }
});

test('claim outcomes require complete matching task and fragment documents', async (t) => {
  const fixtures = [
    ['partial terminal task', (input) => ({
      outcome: 'terminal',
      task: { id: input.taskId, state: 'succeeded' },
    })],
    ['contradictory succeeded task', (input) => ({
      outcome: 'terminal',
      task: { ...terminalTask(input, 'succeeded'), inputHash: null },
    })],
    ['contradictory terminal failure task', (input) => ({
      outcome: 'terminal',
      task: {
        ...terminalTask(input, 'failed_terminal'),
        outputs: {
          metadataStatus: 'complete',
          thumbnailStatus: 'complete',
          perceptualHashStatus: 'unsupported',
          warningCodes: [],
        },
      },
    })],
    ['mismatched busy task', (input) => ({
      outcome: 'busy',
      task: claimedTask(input, null, { ownerId: 'user_beta' }),
    })],
    ['mismatched claimed task source', (input) => ({
      outcome: 'claimed',
      task: claimedTask(input, null, {
        sourceRevision: { ...EVENT.sourceRevision, generation: 'different' },
      }),
      fragment: claimedFragment(),
    })],
    ['partial claimed fragment', (input) => ({
      outcome: 'claimed',
      task: claimedTask(input),
      fragment: { id: FRAGMENT_ID, ownerId: OWNER_ID, storage: STORAGE },
    })],
    ['mismatched claimed fragment link', (input) => ({
      outcome: 'claimed',
      task: claimedTask(input),
      fragment: claimedFragment({
        processing: {
          deterministic: {
            ...claimedFragment().processing.deterministic,
            taskId: 'task_mismatched1',
          },
        },
      }),
    })],
  ];

  for (const [name, claimResult] of fixtures) {
    await t.test(name, async () => {
      const { processor, calls } = createHarness({ claimResult });
      await assert.rejects(
        () => processor.handle(EVENT),
        (error) => assertStableError(error, 'processing/repository-unavailable', true),
      );
      assert.deepEqual(calls.order, ['claim']);
      assert.equal(calls.complete.length, 0);
      assert.equal(calls.fail.length, 0);
    });
  }
});

test('same terminal task is a no-op with no Storage or decoder call', async () => {
  for (const terminalState of ['succeeded', 'failed_terminal']) {
    const { processor, calls } = createHarness({
      claimOutcome: 'terminal',
      terminalState,
    });

    const result = await processor.handle(EVENT);

    assert.deepEqual(result, { outcome: 'terminal_noop' });
    assert.equal(Object.isFrozen(result), true);
    assert.deepEqual(calls.order, ['claim']);
  }
});

test('active lease returns task-busy without reading the original', async () => {
  const { processor, calls } = createHarness({ claimOutcome: 'busy' });

  await assert.rejects(
    () => processor.handle(EVENT),
    (error) => assertStableError(error, 'processing/task-busy', true),
  );
  assert.deepEqual(calls.order, ['claim']);
  assert.equal(calls.fail.length, 0);
});

test('repository ownership and target errors at claim are stable terminal invalid media', async (t) => {
  for (const code of [
    'repository/owner-mismatch',
    'repository/processing-target-mismatch',
  ]) {
    await t.test(code, async () => {
      const { processor, calls } = createHarness({ claimError: repositoryError(code) });
      await assert.rejects(
        () => processor.handle(EVENT),
        (error) => assertStableError(error, 'processing/invalid-media', false),
      );
      assert.deepEqual(calls.order, ['claim']);
      assert.equal(calls.complete.length, 0);
      assert.equal(calls.fail.length, 0);
    });
  }
});

test('repository lease loss after claim is task-busy and is never overwritten', async () => {
  const { processor, calls } = createHarness({
    registerError: repositoryError('repository/lease-owner-mismatch'),
  });

  await assert.rejects(
    () => processor.handle(EVENT),
    (error) => assertStableError(error, 'processing/task-busy', true),
  );
  assert.deepEqual(calls.order, ['claim', 'materialize', 'register', 'cleanup']);
  assert.equal(calls.complete.length, 0);
  assert.equal(calls.fail.length, 0);
});

test('repository ownership and target errors after claim persist terminal invalid media', async (t) => {
  for (const code of [
    'repository/owner-mismatch',
    'repository/processing-target-mismatch',
  ]) {
    await t.test(code, async () => {
      const { processor, calls } = createHarness({ registerError: repositoryError(code) });
      assert.deepEqual(await processor.handle(EVENT), { outcome: 'failed_terminal' });
      assert.deepEqual(calls.order, [
        'claim', 'materialize', 'register', 'complete', 'cleanup',
      ]);
      assert.equal(calls.complete[0].input.errorCode, 'processing/invalid-media');
      assert.equal(calls.fail.length, 0);
    });
  }
});

test('stale lease resumes from hash checkpoint without changing task identity', async () => {
  const { processor, calls } = createHarness({ taskInputHash: HASH });

  assert.deepEqual(await processor.handle(EVENT), { outcome: 'succeeded' });

  assert.deepEqual(calls.order, [
    'claim',
    'materialize',
    'metadata',
    'image',
    'derivative',
    'near',
    'complete',
    'cleanup',
  ]);
  assert.equal(calls.register.length, 0);
  assert.equal(calls.claim[0].input.taskId, taskIdFor());
  assert.equal(calls.complete[0].input.taskId, taskIdFor());
  assert.equal(calls.derivative[0].inputHash, HASH);
});

test('a stale hash checkpoint mismatch is persisted terminal invalid media', async () => {
  const { processor, calls } = createHarness({
    taskInputHash: HASH,
    materialHash: OTHER_HASH,
  });

  const result = await processor.handle(EVENT);

  assert.deepEqual(result, { outcome: 'failed_terminal' });
  assert.deepEqual(calls.order, ['claim', 'materialize', 'complete', 'cleanup']);
  assert.equal(calls.register.length, 0);
  assert.equal(calls.metadata.length, 0);
  assert.deepEqual(calls.complete[0].input, {
    taskId: taskIdFor(),
    leaseOwner: calls.claim[0].input.leaseOwner,
    completedAt: CLAIMED_AT,
    technicalMetadata: null,
    factSuggestions: {},
    derivative: null,
    perceptualHash: null,
    capabilityStatuses: {
      metadata: 'failed',
      thumbnail: 'failed',
      perceptualHash: 'failed',
    },
    warningCodes: [],
    nearMatches: [],
    errorCode: 'processing/invalid-media',
  });
});

test('PDF succeeds with unsupported derivative and page-count warning', async () => {
  const { processor, calls } = createHarness({
    fragmentOverrides: {
      type: 'receipt',
      storage: { ...STORAGE, contentType: 'application/pdf' },
    },
    metadataResult: Object.freeze({
      technicalMetadata: PDF_METADATA,
      factHints: Object.freeze({ capturedAt: null, geo: null }),
      metadataStatus: 'partial',
      warningCodes: Object.freeze(['processing/page-count-unsupported']),
    }),
    imageResult: unsupportedImageResult(),
  });

  assert.deepEqual(await processor.handle(EVENT), { outcome: 'succeeded' });

  assert.deepEqual(calls.order, [
    'claim', 'materialize', 'register', 'metadata', 'image', 'complete', 'cleanup',
  ]);
  assert.equal(calls.derivative.length, 0);
  assert.equal(calls.near.length, 0);
  assert.equal(calls.complete[0].input.technicalMetadata.pageCount, null);
  assert.deepEqual(calls.complete[0].input.capabilityStatuses, {
    metadata: 'partial',
    thumbnail: 'unsupported',
    perceptualHash: 'unsupported',
  });
  assert.deepEqual(calls.complete[0].input.warningCodes, [
    'processing/page-count-unsupported',
  ]);
});

test('unsupported HEIC decode succeeds without thumbnail or dHash', async () => {
  const heicMetadata = Object.freeze({
    ...PDF_METADATA,
    format: 'heic',
    metadataStatus: 'unsupported',
    warningCodes: Object.freeze([]),
  });
  const { processor, calls } = createHarness({
    fragmentOverrides: {
      storage: { ...STORAGE, contentType: 'image/heic' },
    },
    metadataResult: Object.freeze({
      technicalMetadata: heicMetadata,
      factHints: Object.freeze({ capturedAt: null, geo: null }),
      metadataStatus: 'unsupported',
      warningCodes: Object.freeze([]),
    }),
    imageResult: unsupportedImageResult(),
  });

  assert.deepEqual(await processor.handle(EVENT), { outcome: 'succeeded' });

  assert.equal(calls.derivative.length, 0);
  assert.equal(calls.near.length, 0);
  assert.equal(calls.complete[0].input.derivative, null);
  assert.equal(calls.complete[0].input.perceptualHash, null);
  assert.deepEqual(calls.complete[0].input.capabilityStatuses, {
    metadata: 'unsupported',
    thumbnail: 'unsupported',
    perceptualHash: 'unsupported',
  });
});

test('malformed adapter results are terminal invalid media and never success', async (t) => {
  const metadata = defaultMetadataResult();
  const imageResult = defaultImageResult();
  const derivative = derivativeFacts();
  const fixtures = [
    ['metadata result extra field', {
      metadataResult: { ...metadata, raw: SECRET_EXIF },
    }],
    ['technical metadata extra field', {
      metadataResult: {
        ...metadata,
        technicalMetadata: { ...metadata.technicalMetadata, raw: SECRET_EXIF },
      },
    }],
    ['metadata status mismatch', {
      metadataResult: { ...metadata, metadataStatus: 'partial' },
    }],
    ['fact hint extra field', {
      metadataResult: {
        ...metadata,
        factHints: {
          ...metadata.factHints,
          capturedAt: { ...metadata.factHints.capturedAt, raw: SECRET_EXIF },
        },
      },
    }],
    ['image result extra field', {
      imageResult: { ...imageResult, debug: SECRET_EXIF },
    }],
    ['thumbnail extra field', {
      imageResult: {
        ...imageResult,
        thumbnail: { ...imageResult.thumbnail, debug: SECRET_EXIF },
      },
    }],
    ['thumbnail wrong content type', {
      imageResult: {
        ...imageResult,
        thumbnail: { ...imageResult.thumbnail, contentType: 'image/png' },
      },
    }],
    ['perceptual hash bands do not match value', {
      imageResult: {
        ...imageResult,
        perceptualHash: {
          ...imageResult.perceptualHash,
          bands: ['0:ff', ...PERCEPTUAL_BANDS.slice(1)],
        },
      },
    }],
    ['derivative result extra field', {
      derivativeResult: { ...derivative, debug: SECRET_EXIF },
    }],
    ['derivative identity mismatch', {
      derivativeResult: { ...derivative, path: derivative.path.replace(HASH, OTHER_HASH) },
    }],
    ['derivative dimensions mismatch', {
      derivativeResult: { ...derivative, width: derivative.width - 1 },
    }],
  ];

  for (const [name, options] of fixtures) {
    await t.test(name, async () => {
      const { processor, calls } = createHarness(options);
      assert.deepEqual(await processor.handle(EVENT), { outcome: 'failed_terminal' });
      assert.equal(calls.complete.length, 1);
      assert.equal(calls.complete[0].input.errorCode, 'processing/invalid-media');
      assert.equal(calls.fail.length, 0);
      assert.equal(JSON.stringify(calls.complete[0].input).includes(SECRET_EXIF), false);
    });
  }
});

test('media limit and derivative conflict persist terminal failure before return', async (t) => {
  const cases = [
    {
      name: 'metadata limit',
      options: {
        metadataError: terminalProcessingError('processing/media-limits-exceeded'),
      },
      code: 'processing/media-limits-exceeded',
      expectedOrder: ['claim', 'materialize', 'register', 'metadata', 'complete', 'cleanup'],
      statuses: { metadata: 'failed', thumbnail: 'failed', perceptualHash: 'failed' },
    },
    {
      name: 'derivative conflict',
      options: {
        derivativeError: terminalProcessingError('processing/derivative-conflict'),
      },
      code: 'processing/derivative-conflict',
      expectedOrder: [
        'claim', 'materialize', 'register', 'metadata', 'image',
        'derivative', 'complete', 'cleanup',
      ],
      statuses: { metadata: 'complete', thumbnail: 'failed', perceptualHash: 'complete' },
    },
  ];

  for (const fixture of cases) {
    await t.test(fixture.name, async () => {
      const { processor, calls } = createHarness(fixture.options);
      const result = await processor.handle(EVENT);

      assert.deepEqual(result, { outcome: 'failed_terminal' });
      assert.deepEqual(calls.order, fixture.expectedOrder);
      assert.equal(calls.complete.length, 1);
      assert.equal(calls.complete[0].input.errorCode, fixture.code);
      assert.deepEqual(calls.complete[0].input.capabilityStatuses, fixture.statuses);
      assert.equal(calls.fail.length, 0);
    });
  }
});

test('Storage Firestore and soft-timeout failures persist retryable state and throw 503-class error', async (t) => {
  const cases = [
    {
      name: 'Storage',
      options: {
        materializeError: retryableProcessingError('processing/storage-unavailable'),
      },
      code: 'processing/storage-unavailable',
      order: ['claim', 'materialize', 'fail'],
    },
    {
      name: 'Firestore',
      options: {
        registerError: new Error(SECRET_PROVIDER_ERROR),
      },
      code: 'processing/repository-unavailable',
      order: ['claim', 'materialize', 'register', 'fail', 'cleanup'],
    },
    {
      name: 'soft timeout',
      options: {
        metadataWaitForAbort: true,
        processingConfig: Object.freeze({
          ...PROCESSING_CONFIG,
          timeouts: Object.freeze({
            softMs: 10,
            leaseMs: 20,
            requestMs: 40,
            cleanupMarginMs: 20,
          }),
        }),
      },
      code: 'processing/soft-timeout',
      order: ['claim', 'materialize', 'register', 'metadata', 'fail', 'cleanup'],
    },
  ];

  for (const fixture of cases) {
    await t.test(fixture.name, async () => {
      const { processor, calls } = createHarness(fixture.options);
      const keepAlive = fixture.options.metadataWaitForAbort
        ? setTimeout(() => {}, 1_000)
        : null;

      try {
        await assert.rejects(
          () => processor.handle(EVENT),
          (error) => assertStableError(error, fixture.code, true),
        );
      } finally {
        if (keepAlive !== null) clearTimeout(keepAlive);
      }
      assert.deepEqual(calls.order, fixture.order);
      assert.equal(calls.fail.length, 1);
      assert.deepEqual(calls.fail[0].input, {
        taskId: taskIdFor(),
        leaseOwner: calls.claim[0].input.leaseOwner,
        failedAt: calls.fail[0].input.failedAt,
        errorCode: fixture.code,
      });
      assert.equal(calls.fail[0].input.failedAt, CLAIMED_AT);
      assert.equal(JSON.stringify(calls.fail[0].input).includes(SECRET_PROVIDER_ERROR), false);
    });
  }
});

test('the soft timeout timer uses only the absolute deadline remaining after claim', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = CLAIMED_AT;
  const config = Object.freeze({
    ...PROCESSING_CONFIG,
    timeouts: Object.freeze({
      softMs: 80,
      leaseMs: 160,
      requestMs: 220,
      cleanupMarginMs: 40,
    }),
  });
  const { processor, calls } = createHarness({
    materializeWaitForAbort: true,
    processingConfig: config,
    clock: () => now,
    claimHook: (claim) => {
      now = new Date(Date.parse(claim.claimedAt) + 60).toISOString();
    },
  });
  const operation = processor.handle(EVENT);
  let settled = false;
  void operation.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );

  for (let attempt = 0; attempt < 20 && calls.materialize.length === 0; attempt += 1) {
    await Promise.resolve();
  }

  const remainingMs = Date.parse(calls.claim[0].input.softDeadlineAt) - Date.parse(now);
  assert.equal(remainingMs, 20);
  assert.equal(calls.materialize.length, 1);

  t.mock.timers.tick(19);
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(calls.fail.length, 0);

  t.mock.timers.tick(1);
  await assert.rejects(
    operation,
    (error) => assertStableError(error, 'processing/soft-timeout', true),
  );
  assert.deepEqual(calls.order, ['claim', 'materialize', 'fail']);
});

test('deadline equality after claim prevents all media work', async () => {
  let now = CLAIMED_AT;
  const { processor, calls } = createHarness({
    clock: () => now,
    claimHook: (claim) => {
      now = claim.softDeadlineAt;
    },
  });

  await assert.rejects(
    () => processor.handle(EVENT),
    (error) => assertStableError(error, 'processing/soft-timeout', true),
  );
  assert.deepEqual(calls.order, ['claim', 'fail']);
});

test('deadline equality after materialization prevents checkpoints and adapters', async () => {
  let now = CLAIMED_AT;
  const { processor, calls } = createHarness({
    clock: () => now,
    materializeHook: (input) => {
      now = input.deadlineAt;
    },
  });

  await assert.rejects(
    () => processor.handle(EVENT),
    (error) => assertStableError(error, 'processing/soft-timeout', true),
  );
  assert.deepEqual(calls.order, ['claim', 'materialize', 'fail', 'cleanup']);
});

test('terminal transaction failure never reports terminal success', async () => {
  const { processor, calls } = createHarness({
    completeError: new Error(SECRET_PROVIDER_ERROR),
  });

  await assert.rejects(
    () => processor.handle(EVENT),
    (error) => assertStableError(error, 'processing/repository-unavailable', true),
  );

  assert.deepEqual(calls.order, [
    'claim', 'materialize', 'register', 'metadata', 'image', 'derivative',
    'near', 'complete', 'fail', 'cleanup',
  ]);
  assert.equal(calls.complete.length, 1);
  assert.equal(calls.fail.length, 1);
  assert.equal(calls.fail[0].input.errorCode, 'processing/repository-unavailable');
});

test('terminal failure transaction failure records retryable state and never returns 204 outcome', async () => {
  const { processor, calls } = createHarness({
    metadataError: terminalProcessingError('processing/invalid-media'),
    completeError: new Error(SECRET_PROVIDER_ERROR),
  });

  await assert.rejects(
    () => processor.handle(EVENT),
    (error) => assertStableError(error, 'processing/repository-unavailable', true),
  );
  assert.deepEqual(calls.order, [
    'claim', 'materialize', 'register', 'metadata', 'complete', 'fail', 'cleanup',
  ]);
  assert.equal(calls.fail[0].input.errorCode, 'processing/repository-unavailable');
});

test('successful terminal settlement cannot outlive the absolute soft deadline', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const settlement = deferred();
  let now = CLAIMED_AT;
  const config = Object.freeze({
    ...PROCESSING_CONFIG,
    timeouts: Object.freeze({
      ...PROCESSING_CONFIG.timeouts,
      softMs: 50,
      leaseMs: 100,
    }),
  });
  const { processor, calls } = createHarness({
    processingConfig: config,
    clock: () => now,
    completePromise: settlement.promise,
    completeHook: () => {
      now = new Date(Date.parse(CLAIMED_AT) + config.timeouts.softMs).toISOString();
    },
  });
  const operation = processor.handle(EVENT);
  await waitForCall(calls, 'complete');

  t.mock.timers.tick(config.timeouts.softMs);
  const result = await readSettlement(operation);
  settlement.resolve(Object.freeze({ outcome: 'applied' }));
  await operation.catch(() => {});

  assert.equal(result?.status, 'rejected');
  assertStableError(result.error, 'processing/soft-timeout', true);
  assert.equal(calls.fail.length, 0);
  assert.equal(calls.cleanup, 1);
});

test('terminal-failure settlement timeout does not race a retryable failure write', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const settlement = deferred();
  let now = CLAIMED_AT;
  const config = Object.freeze({
    ...PROCESSING_CONFIG,
    timeouts: Object.freeze({
      ...PROCESSING_CONFIG.timeouts,
      softMs: 50,
      leaseMs: 100,
    }),
  });
  const { processor, calls } = createHarness({
    processingConfig: config,
    clock: () => now,
    metadataError: terminalProcessingError('processing/invalid-media'),
    completePromise: settlement.promise,
    completeHook: () => {
      now = new Date(Date.parse(CLAIMED_AT) + config.timeouts.softMs).toISOString();
    },
  });
  const operation = processor.handle(EVENT);
  await waitForCall(calls, 'complete');

  t.mock.timers.tick(config.timeouts.softMs);
  const result = await readSettlement(operation);
  settlement.reject(new Error(SECRET_PROVIDER_ERROR));
  await operation.catch(() => {});

  assert.equal(result?.status, 'rejected');
  assertStableError(result.error, 'processing/soft-timeout', true);
  assert.equal(calls.fail.length, 0);
  assert.equal(calls.cleanup, 1);
});

test('terminal completion settled at the deadline is still a soft timeout', async () => {
  let now = CLAIMED_AT;
  const config = Object.freeze({
    ...PROCESSING_CONFIG,
    timeouts: Object.freeze({
      ...PROCESSING_CONFIG.timeouts,
      softMs: 50,
      leaseMs: 100,
    }),
  });
  const { processor, calls } = createHarness({
    processingConfig: config,
    clock: () => now,
    completeHook: () => {
      now = new Date(Date.parse(CLAIMED_AT) + config.timeouts.softMs).toISOString();
    },
  });

  await assert.rejects(
    () => processor.handle(EVENT),
    (error) => assertStableError(error, 'processing/soft-timeout', true),
  );
  assert.equal(calls.complete.length, 1);
  assert.equal(calls.fail.length, 0);
  assert.equal(calls.cleanup, 1);
});

test('a retryable failure write failure becomes stable repository-unavailable', async () => {
  const { processor, calls } = createHarness({
    materializeError: retryableProcessingError('processing/storage-unavailable'),
    failError: new Error(SECRET_PROVIDER_ERROR),
  });

  await assert.rejects(
    () => processor.handle(EVENT),
    (error) => assertStableError(error, 'processing/repository-unavailable', true),
  );
  assert.deepEqual(calls.order, ['claim', 'materialize', 'fail']);
});

test('temporary material cleanup runs once on every post-materialization path', async (t) => {
  const cases = [
    ['success', {}],
    ['metadata terminal', {
      metadataError: terminalProcessingError('processing/invalid-media'),
    }],
    ['image terminal', {
      imageError: terminalProcessingError('processing/invalid-media'),
    }],
    ['derivative terminal', {
      derivativeError: terminalProcessingError('processing/derivative-conflict'),
    }],
    ['near retryable', {
      nearError: new Error(SECRET_PROVIDER_ERROR),
    }],
    ['terminal transaction retryable', {
      completeError: new Error(SECRET_PROVIDER_ERROR),
    }],
  ];

  for (const [name, options] of cases) {
    await t.test(name, async () => {
      const { processor, calls, getMaterialSignal } = createHarness(options);
      try {
        await processor.handle(EVENT);
      } catch {
        // Retryable cases are asserted for cleanup here; classification is covered above.
      }
      assert.equal(calls.cleanup, 1);
      assert.equal(calls.order.at(-1), 'cleanup');
      assert.equal(getMaterialSignal().aborted, true);
    });
  }
});

test('a primary processing failure or terminal outcome takes precedence over cleanup failure', async (t) => {
  const retryableCases = [
    ['soft timeout', {
      metadataError: retryableProcessingError('processing/soft-timeout'),
      cleanupError: new Error(`${SECRET_PROVIDER_ERROR}:${SECRET_LOCAL_PATH}`),
    }, 'processing/soft-timeout'],
    ['repository unavailable', {
      registerError: new Error(SECRET_PROVIDER_ERROR),
      cleanupError: new Error(`${SECRET_PROVIDER_ERROR}:${SECRET_LOCAL_PATH}`),
    }, 'processing/repository-unavailable'],
  ];

  for (const [name, options, code] of retryableCases) {
    await t.test(name, async () => {
      const { processor, calls } = createHarness(options);
      await assert.rejects(
        () => processor.handle(EVENT),
        (error) => assertStableError(error, code, true),
      );
      assert.equal(calls.cleanup, 1);
    });
  }

  await t.test('persisted terminal failure', async () => {
    const { processor, calls } = createHarness({
      metadataError: terminalProcessingError('processing/invalid-media'),
      cleanupError: new Error(`${SECRET_PROVIDER_ERROR}:${SECRET_LOCAL_PATH}`),
    });
    assert.deepEqual(await processor.handle(EVENT), { outcome: 'failed_terminal' });
    assert.equal(calls.cleanup, 1);
  });
});

test('cleanup failure is retryable storage-unavailable and redacted after terminal commit', async () => {
  const { processor, calls } = createHarness({
    cleanupError: new Error(`${SECRET_PROVIDER_ERROR}:${SECRET_LOCAL_PATH}`),
  });

  await assert.rejects(
    () => processor.handle(EVENT),
    (error) => assertStableError(error, 'processing/storage-unavailable', true),
  );
  assert.equal(calls.complete.length, 1);
  assert.equal(calls.cleanup, 1);
  assert.equal(calls.fail.length, 0);
  assert.equal(calls.order.at(-1), 'cleanup');
});
