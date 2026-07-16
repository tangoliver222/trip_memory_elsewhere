import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProcessingTaskId } from '../../src/processing/identity.js';
import {
  makePendingBatch,
  makeUploadItem,
  makeUploadedFragment,
} from '../fixtures/import.js';
import {
  SHA256,
  makePdfTechnicalMetadata,
  makeProcessingTask,
} from '../fixtures/processing.js';

const UID = 'user_alpha';
const CLAIMED_AT = '2026-07-16T00:01:00.000Z';
const SOFT_DEADLINE_AT = '2026-07-16T00:04:00.000Z';
const LEASE_EXPIRES_AT = '2026-07-16T00:05:00.000Z';
const REGISTERED_AT = '2026-07-16T00:02:00.000Z';
const COMPLETED_AT = '2026-07-16T00:03:00.000Z';
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

const fragment = makeUploadedFragment();
const batch = makePendingBatch();
const sourceRevisionFor = (fragmentInput) => ({
  bucket: fragmentInput.storage.bucket,
  objectName: fragmentInput.storage.originalPath,
  generation: fragmentInput.storage.generation,
});

function claimInputFor(fragmentInput, batchInput, overrides = {}) {
  const {
    processorName = 'deterministic-media',
    processorVersion = 'v1',
    sourceRevision = sourceRevisionFor(fragmentInput),
    taskId: taskIdOverride,
    ...claimOverrides
  } = overrides;
  const resolvedTaskId = taskIdOverride ?? makeProcessingTaskId({
    ownerId: UID,
    fragmentId: fragmentInput.id,
    processorName,
    processorVersion,
    ...sourceRevision,
  });
  return {
    taskId: resolvedTaskId,
    fragmentId: fragmentInput.id,
    batchId: batchInput.id,
    processorName,
    processorVersion,
    sourceRevision,
    leaseOwner: 'exec_first001',
    claimedAt: CLAIMED_AT,
    softDeadlineAt: SOFT_DEADLINE_AT,
    leaseExpiresAt: LEASE_EXPIRES_AT,
    ...claimOverrides,
  };
}

const claimInput = (overrides = {}) => claimInputFor(fragment, batch, overrides);
const taskId = claimInput().taskId;

const finalizeInputFor = (batchInput, fragmentInput, updatedAt) => ({
  batchId: batchInput.id,
  fragmentId: fragmentInput.id,
  originalPath: fragmentInput.storage.originalPath,
  generation: fragmentInput.storage.generation,
  updatedAt,
  fragment: fragmentInput,
});

async function createFinalizedRepository(createRepository) {
  const repository = await createRepository();
  await repository.createImportBatch(UID, batch);
  await repository.finalizeOriginal(UID, finalizeInputFor(
    batch,
    fragment,
    '2026-07-16T00:00:30.000Z',
  ));
  return repository;
}

async function createFinalizedPair(createRepository) {
  const secondFragmentId = 'frag_87654321';
  const pairBatch = makePendingBatch({
    inputCount: 2,
    uploads: {
      [fragment.id]: makeUploadItem({ fragmentId: fragment.id }),
      [secondFragmentId]: makeUploadItem({ fragmentId: secondFragmentId }),
    },
  });
  const secondFragment = makeUploadedFragment({
    id: secondFragmentId,
    storage: {
      ...fragment.storage,
      originalPath: `users/${UID}/originals/${pairBatch.id}/${secondFragmentId}`,
      generation: '1740000000000002',
    },
  });
  const repository = await createRepository();
  await repository.createImportBatch(UID, pairBatch);
  await repository.finalizeOriginal(UID, finalizeInputFor(
    pairBatch,
    fragment,
    '2026-07-16T00:00:20.000Z',
  ));
  await repository.finalizeOriginal(UID, finalizeInputFor(
    pairBatch,
    secondFragment,
    '2026-07-16T00:00:30.000Z',
  ));
  return { repository, pairBatch, secondFragment };
}

function registrationInputFor(claim, overrides = {}) {
  return {
    taskId: claim.taskId,
    leaseOwner: claim.leaseOwner,
    registeredAt: REGISTERED_AT,
    sha256: SHA256,
    ...overrides,
  };
}

function makeJpegTechnicalMetadata(overrides = {}) {
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
    ...overrides,
  };
}

function successfulCompletionInput(claim, overrides = {}) {
  return {
    taskId: claim.taskId,
    leaseOwner: claim.leaseOwner,
    completedAt: COMPLETED_AT,
    technicalMetadata: makeJpegTechnicalMetadata(),
    factSuggestions: {},
    derivative: {
      path: `users/${UID}/derived/${claim.fragmentId}/deterministic-media/v1/${SHA256}/thumbnail.webp`,
      generation: '1740000000000100',
      metageneration: '1',
      contentType: 'image/webp',
      sizeBytes: 48_291,
      crc32c: 'ImIEBA==',
      width: 512,
      height: 384,
    },
    perceptualHash: {
      value: PERCEPTUAL_HASH,
      bands: PERCEPTUAL_BANDS,
    },
    capabilityStatuses: {
      metadata: 'complete',
      thumbnail: 'complete',
      perceptualHash: 'complete',
    },
    warningCodes: [],
    nearMatches: [],
    ...overrides,
  };
}

function terminalFailureInput(claim, overrides = {}) {
  return {
    taskId: claim.taskId,
    leaseOwner: claim.leaseOwner,
    completedAt: COMPLETED_AT,
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
    ...overrides,
  };
}

function makeSuggestedFact({ key, value, observedAt = COMPLETED_AT }) {
  return {
    value,
    sourceType: key === 'capturedAt' ? 'exif' : 'gps',
    sourceRefs: [{ type: 'fragment', id: fragment.id }],
    processor: {
      name: 'deterministic-media',
      version: 'v1',
      modelAlias: null,
      promptVersion: null,
    },
    confidence: 0.9,
    status: 'suggested',
    observedAt,
  };
}

const expectedRunningSummary = (updatedAt = CLAIMED_AT) => ({
  deterministic: {
    processorName: 'deterministic-media',
    processorVersion: 'v1',
    eligible: 1,
    running: 1,
    succeeded: 0,
    failedRetryable: 0,
    failedTerminal: 0,
    unsupportedCapabilities: 0,
    updatedAt,
  },
});

export function runProcessingRepositoryContract({ name, createRepository }) {
  test(`${name}: creates and claims one versioned processing task`, async () => {
    const repository = await createFinalizedRepository(createRepository);

    for (const mismatch of [
      { processorName: 'other-media' },
      { processorVersion: 'v2' },
      { sourceRevision: { ...claimInput().sourceRevision, bucket: 'other.appspot.com' } },
      { sourceRevision: { ...claimInput().sourceRevision, objectName: `${fragment.storage.originalPath}-other` } },
      { sourceRevision: { ...claimInput().sourceRevision, generation: '1740000000000002' } },
      { taskId: 'task_wrong0001' },
      { batchId: 'batch_wrong0001' },
    ]) {
      await assert.rejects(
        () => repository.claimProcessingTask(UID, claimInput(mismatch)),
        { code: 'repository/processing-target-mismatch' },
      );
    }

    const unlinkedBatchId = 'batch_link0001';
    const manifestFragmentId = 'frag_manifest01';
    const unlinkedFragmentId = 'frag_unlinked1';
    const unlinkedBatch = makePendingBatch({
      id: unlinkedBatchId,
      status: 'processing',
      uploadStatus: 'complete',
      counters: { saved: 1, processed: 0, failed: 0, needsReview: 0 },
      uploads: {
        [manifestFragmentId]: makeUploadItem({
          batchId: unlinkedBatchId,
          fragmentId: manifestFragmentId,
          state: 'finalized',
          finalizedGeneration: 'manifest-generation',
        }),
      },
    });
    const unlinkedFragment = makeUploadedFragment({
      id: unlinkedFragmentId,
      batchId: unlinkedBatchId,
      storage: {
        ...fragment.storage,
        originalPath: `users/${UID}/originals/${unlinkedBatchId}/${unlinkedFragmentId}`,
      },
    });
    const unlinkedRepository = await createRepository();
    await unlinkedRepository.createImportBatch(UID, unlinkedBatch);
    await unlinkedRepository.createFragment(UID, unlinkedFragment);
    await assert.rejects(
      () => unlinkedRepository.claimProcessingTask(
        UID,
        claimInputFor(unlinkedFragment, unlinkedBatch),
      ),
      { code: 'repository/processing-target-mismatch' },
    );

    const claimed = await repository.claimProcessingTask(UID, claimInput());

    assert.equal(claimed.outcome, 'claimed');
    assert.deepEqual(claimed.task, {
      id: taskId,
      ownerId: UID,
      schemaVersion: 1,
      fragmentId: fragment.id,
      batchId: batch.id,
      processorName: 'deterministic-media',
      processorVersion: 'v1',
      sourceRevision: {
        bucket: fragment.storage.bucket,
        objectName: fragment.storage.originalPath,
        generation: fragment.storage.generation,
      },
      inputHash: null,
      state: 'running',
      currentStep: 'hashing',
      leaseOwner: 'exec_first001',
      attemptCount: 1,
      outputs: {
        metadataStatus: null,
        thumbnailStatus: null,
        perceptualHashStatus: null,
        warningCodes: [],
      },
      lastErrorCode: null,
      createdAt: CLAIMED_AT,
      updatedAt: CLAIMED_AT,
      firstStartedAt: CLAIMED_AT,
      attemptStartedAt: CLAIMED_AT,
      lastHeartbeatAt: CLAIMED_AT,
      softDeadlineAt: SOFT_DEADLINE_AT,
      leaseAcquiredAt: CLAIMED_AT,
      leaseExpiresAt: LEASE_EXPIRES_AT,
      completedAt: null,
      deletedAt: null,
    });
    assert.equal(claimed.fragment.status, 'processing');
    assert.deepEqual(claimed.fragment.processing.deterministic, {
      taskId,
      processorName: 'deterministic-media',
      processorVersion: 'v1',
      state: 'running',
      metadataStatus: null,
      thumbnailStatus: null,
      perceptualHashStatus: null,
      updatedAt: CLAIMED_AT,
    });
    assert.deepEqual(claimed.batch.processingSummary, expectedRunningSummary());
    assert.deepEqual(claimed.batch.counters, {
      saved: 1,
      processed: 0,
      failed: 0,
      needsReview: 0,
    });
    assert.equal(claimed.batch.uploads[fragment.id].state, 'finalized');

    const repeated = await repository.claimProcessingTask(UID, claimInput());
    assert.equal(repeated.outcome, 'busy');
    assert.deepEqual(repeated.task, claimed.task);
    assert.notEqual(repeated.task, claimed.task);
    assert.equal(Object.isFrozen(claimed.task), true);
    assert.equal(Object.isFrozen(claimed.task.sourceRevision), true);
    assert.throws(() => {
      claimed.task.attemptCount = 99;
    }, TypeError);
    assert.throws(() => {
      claimed.fragment.status = 'failed';
    }, TypeError);
    assert.throws(() => {
      claimed.batch.counters.saved = 99;
    }, TypeError);
    const storedFragment = await repository.getFragment(UID, fragment.id);
    const storedBatch = await repository.getImportBatch(UID, batch.id);
    assert.equal(storedFragment.status, 'processing');
    assert.deepEqual(storedFragment.processing, claimed.fragment.processing);
    assert.deepEqual(storedBatch.processingSummary, expectedRunningSummary());
    assert.deepEqual(storedBatch.counters, {
      saved: 1,
      processed: 0,
      failed: 0,
      needsReview: 0,
    });
  });

  test(`${name}: an active lease is busy and cannot be stolen`, async () => {
    const repository = await createFinalizedRepository(createRepository);
    await repository.claimProcessingTask(UID, claimInput());

    const busy = await repository.claimProcessingTask(UID, claimInput({
      leaseOwner: 'exec_second01',
      claimedAt: '2026-07-16T00:02:00.000Z',
      softDeadlineAt: '2026-07-16T00:05:30.000Z',
      leaseExpiresAt: '2026-07-16T00:06:00.000Z',
    }));

    assert.equal(busy.outcome, 'busy');
    assert.equal(busy.task.leaseOwner, 'exec_first001');
    assert.equal(busy.task.attemptCount, 1);
    assert.equal(busy.fragment, undefined);
    assert.equal(busy.batch, undefined);
  });

  test(`${name}: an expired lease is reclaimed with attemptCount plus one`, async () => {
    const repository = await createFinalizedRepository(createRepository);
    await repository.claimProcessingTask(UID, claimInput());

    const reclaimed = await repository.claimProcessingTask(UID, claimInput({
      leaseOwner: 'exec_second01',
      claimedAt: LEASE_EXPIRES_AT,
      softDeadlineAt: '2026-07-16T00:08:00.000Z',
      leaseExpiresAt: '2026-07-16T00:09:00.000Z',
    }));

    assert.equal(reclaimed.outcome, 'claimed');
    assert.equal(reclaimed.task.leaseOwner, 'exec_second01');
    assert.equal(reclaimed.task.attemptCount, 2);
    assert.equal(reclaimed.task.firstStartedAt, CLAIMED_AT);
    assert.equal(reclaimed.task.attemptStartedAt, LEASE_EXPIRES_AT);
    assert.equal(reclaimed.task.leaseExpiresAt, '2026-07-16T00:09:00.000Z');
    assert.deepEqual(reclaimed.batch.processingSummary, expectedRunningSummary(LEASE_EXPIRES_AT));
  });

  test(`${name}: only the current lease owner can heartbeat or transition`, async () => {
    const repository = await createFinalizedRepository(createRepository);
    await repository.claimProcessingTask(UID, claimInput());

    await assert.rejects(
      () => repository.heartbeatProcessingTask(UID, {
        taskId,
        leaseOwner: 'exec_second01',
        heartbeatAt: '2026-07-16T00:02:00.000Z',
        currentStep: 'metadata',
        leaseExpiresAt: '2026-07-16T00:06:00.000Z',
      }),
      { code: 'repository/lease-owner-mismatch' },
    );
    await assert.rejects(
      () => repository.failDeterministicProcessing(UID, {
        taskId,
        leaseOwner: 'exec_second01',
        failedAt: '2026-07-16T00:02:00.000Z',
        errorCode: 'processing/storage-unavailable',
      }),
      { code: 'repository/lease-owner-mismatch' },
    );

    const exactExpiryWithOffset = '2026-07-15T19:05:00.000-05:00';
    const afterExpiryButLexicallyEarlier = '2026-07-15T19:05:00.001-05:00';
    assert.equal(Date.parse(exactExpiryWithOffset), Date.parse(LEASE_EXPIRES_AT));
    assert.equal(afterExpiryButLexicallyEarlier < LEASE_EXPIRES_AT, true);
    assert.equal(
      Date.parse(afterExpiryButLexicallyEarlier) > Date.parse(LEASE_EXPIRES_AT),
      true,
    );
    for (const expiredAt of [exactExpiryWithOffset, afterExpiryButLexicallyEarlier]) {
      await assert.rejects(
        () => repository.heartbeatProcessingTask(UID, {
          taskId,
          leaseOwner: 'exec_first001',
          heartbeatAt: expiredAt,
          currentStep: 'metadata',
          leaseExpiresAt: '2026-07-16T00:06:00.000Z',
        }),
        { code: 'repository/lease-owner-mismatch' },
      );
      await assert.rejects(
        () => repository.failDeterministicProcessing(UID, {
          taskId,
          leaseOwner: 'exec_first001',
          failedAt: expiredAt,
          errorCode: 'processing/storage-unavailable',
        }),
        { code: 'repository/lease-owner-mismatch' },
      );
    }

    const heartbeat = await repository.heartbeatProcessingTask(UID, {
      taskId,
      leaseOwner: 'exec_first001',
      heartbeatAt: '2026-07-16T00:02:00.000Z',
      currentStep: 'metadata',
      leaseExpiresAt: '2026-07-16T00:06:00.000Z',
    });
    assert.equal(heartbeat.task.currentStep, 'metadata');
    assert.equal(heartbeat.task.lastHeartbeatAt, '2026-07-16T00:02:00.000Z');
    assert.equal(heartbeat.task.leaseExpiresAt, '2026-07-16T00:06:00.000Z');
    assert.equal(heartbeat.task.attemptCount, 1);
    assert.equal(Object.isFrozen(heartbeat.task), true);
  });

  test(`${name}: retryable failure releases lease and moves summary exactly once`, async () => {
    const secondFragmentId = 'frag_87654321';
    const twoFragmentBatch = makePendingBatch({
      inputCount: 2,
      uploads: {
        [fragment.id]: makeUploadItem({ fragmentId: fragment.id }),
        [secondFragmentId]: makeUploadItem({ fragmentId: secondFragmentId }),
      },
    });
    const secondFragment = makeUploadedFragment({
      id: secondFragmentId,
      storage: {
        ...fragment.storage,
        originalPath: `users/${UID}/originals/${twoFragmentBatch.id}/${secondFragmentId}`,
        generation: '1740000000000002',
      },
    });
    const repository = await createRepository();
    await repository.createImportBatch(UID, twoFragmentBatch);
    await repository.finalizeOriginal(UID, finalizeInputFor(
      twoFragmentBatch,
      fragment,
      '2026-07-16T00:00:20.000Z',
    ));
    await repository.finalizeOriginal(UID, finalizeInputFor(
      twoFragmentBatch,
      secondFragment,
      '2026-07-16T00:00:30.000Z',
    ));

    const firstClaimInput = claimInputFor(fragment, twoFragmentBatch);
    await repository.claimProcessingTask(UID, firstClaimInput);
    const secondClaimedAt = '2026-07-16T00:01:10.000Z';
    const secondClaim = await repository.claimProcessingTask(UID, claimInputFor(
      secondFragment,
      twoFragmentBatch,
      {
        leaseOwner: 'exec_second01',
        claimedAt: secondClaimedAt,
        softDeadlineAt: '2026-07-16T00:04:10.000Z',
        leaseExpiresAt: '2026-07-16T00:05:10.000Z',
      },
    ));
    assert.deepEqual(secondClaim.batch.processingSummary, {
      deterministic: {
        ...expectedRunningSummary(secondClaimedAt).deterministic,
        eligible: 2,
        running: 2,
      },
    });

    const failureInput = {
      taskId: firstClaimInput.taskId,
      leaseOwner: 'exec_first001',
      failedAt: '2026-07-16T00:02:00.000Z',
      errorCode: 'processing/storage-unavailable',
    };

    const applied = await repository.failDeterministicProcessing(UID, failureInput);
    assert.equal(applied.outcome, 'applied');
    assert.equal(applied.task.state, 'failed_retryable');
    assert.equal(applied.task.leaseOwner, null);
    assert.equal(applied.task.leaseAcquiredAt, null);
    assert.equal(applied.task.leaseExpiresAt, null);
    assert.equal(applied.task.lastErrorCode, 'processing/storage-unavailable');
    assert.equal(applied.task.completedAt, null);
    assert.deepEqual(applied.batch.processingSummary, {
      deterministic: {
        ...expectedRunningSummary().deterministic,
        eligible: 2,
        running: 1,
        failedRetryable: 1,
        updatedAt: failureInput.failedAt,
      },
    });
    assert.deepEqual(applied.batch.counters, {
      saved: 2,
      processed: 0,
      failed: 0,
      needsReview: 0,
    });

    const repeated = await repository.failDeterministicProcessing(UID, failureInput);
    assert.equal(repeated.outcome, 'duplicate');
    assert.deepEqual(repeated.task, applied.task);
    assert.deepEqual(repeated.batch, applied.batch);
    assert.notEqual(repeated.batch, applied.batch);
    assert.equal(Object.isFrozen(repeated.batch.processingSummary.deterministic), true);

    const reclaimedAt = '2026-07-16T00:03:00.000Z';
    const reclaimed = await repository.claimProcessingTask(UID, claimInputFor(
      fragment,
      twoFragmentBatch,
      {
        leaseOwner: 'exec_third001',
        claimedAt: reclaimedAt,
        softDeadlineAt: '2026-07-16T00:06:00.000Z',
        leaseExpiresAt: '2026-07-16T00:07:00.000Z',
      },
    ));
    assert.equal(reclaimed.task.attemptCount, 2);
    assert.deepEqual(reclaimed.batch.processingSummary, {
      deterministic: {
        ...expectedRunningSummary(reclaimedAt).deterministic,
        eligible: 2,
        running: 2,
      },
    });
    assert.deepEqual(reclaimed.batch.counters, {
      saved: 2,
      processed: 0,
      failed: 0,
      needsReview: 0,
    });
  });

  test(`${name}: concurrent equal hashes select one owner-scoped canonical`, async () => {
    const { repository, pairBatch, secondFragment } = await createFinalizedPair(createRepository);
    const firstClaim = claimInputFor(fragment, pairBatch);
    const secondClaim = claimInputFor(secondFragment, pairBatch, {
      leaseOwner: 'exec_second01',
      claimedAt: '2026-07-16T00:01:10.000Z',
      softDeadlineAt: '2026-07-16T00:04:10.000Z',
      leaseExpiresAt: '2026-07-16T00:05:10.000Z',
    });
    await repository.claimProcessingTask(UID, firstClaim);
    await repository.claimProcessingTask(UID, secondClaim);

    const registrations = await Promise.all([
      repository.registerContentHash(UID, registrationInputFor(firstClaim)),
      repository.registerContentHash(UID, registrationInputFor(secondClaim)),
    ]);

    assert.deepEqual(registrations[0].canonicalFragmentRef,
      registrations[1].canonicalFragmentRef);
    assert.equal(registrations.filter(({ exactCandidate }) => exactCandidate !== null).length, 1);
    const exactCandidate = registrations.find(({ exactCandidate }) => exactCandidate)?.exactCandidate;
    const canonicalId = registrations[0].canonicalFragmentRef.id;
    const candidateId = canonicalId === fragment.id ? secondFragment.id : fragment.id;
    assert.equal(exactCandidate.canonicalFragmentRef.id, canonicalId);
    assert.equal(exactCandidate.candidateFragmentRef.id, candidateId);
    assert.deepEqual(exactCandidate.pairRefs.map(({ id }) => id),
      [fragment.id, secondFragment.id].sort());
    assert.equal((await repository.getFragment(UID, fragment.id)).hashes.sha256, SHA256);
    assert.equal((await repository.getFragment(UID, secondFragment.id)).hashes.sha256, SHA256);
    assert.equal((await repository.getImportBatch(UID, pairBatch.id)).counters.saved, 2);
  });

  test(`${name}: repeated hash registration does not increment fragmentCount`, async () => {
    const repository = await createFinalizedRepository(createRepository);
    const claim = claimInput();
    await repository.claimProcessingTask(UID, claim);

    const first = await repository.registerContentHash(UID, registrationInputFor(claim));
    const repeated = await repository.registerContentHash(UID, registrationInputFor(claim));

    assert.deepEqual(repeated, first);
    assert.deepEqual(first, {
      canonicalFragmentRef: { type: 'fragment', id: fragment.id },
      exactCandidate: null,
    });
    assert.equal((await repository.getFragment(UID, fragment.id)).hashes.sha256, SHA256);
  });

  test(`${name}: near inputs are owner scoped deduplicated and document-id ordered`, async () => {
    const repository = await createRepository();
    const matchingFragments = [
      ['frag_match002', '0000000000000002'],
      ['frag_match001', '0000000000000001'],
      ['frag_query001', PERCEPTUAL_HASH],
    ].map(([id, perceptualHash]) => makeUploadedFragment({
      id,
      hashes: {
        sha256: SHA256,
        perceptualHash,
        perceptualHashAlgorithm: 'dhash',
        perceptualHashVersion: 'v1',
        perceptualHashBands: PERCEPTUAL_BANDS,
      },
      storage: {
        ...fragment.storage,
        originalPath: `users/${UID}/originals/${batch.id}/${id}`,
      },
    }));
    for (const matchingFragment of matchingFragments) {
      await repository.createFragment(UID, matchingFragment);
    }
    await repository.createFragment('user_beta', makeUploadedFragment({
      id: 'frag_cross001',
      ownerId: 'user_beta',
      batchId: 'batch_beta0001',
      storage: {
        ...fragment.storage,
        originalPath: 'users/user_beta/originals/batch_beta0001/frag_cross001',
      },
      hashes: {
        sha256: SHA256,
        perceptualHash: '0000000000000003',
        perceptualHashAlgorithm: 'dhash',
        perceptualHashVersion: 'v1',
        perceptualHashBands: PERCEPTUAL_BANDS,
      },
    }));

    const inputs = await repository.findNearDuplicateInputs(UID, {
      fragmentId: 'frag_query001',
      bands: PERCEPTUAL_BANDS,
    });

    assert.deepEqual(inputs, [
      { fragmentId: 'frag_match001', perceptualHash: '0000000000000001' },
      { fragmentId: 'frag_match002', perceptualHash: '0000000000000002' },
    ]);
  });

  test(`${name}: success atomically persists task fragment candidates and batch`, async () => {
    const repository = await createFinalizedRepository(createRepository);
    const claim = claimInput();
    await repository.claimProcessingTask(UID, claim);
    await repository.registerContentHash(UID, registrationInputFor(claim));
    const matchedFragment = makeUploadedFragment({
      id: 'frag_match001',
      hashes: {
        sha256: 'b'.repeat(64),
        perceptualHash: '0000000000000001',
        perceptualHashAlgorithm: 'dhash',
        perceptualHashVersion: 'v1',
        perceptualHashBands: PERCEPTUAL_BANDS,
      },
      storage: {
        ...fragment.storage,
        originalPath: `users/${UID}/originals/${batch.id}/frag_match001`,
      },
    });
    await repository.createFragment(UID, matchedFragment);
    const completion = successfulCompletionInput(claim, {
      nearMatches: [{ fragmentId: matchedFragment.id, distance: 1, rank: 1 }],
    });

    const applied = await repository.completeDeterministicProcessing(UID, completion);

    assert.equal(applied.outcome, 'applied');
    assert.equal(applied.task.state, 'succeeded');
    assert.equal(applied.task.currentStep, 'complete');
    assert.equal(applied.task.leaseOwner, null);
    assert.deepEqual(applied.task.outputs, {
      metadataStatus: 'complete',
      thumbnailStatus: 'complete',
      perceptualHashStatus: 'complete',
      warningCodes: [],
    });
    assert.equal(applied.fragment.status, 'unresolved');
    assert.deepEqual(applied.fragment.technicalMetadata, completion.technicalMetadata);
    assert.deepEqual(applied.fragment.derivatives.thumbnail, completion.derivative);
    assert.equal(applied.fragment.hashes.perceptualHash, PERCEPTUAL_HASH);
    assert.equal(applied.candidates.length, 1);
    assert.equal(applied.candidates[0].queryFragmentRef.id, fragment.id);
    assert.equal(applied.candidates[0].matchedFragmentRef.id, matchedFragment.id);
    assert.equal(applied.candidates[0].rank, 1);
    assert.deepEqual(applied.batch.processingSummary.deterministic, {
      processorName: 'deterministic-media',
      processorVersion: 'v1',
      eligible: 1,
      running: 0,
      succeeded: 1,
      failedRetryable: 0,
      failedTerminal: 0,
      unsupportedCapabilities: 0,
      updatedAt: COMPLETED_AT,
    });
    assert.deepEqual(applied.batch.counters, {
      saved: 1,
      processed: 1,
      failed: 0,
      needsReview: 1,
    });
    assert.equal(applied.batch.status, 'completed');
    assert.deepEqual(await repository.getFragment(UID, fragment.id), applied.fragment);
    assert.deepEqual(await repository.getImportBatch(UID, batch.id), applied.batch);
  });

  test(`${name}: terminal failure is distinct from upload failure`, async () => {
    const rejectedFragmentId = 'frag_reject001';
    const mixedBatch = makePendingBatch({
      inputCount: 2,
      uploads: {
        [fragment.id]: makeUploadItem({ fragmentId: fragment.id }),
        [rejectedFragmentId]: makeUploadItem({ fragmentId: rejectedFragmentId }),
      },
    });
    const repository = await createRepository();
    await repository.createImportBatch(UID, mixedBatch);
    await repository.finalizeOriginal(UID, finalizeInputFor(
      mixedBatch,
      fragment,
      '2026-07-16T00:00:20.000Z',
    ));
    await repository.rejectOriginal(UID, {
      batchId: mixedBatch.id,
      fragmentId: rejectedFragmentId,
      originalPath: mixedBatch.uploads[rejectedFragmentId].originalPath,
      generation: '1740000000000999',
      failureCode: 'ingestion/invalid-original',
      updatedAt: '2026-07-16T00:00:30.000Z',
    });
    const claim = claimInputFor(fragment, mixedBatch);
    await repository.claimProcessingTask(UID, claim);
    await repository.registerContentHash(UID, registrationInputFor(claim));

    const applied = await repository.completeDeterministicProcessing(
      UID,
      terminalFailureInput(claim),
    );

    assert.equal(applied.task.state, 'failed_terminal');
    assert.equal(applied.fragment.status, 'failed');
    assert.equal(applied.batch.processingSummary.deterministic.failedTerminal, 1);
    assert.equal(applied.batch.uploads[fragment.id].state, 'finalized');
    assert.equal(applied.batch.uploads[rejectedFragmentId].state, 'failed');
    assert.deepEqual(applied.batch.counters, {
      saved: 1,
      processed: 0,
      failed: 2,
      needsReview: 0,
    });
    assert.equal(applied.batch.status, 'completed_with_errors');
  });

  test(`${name}: unsupported capabilities do not increment failed`, async () => {
    const repository = await createFinalizedRepository(createRepository);
    const claim = claimInput();
    await repository.claimProcessingTask(UID, claim);
    await repository.registerContentHash(UID, registrationInputFor(claim));

    const applied = await repository.completeDeterministicProcessing(UID, successfulCompletionInput(
      claim,
      {
        technicalMetadata: makePdfTechnicalMetadata(),
        derivative: null,
        perceptualHash: null,
        capabilityStatuses: {
          metadata: 'partial',
          thumbnail: 'unsupported',
          perceptualHash: 'unsupported',
        },
        warningCodes: ['processing/page-count-unsupported'],
      },
    ));

    assert.equal(applied.task.state, 'succeeded');
    assert.equal(applied.batch.processingSummary.deterministic.unsupportedCapabilities, 2);
    assert.equal(applied.batch.processingSummary.deterministic.succeeded, 1);
    assert.equal(applied.batch.counters.processed, 1);
    assert.equal(applied.batch.counters.failed, 0);
    assert.equal(applied.batch.status, 'completed');
  });

  test(`${name}: suggested time and GPS never overwrite user or other-source facts`, async () => {
    const userCapturedAt = {
      value: '2026-07-12T10:22:14.000Z',
      sourceType: 'user',
      sourceRefs: [{ type: 'fragment', id: fragment.id }],
      processor: {
        name: 'manual-entry',
        version: 'v1',
        modelAlias: null,
        promptVersion: null,
      },
      confidence: 1,
      status: 'confirmed',
      observedAt: '2026-07-16T00:00:10.000Z',
    };
    const correctedGeo = {
      value: { lat: 13.7563, lng: 100.5018 },
      sourceType: 'places',
      sourceRefs: [{ type: 'fragment', id: fragment.id }],
      processor: {
        name: 'place-resolution',
        version: 'v3',
        modelAlias: null,
        promptVersion: null,
      },
      confidence: 1,
      status: 'corrected',
      observedAt: '2026-07-16T00:00:10.000Z',
    };
    const protectedFragment = makeUploadedFragment({
      facts: { capturedAt: userCapturedAt, geo: correctedGeo },
    });
    const repository = await createRepository();
    await repository.createImportBatch(UID, batch);
    await repository.finalizeOriginal(UID, finalizeInputFor(
      batch,
      protectedFragment,
      '2026-07-16T00:00:30.000Z',
    ));
    const claim = claimInput();
    await repository.claimProcessingTask(UID, claim);
    await repository.registerContentHash(UID, registrationInputFor(claim));
    const sourceBefore = structuredClone(protectedFragment.source);

    const applied = await repository.completeDeterministicProcessing(UID, successfulCompletionInput(
      claim,
      {
        factSuggestions: {
          capturedAt: makeSuggestedFact({
            key: 'capturedAt',
            value: '2026-07-11T03:22:14.000Z',
          }),
          geo: makeSuggestedFact({
            key: 'geo',
            value: { lat: 35.6764, lng: 139.65 },
          }),
        },
      },
    ));

    assert.deepEqual(applied.fragment.facts, {
      capturedAt: userCapturedAt,
      geo: correctedGeo,
    });
    assert.deepEqual(applied.fragment.source, sourceBefore);
    assert.deepEqual(applied.task.outputs.warningCodes, ['processing/fact-conflict']);
  });

  test(`${name}: a late old processor version cannot mutate the active summary`, async () => {
    const activeSummary = {
      deterministic: {
        processorName: 'deterministic-media',
        processorVersion: 'v2',
        eligible: 1,
        running: 0,
        succeeded: 1,
        failedRetryable: 0,
        failedTerminal: 0,
        unsupportedCapabilities: 0,
        updatedAt: '2026-07-16T00:00:10.000Z',
      },
    };
    const finalizedUpload = makeUploadItem({
      state: 'finalized',
      finalizedGeneration: fragment.storage.generation,
      failureCode: null,
    });
    const futureBatch = makePendingBatch({
      status: 'completed',
      uploadStatus: 'complete',
      counters: { saved: 1, processed: 1, failed: 0, needsReview: 1 },
      processingSummary: activeSummary,
      uploads: { [fragment.id]: finalizedUpload },
    });
    const repository = await createRepository();
    await repository.createImportBatch(UID, futureBatch);
    await repository.createFragment(UID, fragment);
    const oldClaim = claimInput();
    await repository.claimProcessingTask(UID, oldClaim);
    await repository.registerContentHash(UID, registrationInputFor(oldClaim));
    const before = await repository.getImportBatch(UID, futureBatch.id);

    const applied = await repository.completeDeterministicProcessing(
      UID,
      successfulCompletionInput(oldClaim),
    );

    assert.equal(applied.task.processorVersion, 'v1');
    assert.deepEqual(applied.batch.processingSummary, before.processingSummary);
    assert.deepEqual(applied.batch.counters, before.counters);
  });

  test(`${name}: repeating terminal completion is a no-op`, async () => {
    const repository = await createFinalizedRepository(createRepository);
    const claim = claimInput();
    await repository.claimProcessingTask(UID, claim);
    await repository.registerContentHash(UID, registrationInputFor(claim));
    const completion = successfulCompletionInput(claim);

    const applied = await repository.completeDeterministicProcessing(UID, completion);
    const repeated = await repository.completeDeterministicProcessing(UID, completion);

    assert.equal(applied.outcome, 'applied');
    assert.equal(repeated.outcome, 'duplicate');
    assert.deepEqual(repeated.task, applied.task);
    assert.equal(repeated.fragment, undefined);
    assert.equal(repeated.batch, undefined);
    assert.equal(repeated.candidates, undefined);
    assert.deepEqual((await repository.getImportBatch(UID, batch.id)).counters, {
      saved: 1,
      processed: 1,
      failed: 0,
      needsReview: 0,
    });
  });

  test(`${name}: terminal tasks are claim no-ops`, async () => {
    const { applyProcessingClaim } = await import(
      '../../src/repositories/processing-outcome.js'
    );
    for (const state of ['succeeded', 'failed_terminal']) {
      const completedAt = '2026-07-16T00:03:00.000Z';
      const terminalTask = makeProcessingTask({
        id: taskId,
        state,
        currentStep: 'complete',
        leaseOwner: null,
        leaseAcquiredAt: null,
        leaseExpiresAt: null,
        completedAt,
        updatedAt: completedAt,
        lastErrorCode: state === 'failed_terminal' ? 'processing/invalid-media' : null,
      });
      const terminal = applyProcessingClaim(UID, terminalTask, null, null, claimInput({
        claimedAt: '2026-07-16T00:04:00.000Z',
        softDeadlineAt: '2026-07-16T00:07:00.000Z',
        leaseExpiresAt: '2026-07-16T00:08:00.000Z',
      }));

      assert.equal(terminal.outcome, 'terminal');
      assert.deepEqual(terminal.task, terminalTask);
      assert.equal(terminal.fragment, undefined);
      assert.equal(terminal.batch, undefined);
      assert.notEqual(terminal.task, terminalTask);
    }
  });
}
