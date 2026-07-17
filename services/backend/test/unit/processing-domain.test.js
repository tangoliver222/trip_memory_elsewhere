import test from 'node:test';
import assert from 'node:assert/strict';
import * as domain from '../../src/domain/index.js';
import {
  PROCESSING_STEPS,
  PROCESSING_TASK_STATES,
  ProcessingErrorCodeSchema,
  TechnicalMetadataSchema,
  parseDuplicateCandidate,
  parseFragment,
  parseImportBatch,
  parseProcessingTask,
} from '../../src/domain/index.js';
import {
  makePendingBatch,
  makeUploadItem,
  makeUploadedFragment,
} from '../fixtures/import.js';
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

test('persisted processing task states accept only internally consistent shapes', () => {
  const completedAt = '2026-07-16T00:03:30.000Z';
  const pending = makeProcessingTask({
    state: 'pending',
    currentStep: 'queued',
    leaseOwner: null,
    attemptCount: 0,
    firstStartedAt: null,
    attemptStartedAt: null,
    lastHeartbeatAt: null,
    softDeadlineAt: null,
    leaseAcquiredAt: null,
    leaseExpiresAt: null,
  });
  const running = makeProcessingTask();
  const failedRetryable = makeProcessingTask({
    state: 'failed_retryable',
    leaseOwner: null,
    leaseAcquiredAt: null,
    leaseExpiresAt: null,
    lastErrorCode: 'processing/soft-timeout',
  });
  const succeeded = makeProcessingTask({
    state: 'succeeded',
    currentStep: 'complete',
    inputHash: SHA256,
    leaseOwner: null,
    leaseAcquiredAt: null,
    leaseExpiresAt: null,
    outputs: {
      metadataStatus: 'complete',
      thumbnailStatus: 'complete',
      perceptualHashStatus: 'complete',
      warningCodes: [],
    },
    completedAt,
  });
  const failedTerminal = makeProcessingTask({
    state: 'failed_terminal',
    currentStep: 'complete',
    leaseOwner: null,
    leaseAcquiredAt: null,
    leaseExpiresAt: null,
    outputs: {
      metadataStatus: 'failed',
      thumbnailStatus: 'failed',
      perceptualHashStatus: 'failed',
      warningCodes: [],
    },
    lastErrorCode: 'processing/invalid-media',
    completedAt,
  });

  for (const task of [pending, running, failedRetryable, succeeded, failedTerminal]) {
    assert.deepEqual(parseProcessingTask(task), task);
  }

  const contradictions = [
    { ...pending, currentStep: 'hashing' },
    { ...pending, attemptCount: 1 },
    { ...pending, inputHash: SHA256 },
    { ...pending, outputs: { ...pending.outputs, metadataStatus: 'complete' } },
    { ...pending, lastErrorCode: 'processing/soft-timeout' },
    { ...running, currentStep: 'queued' },
    { ...running, currentStep: 'complete' },
    { ...running, lastErrorCode: 'processing/soft-timeout' },
    { ...running, completedAt },
    { ...failedRetryable, currentStep: 'queued' },
    { ...failedRetryable, currentStep: 'complete' },
    { ...failedRetryable, lastErrorCode: null },
    { ...failedRetryable, leaseOwner: 'exec_stale001' },
    { ...failedRetryable, completedAt },
    { ...succeeded, currentStep: 'committing' },
    { ...succeeded, inputHash: null },
    { ...succeeded, lastErrorCode: 'processing/invalid-media' },
    { ...succeeded, outputs: { ...succeeded.outputs, metadataStatus: null } },
    {
      ...succeeded,
      outputs: { ...succeeded.outputs, thumbnailStatus: 'failed' },
    },
    { ...failedTerminal, currentStep: 'committing' },
    { ...failedTerminal, lastErrorCode: null },
    { ...failedTerminal, outputs: { ...failedTerminal.outputs, metadataStatus: null } },
    {
      ...failedTerminal,
      outputs: {
        ...failedTerminal.outputs,
        metadataStatus: 'complete',
        thumbnailStatus: 'complete',
        perceptualHashStatus: 'unsupported',
      },
    },
    ...[pending, failedRetryable, succeeded, failedTerminal].flatMap((task) => (
      ['leaseOwner', 'leaseAcquiredAt', 'leaseExpiresAt'].map((field) => ({
        ...task,
        [field]: field === 'leaseOwner' ? 'exec_stale001' : task.createdAt,
      }))
    )),
    ...['firstStartedAt', 'attemptStartedAt', 'lastHeartbeatAt', 'softDeadlineAt']
      .map((field) => ({ ...pending, [field]: pending.createdAt })),
    ...[failedRetryable, succeeded, failedTerminal].flatMap((task) => [
      { ...task, attemptCount: 0 },
      ...['firstStartedAt', 'attemptStartedAt', 'lastHeartbeatAt', 'softDeadlineAt']
        .map((field) => ({ ...task, [field]: null })),
    ]),
  ];
  for (const task of contradictions) {
    assert.throws(() => parseProcessingTask(task));
  }

  assert.throws(() => parseProcessingTask(makeProcessingTask({ leaseOwner: null })));
  assert.throws(() => parseProcessingTask(makeProcessingTask({
    softDeadlineAt: '2026-07-16T00:05:00.000Z',
  })));
  assert.throws(() => parseProcessingTask(makeProcessingTask({ currentStep: 'extracting' })));
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
  const finalizedUpload = makeUploadItem({
    state: 'finalized',
    finalizedGeneration: '1740000000000001',
    failureCode: null,
  });
  const batchWithSummary = (summary) => makePendingBatch({
    status: 'processing',
    uploadStatus: 'complete',
    counters: { saved: 1, processed: 0, failed: 0, needsReview: 0 },
    processingSummary: summary,
    uploads: { [finalizedUpload.fragmentId]: finalizedUpload },
  });
  assert.deepEqual(parseImportBatch(batchWithSummary(processingSummary)).processingSummary,
    processingSummary);
  const futureSummary = {
    deterministic: { ...processingSummary.deterministic, processorVersion: 'v2' },
  };
  assert.deepEqual(parseImportBatch(batchWithSummary(futureSummary)).processingSummary,
    futureSummary);
  assert.throws(() => parseImportBatch(batchWithSummary({
      deterministic: { ...processingSummary.deterministic, processorVersion: 'version-2' },
    })));
  assert.throws(() => parseImportBatch(batchWithSummary({
      deterministic: { ...processingSummary.deterministic, running: 2 },
    })));
});

test('PDF technical metadata keeps pageCount null and the unsupported warning', () => {
  const metadata = makePdfTechnicalMetadata();
  assert.deepEqual(TechnicalMetadataSchema.parse(metadata), metadata);
  assert.throws(() => TechnicalMetadataSchema.parse({ ...metadata, pageCount: 1 }));
  assert.throws(() => TechnicalMetadataSchema.parse({ ...metadata, warningCodes: [] }));
});

test('processing error codes use the frozen v1 vocabulary', () => {
  assert.throws(() => ProcessingErrorCodeSchema.parse('processing/not-real'));

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
  for (const errorCode of expected) {
    assert.equal(ProcessingErrorCodeSchema.parse(errorCode), errorCode);
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
    'processing/fact-conflict',
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

test('content hash is a strict persisted core document', () => {
  assert.equal(typeof domain.parseContentHash, 'function');
  const contentHash = {
    algorithm: 'sha256',
    algorithmVersion: 'v1',
    canonicalFragmentRef: { type: 'fragment', id: 'frag_12345678' },
    fragmentCount: 2,
    createdAt: '2026-07-16T00:02:00.000Z',
    updatedAt: '2026-07-16T00:02:10.000Z',
  };
  assert.deepEqual(domain.parseContentHash(contentHash), contentHash);
  assert.throws(() => domain.parseContentHash({ ...contentHash, unvalidated: true }));
  assert.throws(() => domain.parseContentHash({ ...contentHash, fragmentCount: 0 }));
});
