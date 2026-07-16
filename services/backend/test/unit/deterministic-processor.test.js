import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeterministicProcessor } from '../../src/processing/service.js';
import { retryableProcessingError, terminalProcessingError } from '../../src/processing/errors.js';
import { makeProcessingTaskId } from '../../src/processing/identity.js';

const OWNER_ID = 'user_alpha';
const FRAGMENT_ID = 'frag_12345678';
const BATCH_ID = 'batch_12345678';
const SECRET_OBJECT_PATH = `users/${OWNER_ID}/originals/${BATCH_ID}/private-secret-original.jpg`;
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

function tickingClock(start = CLAIMED_AT) {
  let tick = 0;
  return () => new Date(Date.parse(start) + (tick++ * 1_000)).toISOString();
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

function cappedNearInputs() {
  return Array.from({ length: 201 }, (_, index) => ({
    fragmentId: `frag_match${String(index).padStart(4, '0')}`,
    perceptualHash: index === 0 ? '0000000000000001' : 'ffffffffffffffff',
  }));
}

function claimedFragment(overrides = {}) {
  return Object.freeze({
    id: FRAGMENT_ID,
    ownerId: OWNER_ID,
    batchId: BATCH_ID,
    type: 'photo',
    storage: STORAGE,
    ...overrides,
  });
}

function claimedTask(claim, inputHash = null) {
  return Object.freeze({
    id: claim.taskId,
    ownerId: OWNER_ID,
    fragmentId: FRAGMENT_ID,
    batchId: BATCH_ID,
    processorName: 'deterministic-media',
    processorVersion: 'v1',
    sourceRevision: EVENT.sourceRevision,
    inputHash,
    state: 'running',
    leaseOwner: claim.leaseOwner,
    softDeadlineAt: claim.softDeadlineAt,
    leaseExpiresAt: claim.leaseExpiresAt,
  });
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
      const outcome = options.claimOutcome ?? 'claimed';
      if (outcome === 'busy' || outcome === 'terminal') {
        return Object.freeze({
          outcome,
          task: Object.freeze({
            id: input.taskId,
            inputHash: options.taskInputHash ?? null,
            state: outcome === 'terminal' ? (options.terminalState ?? 'succeeded') : 'running',
          }),
        });
      }
      return Object.freeze({
        outcome: 'claimed',
        task: claimedTask(input, options.taskInputHash ?? null),
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
      if (options.materializeError) throw options.materializeError;
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
      if (options.imageError) throw options.imageError;
      return options.imageResult ?? defaultImageResult();
    },
  };

  const derivativeStore = {
    async putThumbnail(input) {
      calls.order.push('derivative');
      calls.derivative.push(input);
      if (options.derivativeError) throw options.derivativeError;
      return options.derivativeResult ?? derivativeFacts();
    },
  };

  const processor = createDeterministicProcessor({
    repository,
    materializer,
    metadataReader,
    imageProcessor,
    derivativeStore,
    processingConfig: options.processingConfig ?? PROCESSING_CONFIG,
    clock: options.clock ?? tickingClock(),
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
      registeredAt: '2026-07-16T00:01:01.000Z',
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
    thumbnail: defaultImageResult().thumbnail,
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
    completedAt: '2026-07-16T00:01:02.000Z',
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
        observedAt: '2026-07-16T00:01:02.000Z',
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
        observedAt: '2026-07-16T00:01:02.000Z',
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
    completedAt: '2026-07-16T00:01:01.000Z',
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

      await assert.rejects(
        () => processor.handle(EVENT),
        (error) => assertStableError(error, fixture.code, true),
      );
      assert.deepEqual(calls.order, fixture.order);
      assert.equal(calls.fail.length, 1);
      assert.deepEqual(calls.fail[0].input, {
        taskId: taskIdFor(),
        leaseOwner: calls.claim[0].input.leaseOwner,
        failedAt: calls.fail[0].input.failedAt,
        errorCode: fixture.code,
      });
      assert.match(calls.fail[0].input.failedAt, /^2026-07-16T00:01:0[1-9]\.000Z$/);
      assert.equal(JSON.stringify(calls.fail[0].input).includes(SECRET_PROVIDER_ERROR), false);
    });
  }
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
