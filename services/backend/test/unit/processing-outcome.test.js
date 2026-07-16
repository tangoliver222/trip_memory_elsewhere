import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyContentHashRegistration,
  applyDeterministicCompletion,
  applyNearDuplicateInputQuery,
  deriveProposedNearCandidateIds,
} from '../../src/repositories/processing-outcome.js';
import {
  makeNearCandidateId,
  makePairKey,
} from '../../src/processing/identity.js';
import {
  makePendingBatch,
  makeUploadItem,
  makeUploadedFragment,
} from '../fixtures/import.js';
import {
  SHA256,
  makeNearDuplicateCandidate,
  makeProcessingTask,
} from '../fixtures/processing.js';

const UID = 'user_alpha';
const REGISTERED_AT = '2026-07-16T00:01:00.000Z';
const COMPLETED_AT = '2026-07-16T00:02:00.000Z';
const PERCEPTUAL_HASH = '0000000000000000';
const PERCEPTUAL_BANDS = [
  '0:00',
  '1:00',
  '2:00',
  '3:00',
  '4:00',
  '5:00',
  '6:00',
  '7:00',
];

function makeRunningFragment(task, overrides = {}) {
  return makeUploadedFragment({
    status: 'processing',
    processing: {
      deterministic: {
        taskId: task.id,
        processorName: task.processorName,
        processorVersion: task.processorVersion,
        state: 'running',
        metadataStatus: null,
        thumbnailStatus: null,
        perceptualHashStatus: null,
        updatedAt: task.updatedAt,
      },
    },
    ...overrides,
  });
}

function makeRunningBatch(task) {
  const upload = makeUploadItem({
    state: 'finalized',
    finalizedGeneration: task.sourceRevision.generation,
    failureCode: null,
  });
  return makePendingBatch({
    status: 'processing',
    uploadStatus: 'complete',
    counters: { saved: 1, processed: 0, failed: 0, needsReview: 0 },
    processingSummary: {
      deterministic: {
        processorName: task.processorName,
        processorVersion: task.processorVersion,
        eligible: 1,
        running: 1,
        succeeded: 0,
        failedRetryable: 0,
        failedTerminal: 0,
        unsupportedCapabilities: 0,
        updatedAt: task.updatedAt,
      },
    },
    uploads: { [upload.fragmentId]: upload },
  });
}

function makeTechnicalMetadata() {
  return {
    format: 'jpeg',
    width: 4032,
    height: 3024,
    orientation: 1,
    pageCount: null,
    cameraMake: null,
    cameraModel: null,
    lensModel: null,
    focalLengthMm: null,
    apertureFNumber: null,
    isoEquivalent: null,
    exposureTimeSeconds: null,
    metadataStatus: 'complete',
    warningCodes: [],
    processorVersion: 'v1',
  };
}

function makeCompletion(task, overrides = {}) {
  return {
    taskId: task.id,
    leaseOwner: task.leaseOwner,
    completedAt: COMPLETED_AT,
    technicalMetadata: makeTechnicalMetadata(),
    factSuggestions: {},
    derivative: null,
    perceptualHash: { value: PERCEPTUAL_HASH, bands: PERCEPTUAL_BANDS },
    capabilityStatuses: {
      metadata: 'complete',
      thumbnail: 'unsupported',
      perceptualHash: 'complete',
    },
    warningCodes: [],
    nearMatches: [],
    ...overrides,
  };
}

test('content hash membership uses canonical identity and exact candidate existence', () => {
  const task = makeProcessingTask();
  const fragment = makeRunningFragment(task);
  const registration = {
    taskId: task.id,
    leaseOwner: task.leaseOwner,
    registeredAt: REGISTERED_AT,
    sha256: SHA256,
  };

  const first = applyContentHashRegistration(
    UID,
    task,
    fragment,
    null,
    null,
    null,
    registration,
  );
  assert.equal(first.contentHash.fragmentCount, 1);

  const canonicalRepeat = applyContentHashRegistration(
    UID,
    first.task,
    first.fragment,
    first.contentHash,
    first.fragment,
    null,
    registration,
  );
  assert.equal(canonicalRepeat.contentHash.fragmentCount, 1);

  const canonicalFragment = makeUploadedFragment({
    id: 'frag_canon001',
    storage: {
      ...fragment.storage,
      originalPath: 'users/user_alpha/originals/batch_12345678/frag_canon001',
    },
    hashes: { ...fragment.hashes, sha256: SHA256 },
  });
  const prepopulatedSha = makeRunningFragment(task, {
    hashes: { ...fragment.hashes, sha256: SHA256 },
  });
  const existingContentHash = {
    algorithm: 'sha256',
    algorithmVersion: 'v1',
    canonicalFragmentRef: { type: 'fragment', id: canonicalFragment.id },
    fragmentCount: 1,
    createdAt: REGISTERED_AT,
    updatedAt: REGISTERED_AT,
  };

  const newlyRegistered = applyContentHashRegistration(
    UID,
    task,
    prepopulatedSha,
    existingContentHash,
    canonicalFragment,
    null,
    registration,
  );
  assert.equal(newlyRegistered.contentHash.fragmentCount, 2);
  assert.equal(newlyRegistered.exactCandidate.candidateFragmentRef.id, fragment.id);

  const noncanonicalRepeat = applyContentHashRegistration(
    UID,
    newlyRegistered.task,
    newlyRegistered.fragment,
    newlyRegistered.contentHash,
    canonicalFragment,
    newlyRegistered.exactCandidate,
    registration,
  );
  assert.equal(noncanonicalRepeat.contentHash.fragmentCount, 2);
});

test('near input cap uses exact code-unit document ID ordering', () => {
  const numericIds = Array.from(
    { length: 198 },
    (_, index) => `frag_${String(index).padStart(8, '0')}`,
  );
  const fragmentIds = [
    ...numericIds,
    'frag-A000000',
    'fragA000000',
    'frag_A000000',
    'frag_a000000',
    'fraga000000',
  ];
  const inputs = fragmentIds.map((id) => makeUploadedFragment({
    id,
    storage: {
      ...makeUploadedFragment().storage,
      originalPath: `users/${UID}/originals/batch_12345678/${id}`,
    },
    hashes: {
      sha256: SHA256,
      perceptualHash: PERCEPTUAL_HASH,
      perceptualHashAlgorithm: 'dhash',
      perceptualHashVersion: 'v1',
      perceptualHashBands: PERCEPTUAL_BANDS,
    },
  }));
  const expectedIds = [...fragmentIds]
    .sort((first, second) => (first < second ? -1 : first > second ? 1 : 0))
    .slice(0, 201);

  const matches = applyNearDuplicateInputQuery(UID, inputs, {
    fragmentId: 'frag_query001',
    bands: PERCEPTUAL_BANDS,
  });

  assert.deepEqual(matches.map(({ fragmentId }) => fragmentId), expectedIds);
  assert.equal(matches.at(-1).fragmentId, 'frag_A000000');
  assert.equal(matches.some(({ fragmentId }) => fragmentId === 'frag_a000000'), false);
  assert.equal(matches.some(({ fragmentId }) => fragmentId === 'fraga000000'), false);
});

test('terminal duplicate ignores stale mutable associations and malformed remaining fields', () => {
  const terminalTask = makeProcessingTask({
    state: 'succeeded',
    currentStep: 'complete',
    leaseOwner: null,
    leaseAcquiredAt: null,
    leaseExpiresAt: null,
    completedAt: COMPLETED_AT,
    updatedAt: COMPLETED_AT,
  });
  const newerFragment = makeRunningFragment(terminalTask, {
    processing: {
      deterministic: {
        taskId: 'task_newer001',
        processorName: 'deterministic-media',
        processorVersion: 'v2',
        state: 'running',
        metadataStatus: null,
        thumbnailStatus: null,
        perceptualHashStatus: null,
        updatedAt: '2026-07-16T00:03:00.000Z',
      },
    },
  });

  const duplicate = applyDeterministicCompletion(
    UID,
    terminalTask,
    newerFragment,
    null,
    null,
    null,
    false,
    {
      taskId: terminalTask.id,
      leaseOwner: 'malformed',
      completedAt: 'not-a-time',
      capabilityStatuses: null,
    },
  );

  assert.deepEqual(Object.keys(duplicate).sort(), ['outcome', 'task']);
  assert.equal(duplicate.outcome, 'duplicate');
  assert.deepEqual(duplicate.task, terminalTask);
  assert.deepEqual(deriveProposedNearCandidateIds(UID, terminalTask, null), []);
});

test('near candidate identity collision rejects any immutable field mismatch', () => {
  const task = makeProcessingTask();
  const fragment = makeRunningFragment(task);
  const batch = makeRunningBatch(task);
  const matchedFragment = makeUploadedFragment({
    id: 'frag_match123',
    storage: {
      ...fragment.storage,
      originalPath: 'users/user_alpha/originals/batch_12345678/frag_match123',
    },
    hashes: {
      sha256: 'b'.repeat(64),
      perceptualHash: '0000000000000001',
      perceptualHashAlgorithm: 'dhash',
      perceptualHashVersion: 'v1',
      perceptualHashBands: PERCEPTUAL_BANDS,
    },
  });
  const pairIds = [fragment.id, matchedFragment.id].sort();
  const collision = makeNearDuplicateCandidate({
    id: makeNearCandidateId({
      algorithmVersion: 'v1',
      queryFragmentId: fragment.id,
      matchedFragmentId: matchedFragment.id,
    }),
    queryFragmentRef: { type: 'fragment', id: fragment.id },
    matchedFragmentRef: { type: 'fragment', id: matchedFragment.id },
    pairRefs: pairIds.map((id) => ({ type: 'fragment', id })),
    pairKey: makePairKey(pairIds),
    distance: 2,
    rank: 1,
    createdByTaskId: task.id,
  });

  assert.throws(
    () => applyDeterministicCompletion(
      UID,
      task,
      fragment,
      batch,
      [fragment, matchedFragment],
      [collision],
      false,
      makeCompletion(task, {
        nearMatches: [{ fragmentId: matchedFragment.id, distance: 1, rank: 1 }],
      }),
    ),
    { code: 'repository/processing-target-mismatch' },
  );
});
