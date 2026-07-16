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

test('processing summaries partition eligible work and bind every top-level counter', () => {
  const summary = (overrides = {}) => ({
    deterministic: {
      processorName: 'deterministic-media',
      processorVersion: 'v1',
      eligible: 2,
      running: 1,
      succeeded: 1,
      failedRetryable: 0,
      failedTerminal: 0,
      unsupportedCapabilities: 0,
      updatedAt: '2026-07-16T00:02:00.000Z',
      ...overrides,
    },
  });
  const pendingUploads = makeUploads(2);
  for (const processingSummary of [
    summary({ running: 2, succeeded: 1 }),
    summary({ running: 1, succeeded: 0 }),
    summary({ unsupportedCapabilities: 7 }),
  ]) {
    assert.throws(() => importBatchDomain.parseImportBatch(batchWithUploads(
      pendingUploads,
      { processingSummary },
    )));
    assert.throws(() => importBatchDomain.deriveImportBatchState(
      pendingUploads,
      { saved: 0, processed: 0, failed: 0, needsReview: 0 },
      processingSummary,
    ));
  }

  const finalizedUploads = makeUploads(2, (index) => ({
    state: 'finalized',
    finalizedGeneration: `generation-${index}`,
    failureCode: null,
  }));
  const runningBatch = batchWithUploads(finalizedUploads, {
    status: 'processing',
    uploadStatus: 'complete',
    counters: { saved: 2, processed: 1, failed: 0, needsReview: 1 },
    processingSummary: summary(),
  });
  assert.deepEqual(importBatchDomain.parseImportBatch(runningBatch), runningBatch);
  assert.throws(() => importBatchDomain.parseImportBatch({
    ...runningBatch,
    counters: { ...runningBatch.counters, processed: 0, needsReview: 0 },
  }));
  assert.throws(() => importBatchDomain.parseImportBatch({
    ...runningBatch,
    counters: { ...runningBatch.counters, needsReview: 2 },
  }));

  const terminalFailureSummary = summary({
    running: 0,
    succeeded: 1,
    failedTerminal: 1,
  });
  assert.throws(() => importBatchDomain.parseImportBatch({
    ...runningBatch,
    status: 'completed_with_errors',
    counters: { saved: 2, processed: 1, failed: 0, needsReview: 0 },
    processingSummary: terminalFailureSummary,
  }));
  assert.deepEqual(importBatchDomain.deriveImportBatchState(
    finalizedUploads,
    { saved: 0, processed: 0, failed: 0, needsReview: 1 },
    terminalFailureSummary,
  ), {
    status: 'completed_with_errors',
    uploadStatus: 'complete',
    counters: { saved: 2, processed: 1, failed: 1, needsReview: 1 },
  });
});

const sourceBoundSummary = (overrides = {}) => ({
  deterministic: {
    processorName: 'deterministic-media',
    processorVersion: 'v1',
    eligible: 1,
    running: 1,
    succeeded: 0,
    failedRetryable: 0,
    failedTerminal: 0,
    unsupportedCapabilities: 0,
    updatedAt: '2026-07-16T00:02:00.000Z',
    ...overrides,
  },
});

const uploadsInStates = (states) => Object.fromEntries(states.map((state, index) => {
  const fragmentId = `frag_${String(index).padStart(8, '0')}`;
  return [fragmentId, makeUploadItem({
    fragmentId,
    state,
    finalizedGeneration: state === 'pending' ? null : `generation-${index}`,
    failureCode: state === 'failed' ? 'ingestion/invalid-original' : null,
  })];
}));

const sourceBoundCases = [
  {
    name: 'eligible work above finalized uploads',
    uploads: uploadsInStates(['finalized', 'pending']),
    processingSummary: sourceBoundSummary({ eligible: 2, running: 2 }),
    previousCounters: { saved: 0, processed: 0, failed: 0, needsReview: 0 },
    derived: {
      status: 'open',
      uploadStatus: 'pending',
      counters: { saved: 1, processed: 0, failed: 0, needsReview: 0 },
    },
  },
  {
    name: 'upload and terminal failures above input count',
    uploads: uploadsInStates(['failed', 'pending']),
    processingSummary: sourceBoundSummary({
      eligible: 2,
      running: 0,
      failedTerminal: 2,
    }),
    previousCounters: { saved: 0, processed: 0, failed: 0, needsReview: 0 },
    derived: {
      status: 'open',
      uploadStatus: 'pending',
      counters: { saved: 0, processed: 0, failed: 3, needsReview: 0 },
    },
  },
  {
    name: 'review work above derived processed count',
    uploads: uploadsInStates(['finalized']),
    processingSummary: sourceBoundSummary(),
    previousCounters: { saved: 0, processed: 0, failed: 0, needsReview: 1 },
    derived: {
      status: 'processing',
      uploadStatus: 'complete',
      counters: { saved: 1, processed: 0, failed: 0, needsReview: 1 },
    },
  },
  {
    name: 'pending-only upload with succeeded processing',
    uploads: uploadsInStates(['pending']),
    processingSummary: sourceBoundSummary({ running: 0, succeeded: 1 }),
    previousCounters: { saved: 0, processed: 0, failed: 0, needsReview: 0 },
    derived: {
      status: 'open',
      uploadStatus: 'pending',
      counters: { saved: 0, processed: 1, failed: 0, needsReview: 0 },
    },
  },
  {
    name: 'terminal processing without a finalized source',
    uploads: uploadsInStates(['pending']),
    processingSummary: sourceBoundSummary({ running: 0, failedTerminal: 1 }),
    previousCounters: { saved: 0, processed: 0, failed: 0, needsReview: 0 },
    derived: {
      status: 'open',
      uploadStatus: 'pending',
      counters: { saved: 0, processed: 0, failed: 1, needsReview: 0 },
    },
  },
];

for (const scenario of sourceBoundCases) {
  test(`import batch parser rejects ${scenario.name}`, () => {
    assert.throws(() => importBatchDomain.parseImportBatch(makePendingBatch({
      inputCount: Object.keys(scenario.uploads).length,
      uploads: scenario.uploads,
      processingSummary: scenario.processingSummary,
      ...scenario.derived,
    })));
  });

  test(`batch state derivation rejects ${scenario.name}`, () => {
    assert.throws(() => importBatchDomain.deriveImportBatchState(
      scenario.uploads,
      scenario.previousCounters,
      scenario.processingSummary,
    ));
  });
}

for (const scenario of [
  {
    name: 'processed work before any upload is finalized',
    counters: { saved: 0, processed: 1, failed: 0, needsReview: 0 },
  },
  {
    name: 'review work above processed before summary initialization',
    counters: { saved: 0, processed: 0, failed: 0, needsReview: 1 },
  },
]) {
  test(`null-summary parser rejects ${scenario.name}`, () => {
    assert.throws(() => importBatchDomain.parseImportBatch(makePendingBatch({
      counters: scenario.counters,
      processingSummary: null,
    })));
  });

  test(`null-summary derivation rejects ${scenario.name}`, () => {
    assert.throws(() => importBatchDomain.deriveImportBatchState(
      makePendingBatch().uploads,
      scenario.counters,
      null,
    ));
  });
}

test('fragment requires authoritative storage facts and complete source descriptor', () => {
  const fragment = makeUploadedFragment();
  assert.deepEqual(parseFragment(fragment), fragment);

  for (const field of ['bucket', 'generation', 'sizeBytes', 'crc32c']) {
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
