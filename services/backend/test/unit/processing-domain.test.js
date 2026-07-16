import test from 'node:test';
import assert from 'node:assert/strict';
import * as domain from '../../src/domain/index.js';
import {
  PROCESSING_STEPS,
  PROCESSING_TASK_STATES,
  TechnicalMetadataSchema,
  parseDuplicateCandidate,
  parseFragment,
  parseImportBatch,
  parseProcessingTask,
} from '../../src/domain/index.js';
import { makePendingBatch, makeUploadedFragment } from '../fixtures/import.js';
import {
  SHA256,
  makeExactDuplicateCandidate,
  makeNearDuplicateCandidate,
  makePdfTechnicalMetadata,
  makeProcessingTask,
} from '../fixtures/processing.js';

test('task identity fields exclude inputHash and require a complete source revision', () => {
  assert.equal(Object.isFrozen(PROCESSING_TASK_STATES), true);
  assert.equal(Object.isFrozen(PROCESSING_STEPS), true);
  assert.equal(parseProcessingTask(makeProcessingTask()).inputHash, null);
  assert.equal(parseProcessingTask(makeProcessingTask({ inputHash: SHA256 })).inputHash, SHA256);

  for (const field of ['bucket', 'generation']) {
    const task = makeProcessingTask();
    const sourceRevision = { ...task.sourceRevision };
    delete sourceRevision[field];
    assert.throws(() => parseProcessingTask({ ...task, sourceRevision }));
  }
  assert.throws(() => parseProcessingTask(makeProcessingTask({ identityInputHash: SHA256 })));
});

test('task states enforce lease deadline step and completion invariants', () => {
  assert.equal(parseProcessingTask(makeProcessingTask()).state, 'running');

  assert.throws(() => parseProcessingTask(makeProcessingTask({ leaseOwner: null })));
  assert.throws(() => parseProcessingTask(makeProcessingTask({
    softDeadlineAt: '2026-07-16T00:05:00.000Z',
  })));
  assert.throws(() => parseProcessingTask(makeProcessingTask({ currentStep: 'extracting' })));

  const failedTerminal = makeProcessingTask({
    state: 'failed_terminal',
    currentStep: 'complete',
    leaseOwner: null,
    leaseExpiresAt: null,
    completedAt: '2026-07-16T00:03:30.000Z',
    lastErrorCode: 'processing/invalid-media',
  });
  assert.equal(parseProcessingTask(failedTerminal).completedAt,
    '2026-07-16T00:03:30.000Z');
  assert.throws(() => parseProcessingTask({ ...failedTerminal, completedAt: null }));

  const failedRetryable = makeProcessingTask({
    state: 'failed_retryable',
    leaseOwner: null,
    leaseExpiresAt: null,
    completedAt: null,
    lastErrorCode: 'processing/soft-timeout',
  });
  assert.equal(parseProcessingTask(failedRetryable).completedAt, null);
  assert.throws(() => parseProcessingTask({
    ...failedRetryable,
    completedAt: '2026-07-16T00:03:30.000Z',
  }));
});

test('fragment processing fields use null rather than empty or forged values', () => {
  const fragment = makeUploadedFragment();
  assert.deepEqual(parseFragment(fragment), fragment);
  assert.throws(() => parseFragment({
    ...fragment,
    hashes: { ...fragment.hashes, sha256: '' },
  }));
  assert.throws(() => parseFragment({
    ...fragment,
    hashes: {
      ...fragment.hashes,
      perceptualHash: '0123456789abcde',
      perceptualHashAlgorithm: 'dhash',
      perceptualHashVersion: 'v1',
      perceptualHashBands: ['0:01', '1:23', '2:45', '3:67', '4:89', '5:ab', '6:cd', '7:ef'],
    },
  }));
  assert.throws(() => parseFragment({
    ...fragment,
    technicalMetadata: {},
  }));
});

test('near candidate keeps directional roles and sorted pairRefs', () => {
  const candidate = makeNearDuplicateCandidate();
  assert.deepEqual(parseDuplicateCandidate(candidate), candidate);
  assert.throws(() => parseDuplicateCandidate({
    ...candidate,
    pairRefs: [...candidate.pairRefs].reverse(),
  }));
  assert.throws(() => parseDuplicateCandidate({
    ...candidate,
    queryFragmentRef: candidate.matchedFragmentRef,
  }));
});

test('exact candidate keeps canonical and candidate roles', () => {
  const candidate = makeExactDuplicateCandidate();
  assert.deepEqual(parseDuplicateCandidate(candidate), candidate);
  assert.throws(() => parseDuplicateCandidate({ ...candidate, rank: 1 }));
  assert.throws(() => parseDuplicateCandidate({
    ...candidate,
    canonicalFragmentRef: candidate.candidateFragmentRef,
  }));
});

test('processing summary records active processor name and version', () => {
  const processingSummary = {
    deterministic: {
      processorName: 'deterministic-media',
      processorVersion: 'v1',
      eligible: 1,
      running: 1,
      succeeded: 0,
      failedRetryable: 0,
      failedTerminal: 0,
      unsupportedCapabilities: 2,
      updatedAt: '2026-07-16T00:01:00.000Z',
    },
  };
  assert.deepEqual(parseImportBatch(makePendingBatch({ processingSummary })).processingSummary,
    processingSummary);
  assert.throws(() => parseImportBatch(makePendingBatch({
    processingSummary: {
      deterministic: { ...processingSummary.deterministic, processorVersion: 'v2' },
    },
  })));
  assert.throws(() => parseImportBatch(makePendingBatch({
    processingSummary: {
      deterministic: { ...processingSummary.deterministic, running: 2 },
    },
  })));
});

test('PDF technical metadata keeps pageCount null and the unsupported warning', () => {
  const metadata = makePdfTechnicalMetadata();
  assert.deepEqual(TechnicalMetadataSchema.parse(metadata), metadata);
  assert.throws(() => TechnicalMetadataSchema.parse({ ...metadata, pageCount: 1 }));
  assert.throws(() => TechnicalMetadataSchema.parse({ ...metadata, warningCodes: [] }));
});

test('processing error codes use the frozen v1 vocabulary', () => {
  assert.throws(() => parseProcessingTask(makeProcessingTask({
    lastErrorCode: 'processing/not-real',
  })));

  const expected = [
    'processing/task-busy',
    'processing/soft-timeout',
    'processing/storage-unavailable',
    'processing/repository-unavailable',
    'processing/media-limits-exceeded',
    'processing/invalid-media',
    'processing/derivative-conflict',
  ];
  assert.deepEqual(domain.PROCESSING_ERROR_CODES, expected);
  assert.equal(Object.isFrozen(domain.PROCESSING_ERROR_CODES), true);
  for (const lastErrorCode of expected) {
    assert.equal(parseProcessingTask(makeProcessingTask({ lastErrorCode })).lastErrorCode,
      lastErrorCode);
  }
});

test('processing warning codes use the frozen v1 vocabulary', () => {
  const task = makeProcessingTask();
  assert.throws(() => parseProcessingTask({
    ...task,
    outputs: { ...task.outputs, warningCodes: ['processing/not-real'] },
  }));
  assert.throws(() => TechnicalMetadataSchema.parse(makePdfTechnicalMetadata({
    warningCodes: ['processing/page-count-unsupported', 'processing/not-real'],
  })));

  const expected = [
    'processing/page-count-unsupported',
    'processing/near-scan-truncated',
  ];
  assert.deepEqual(domain.PROCESSING_WARNING_CODES, expected);
  assert.equal(Object.isFrozen(domain.PROCESSING_WARNING_CODES), true);
  for (const warningCode of expected) {
    assert.deepEqual(parseProcessingTask({
      ...task,
      outputs: { ...task.outputs, warningCodes: [warningCode] },
    }).outputs.warningCodes, [warningCode]);
  }
});
