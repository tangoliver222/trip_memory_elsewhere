import test from 'node:test';
import assert from 'node:assert/strict';
import * as importBatchDomain from '../../src/domain/import-batch.js';
import { parseFragment } from '../../src/domain/fragment.js';
import {
  makePendingBatch,
  makeUploadItem,
  makeUploadedFragment,
} from '../fixtures/import.js';

const makeUploads = (count, itemForIndex = () => ({})) => Object.fromEntries(
  Array.from({ length: count }, (_, index) => {
    const fragmentId = `frag_${String(index).padStart(8, '0')}`;
    return [fragmentId, makeUploadItem({ fragmentId, ...itemForIndex(index) })];
  }),
);

const batchWithUploads = (uploads, overrides = {}) => makePendingBatch({
  inputCount: Object.keys(uploads).length,
  uploads,
  ...overrides,
});

test('import batch accepts one, normal and fifty-item manifests', () => {
  for (const count of [1, 12, 50]) {
    const uploads = makeUploads(count);
    assert.equal(importBatchDomain.parseImportBatch(batchWithUploads(uploads)).inputCount, count);
  }
});

test('import batch rejects empty and over-limit manifests', () => {
  assert.throws(() => importBatchDomain.parseImportBatch(batchWithUploads({})));
  const uploads = makeUploads(51);
  assert.throws(() => importBatchDomain.parseImportBatch(batchWithUploads(uploads)));
});

test('manifest key, fragment ID, path, input count and counters stay consistent', () => {
  const valid = makePendingBatch();
  const [fragmentId] = Object.keys(valid.uploads);
  const item = valid.uploads[fragmentId];

  const invalidBatches = [
    { ...valid, uploads: { frag_87654321: item } },
    {
      ...valid,
      uploads: {
        [fragmentId]: { ...item, originalPath: item.originalPath.replace('user_alpha', 'user_beta') },
      },
    },
    { ...valid, inputCount: 2 },
    { ...valid, counters: { ...valid.counters, saved: 1 } },
    {
      ...valid,
      uploads: { [fragmentId]: { ...item, declaredContentType: 'application/pdf' } },
    },
    {
      ...valid,
      uploads: { [fragmentId]: { ...item, declaredSizeBytes: item.maxBytes + 1 } },
    },
  ];

  for (const batch of invalidBatches) {
    assert.throws(() => importBatchDomain.parseImportBatch(batch));
  }
});

test('manifest item state requires matching generation and failure fields', () => {
  const valid = makePendingBatch();
  const [fragmentId] = Object.keys(valid.uploads);
  const item = valid.uploads[fragmentId];

  for (const changedItem of [
    { ...item, state: 'pending', finalizedGeneration: '174', failureCode: null },
    { ...item, state: 'finalized', finalizedGeneration: null, failureCode: null },
    { ...item, state: 'finalized', finalizedGeneration: '174', failureCode: 'invalid-format' },
    { ...item, state: 'failed', finalizedGeneration: '174', failureCode: null },
  ]) {
    assert.throws(() => importBatchDomain.parseImportBatch({
      ...valid,
      uploads: { [fragmentId]: changedItem },
    }));
  }
});

test('derives the four frozen batch status transitions from upload states', () => {
  assert.equal(typeof importBatchDomain.deriveImportBatchState, 'function');

  const finalized = (index) => ({
    state: 'finalized',
    finalizedGeneration: `generation-${index}`,
    failureCode: null,
  });
  const failed = (index) => ({
    state: 'failed',
    finalizedGeneration: `generation-${index}`,
    failureCode: 'ingestion/invalid-original',
  });
  const counters = { saved: 0, processed: 0, failed: 0, needsReview: 0 };

  const cases = [
    {
      uploads: makeUploads(2, (index) => (index === 0 ? finalized(index) : {})),
      expected: {
        status: 'open',
        uploadStatus: 'pending',
        counters: { ...counters, saved: 1 },
      },
    },
    {
      uploads: makeUploads(2, finalized),
      expected: {
        status: 'processing',
        uploadStatus: 'complete',
        counters: { ...counters, saved: 2 },
      },
    },
    {
      uploads: makeUploads(2, (index) => (index === 0 ? finalized(index) : failed(index))),
      expected: {
        status: 'processing',
        uploadStatus: 'complete_with_errors',
        counters: { ...counters, saved: 1, failed: 1 },
      },
    },
    {
      uploads: makeUploads(2, failed),
      expected: {
        status: 'failed',
        uploadStatus: 'complete_with_errors',
        counters: { ...counters, failed: 2 },
      },
    },
  ];

  for (const { uploads, expected } of cases) {
    assert.deepEqual(importBatchDomain.deriveImportBatchState(uploads, counters), expected);
  }
});

test('fragment requires authoritative storage facts and complete source descriptor', () => {
  const fragment = makeUploadedFragment();
  assert.deepEqual(parseFragment(fragment), fragment);

  for (const field of ['generation', 'sizeBytes', 'crc32c']) {
    const storage = { ...fragment.storage };
    delete storage[field];
    assert.throws(() => parseFragment({ ...fragment, storage }));
  }

  assert.equal(parseFragment({
    ...fragment,
    storage: { ...fragment.storage, md5Hash: null },
  }).storage.md5Hash, null);

  assert.throws(() => parseFragment({ ...fragment, source: { provider: 'local_file' } }));
});

test('fragment original path remains scoped to owner, batch and fragment', () => {
  const fragment = makeUploadedFragment();
  assert.throws(() => parseFragment({
    ...fragment,
    storage: {
      ...fragment.storage,
      originalPath: 'users/user_beta/originals/batch_12345678/frag_12345678',
    },
  }));
});
