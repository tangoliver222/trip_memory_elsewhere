import test from 'node:test';
import assert from 'node:assert/strict';
import { createImportService } from '../../src/imports/service.js';
import { createMemoryRepository } from '../../src/repositories/memory.js';
import { RepositoryConflictError } from '../../src/repositories/errors.js';
import { makeLocalFileSource } from '../fixtures/import.js';

const fixedClock = () => '2026-07-16T05:30:00.000Z';

const uuidSequence = () => {
  let value = 0;
  return () => `00000000-0000-4000-8000-${String(value += 1).padStart(12, '0')}`;
};

const makeRequestItem = (overrides = {}) => ({
  sourceType: 'photo',
  declaredContentType: 'image/jpeg',
  declaredSizeBytes: 2_841_930,
  source: makeLocalFileSource(),
  ...overrides,
});

const createService = (repository = createMemoryRepository()) => createImportService({
  repository,
  randomUUID: uuidSequence(),
  clock: fixedClock,
});

test('creates IDs, paths, policies and counters only on the server', async () => {
  const repository = createMemoryRepository();
  const service = createService(repository);

  const result = await service.createBatch('user_alpha', {
    items: [makeRequestItem()],
  });

  assert.deepEqual(result, {
    batch: {
      id: 'batch_00000000-0000-4000-8000-000000000001',
      status: 'open',
      uploadStatus: 'pending',
      inputCount: 1,
      counters: { saved: 0, processed: 0, failed: 0, needsReview: 0 },
    },
    uploads: [{
      fragmentId: 'frag_00000000-0000-4000-8000-000000000002',
      originalPath: 'users/user_alpha/originals/'
        + 'batch_00000000-0000-4000-8000-000000000001/'
        + 'frag_00000000-0000-4000-8000-000000000002',
      allowedContentTypes: [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/heic',
        'image/heif',
      ],
      maxBytes: 50 * 1024 * 1024,
    }],
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.uploads), true);

  const stored = await repository.getImportBatch('user_alpha', result.batch.id);
  const [storedItem] = Object.values(stored.uploads);
  assert.deepEqual(storedItem.source, makeLocalFileSource());
  assert.equal(storedItem.originalPath, result.uploads[0].originalPath);
  assert.equal(storedItem.state, 'pending');
  assert.equal(stored.createdAt, fixedClock());
});

test('creates one, normal and fifty-item batches', async () => {
  for (const count of [1, 12, 50]) {
    const result = await createService().createBatch('user_alpha', {
      items: Array.from({ length: count }, () => makeRequestItem()),
    });
    assert.equal(result.batch.inputCount, count);
    assert.equal(result.uploads.length, count);
    assert.equal(new Set(result.uploads.map(({ fragmentId }) => fragmentId)).size, count);
  }
});

test('rejects invalid requests before repository execution', async () => {
  let createCalls = 0;
  const repository = {
    createFragment: async () => {},
    getFragment: async () => null,
    createImportBatch: async () => { createCalls += 1; },
    getImportBatch: async () => null,
  };
  const service = createService(repository);
  const invalidRequests = [
    { items: [] },
    { items: Array.from({ length: 51 }, () => makeRequestItem()) },
    { items: [makeRequestItem({ sourceType: 'audio', declaredContentType: 'audio/mpeg' })] },
    { items: [makeRequestItem({ declaredContentType: 'application/pdf' })] },
    { items: [makeRequestItem({ declaredSizeBytes: 50 * 1024 * 1024 + 1 })] },
    { items: [makeRequestItem()], unexpected: true },
  ];

  for (const request of invalidRequests) {
    await assert.rejects(
      () => service.createBatch('user_alpha', request),
      { code: 'import/invalid-request', message: 'Invalid import request' },
    );
  }
  assert.equal(createCalls, 0);
});

test('rejects every forged server-owned field', async () => {
  let createCalls = 0;
  const repository = {
    createFragment: async () => {},
    getFragment: async () => null,
    createImportBatch: async () => { createCalls += 1; },
    getImportBatch: async () => null,
  };
  const service = createService(repository);
  const forgedFields = {
    uid: 'user_beta',
    ownerId: 'user_beta',
    batchId: 'batch_forged',
    fragmentId: 'frag_forged',
    originalPath: 'users/user_beta/originals/forged',
    state: 'finalized',
    generation: 'forged',
    counters: { saved: 1 },
    allowedContentTypes: ['*/*'],
    maxBytes: Number.MAX_SAFE_INTEGER,
  };

  for (const [field, value] of Object.entries(forgedFields)) {
    await assert.rejects(
      () => service.createBatch('user_alpha', {
        items: [makeRequestItem({ [field]: value })],
      }),
      { code: 'import/invalid-request' },
    );
  }
  assert.equal(createCalls, 0);
});

test('create response excludes private source and manifest fields', async () => {
  const result = await createService().createBatch('user_alpha', {
    items: [makeRequestItem()],
  });
  const serialized = JSON.stringify(result);

  for (const privateValue of [
    'source',
    'providerItemId',
    'originalName',
    'finalizedGeneration',
    'failureCode',
    'declaredContentType',
  ]) {
    assert.equal(serialized.includes(privateValue), false);
  }
});

test('returns a frozen minimal owner-scoped receipt', async () => {
  const service = createService();
  const created = await service.createBatch('user_alpha', {
    items: [makeRequestItem()],
  });

  const receipt = await service.getReceipt('user_alpha', created.batch.id);
  assert.deepEqual(receipt, {
    id: created.batch.id,
    status: 'open',
    uploadStatus: 'pending',
    inputCount: 1,
    counters: { saved: 0, processed: 0, failed: 0, needsReview: 0 },
    items: [{
      fragmentId: created.uploads[0].fragmentId,
      sourceType: 'photo',
      state: 'pending',
    }],
  });
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(Object.isFrozen(receipt.items), true);
  assert.equal(JSON.stringify(receipt).includes('originalName'), false);
});

test('absent and other-owner batches have the same not-found result', async () => {
  const service = createService();
  const created = await service.createBatch('user_alpha', {
    items: [makeRequestItem()],
  });

  for (const [uid, batchId] of [
    ['user_alpha', 'batch_00000000-0000-4000-8000-999999999999'],
    ['user_beta', created.batch.id],
  ]) {
    await assert.rejects(
      () => service.getReceipt(uid, batchId),
      { code: 'import/batch-not-found', message: 'Import batch not found' },
    );
  }
});

test('repository create collision becomes a stable batch conflict', async () => {
  const repository = {
    createFragment: async () => {},
    getFragment: async () => null,
    createImportBatch: async () => {
      throw new RepositoryConflictError('raw repository detail');
    },
    getImportBatch: async () => null,
  };
  const service = createService(repository);

  await assert.rejects(
    () => service.createBatch('user_alpha', { items: [makeRequestItem()] }),
    { code: 'import/batch-conflict', message: 'Import batch conflict' },
  );
});
