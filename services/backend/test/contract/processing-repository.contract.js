import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProcessingTaskId } from '../../src/processing/identity.js';
import { makePendingBatch, makeUploadedFragment } from '../fixtures/import.js';
import { makeProcessingTask } from '../fixtures/processing.js';

const UID = 'user_alpha';
const CLAIMED_AT = '2026-07-16T00:01:00.000Z';
const SOFT_DEADLINE_AT = '2026-07-16T00:04:00.000Z';
const LEASE_EXPIRES_AT = '2026-07-16T00:05:00.000Z';

const fragment = makeUploadedFragment();
const batch = makePendingBatch();
const taskId = makeProcessingTaskId({
  ownerId: UID,
  fragmentId: fragment.id,
  processorName: 'deterministic-media',
  processorVersion: 'v1',
  bucket: fragment.storage.bucket,
  objectName: fragment.storage.originalPath,
  generation: fragment.storage.generation,
});

const claimInput = (overrides = {}) => ({
  taskId,
  fragmentId: fragment.id,
  batchId: batch.id,
  processorName: 'deterministic-media',
  processorVersion: 'v1',
  sourceRevision: {
    bucket: fragment.storage.bucket,
    objectName: fragment.storage.originalPath,
    generation: fragment.storage.generation,
  },
  leaseOwner: 'exec_first001',
  claimedAt: CLAIMED_AT,
  softDeadlineAt: SOFT_DEADLINE_AT,
  leaseExpiresAt: LEASE_EXPIRES_AT,
  ...overrides,
});

const finalizeInput = () => ({
  batchId: batch.id,
  fragmentId: fragment.id,
  originalPath: fragment.storage.originalPath,
  generation: fragment.storage.generation,
  updatedAt: '2026-07-16T00:00:30.000Z',
  fragment,
});

async function createFinalizedRepository(createRepository) {
  const repository = await createRepository();
  await repository.createImportBatch(UID, batch);
  await repository.finalizeOriginal(UID, finalizeInput());
  return repository;
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
    ]) {
      await assert.rejects(
        () => repository.claimProcessingTask(UID, claimInput(mismatch)),
        { code: 'repository/processing-target-mismatch' },
      );
    }

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
    assert.equal((await repository.getFragment(UID, fragment.id)).status, 'processing');
    assert.deepEqual(
      (await repository.getImportBatch(UID, batch.id)).processingSummary,
      expectedRunningSummary(),
    );
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
    const repository = await createFinalizedRepository(createRepository);
    await repository.claimProcessingTask(UID, claimInput());
    const failureInput = {
      taskId,
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
    assert.deepEqual(applied.batch.processingSummary, {
      deterministic: {
        ...expectedRunningSummary().deterministic,
        running: 0,
        failedRetryable: 1,
        updatedAt: failureInput.failedAt,
      },
    });
    assert.deepEqual(applied.batch.counters, {
      saved: 1,
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
