import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NOW,
  makePendingBatch,
  makeUploadItem,
  makeUploadedFragment,
} from '../fixtures/import.js';

const fragment = makeUploadedFragment();
const batch = makePendingBatch();

const finalizeInput = (overrides = {}) => ({
  batchId: batch.id,
  fragmentId: fragment.id,
  originalPath: fragment.storage.originalPath,
  generation: fragment.storage.generation,
  updatedAt: '2026-07-16T00:01:00.000Z',
  fragment,
  ...overrides,
});

const rejectInput = (overrides = {}) => ({
  batchId: batch.id,
  fragmentId: fragment.id,
  originalPath: fragment.storage.originalPath,
  generation: fragment.storage.generation,
  failureCode: 'ingestion/invalid-original',
  updatedAt: '2026-07-16T00:01:00.000Z',
  ...overrides,
});

const makeMultiItemBatch = (count) => {
  const uploads = Object.fromEntries(Array.from({ length: count }, (_, index) => {
    const fragmentId = `frag_${String(index).padStart(8, '0')}`;
    return [fragmentId, makeUploadItem({ fragmentId })];
  }));
  return makePendingBatch({ inputCount: count, uploads });
};

export function runRepositoryContract({ name, createRepository }) {
  test(`${name}: creates and returns owner-scoped objects`, async () => {
    const repository = await createRepository();
    await repository.createImportBatch('user_alpha', batch);
    await repository.createFragment('user_alpha', fragment);

    assert.deepEqual(await repository.getImportBatch('user_alpha', batch.id), batch);
    assert.deepEqual(await repository.getFragment('user_alpha', fragment.id), fragment);
  });

  test(`${name}: never returns another owner's object`, async () => {
    const repository = await createRepository();
    await repository.createFragment('user_alpha', fragment);

    assert.equal(await repository.getFragment('user_beta', fragment.id), null);
  });

  test(`${name}: rejects owner mismatch and duplicate create`, async () => {
    const repository = await createRepository();

    await assert.rejects(
      () => repository.createFragment('user_beta', fragment),
      { code: 'repository/owner-mismatch' },
    );
    await repository.createFragment('user_alpha', fragment);
    await assert.rejects(
      () => repository.createFragment('user_alpha', fragment),
      { code: 'repository/conflict' },
    );
  });

  test(`${name}: returned objects cannot mutate stored data`, async () => {
    const repository = await createRepository();
    await repository.createFragment('user_alpha', fragment);

    const returned = await repository.getFragment('user_alpha', fragment.id);
    returned.status = 'failed';

    assert.equal((await repository.getFragment('user_alpha', fragment.id)).status, 'uploaded');
  });

  test(`${name}: finalizes one original exactly once`, async () => {
    const repository = await createRepository();
    await repository.createImportBatch('user_alpha', batch);

    const applied = await repository.finalizeOriginal('user_alpha', finalizeInput());
    assert.equal(applied.outcome, 'applied');
    assert.deepEqual(applied.fragment, fragment);
    assert.equal(applied.batch.uploads[fragment.id].state, 'finalized');
    assert.equal(applied.batch.uploads[fragment.id].finalizedGeneration, fragment.storage.generation);
    assert.deepEqual(applied.batch.counters, {
      saved: 1,
      processed: 0,
      failed: 0,
      needsReview: 0,
    });
    assert.equal(applied.batch.status, 'processing');
    assert.equal(applied.batch.uploadStatus, 'complete');
    assert.deepEqual(await repository.getFragment('user_alpha', fragment.id), fragment);

    const duplicate = await repository.finalizeOriginal('user_alpha', finalizeInput());
    assert.equal(duplicate.outcome, 'duplicate');
    assert.equal(duplicate.batch.counters.saved, 1);
    assert.deepEqual(duplicate.fragment, fragment);
  });

  test(`${name}: records a permanent rejection exactly once`, async () => {
    const repository = await createRepository();
    await repository.createImportBatch('user_alpha', batch);

    const applied = await repository.rejectOriginal('user_alpha', rejectInput());
    assert.equal(applied.outcome, 'applied');
    assert.equal(applied.fragment, undefined);
    assert.equal(applied.batch.uploads[fragment.id].state, 'failed');
    assert.equal(
      applied.batch.uploads[fragment.id].failureCode,
      'ingestion/invalid-original',
    );
    assert.deepEqual(applied.batch.counters, {
      saved: 0,
      processed: 0,
      failed: 1,
      needsReview: 0,
    });
    assert.equal(applied.batch.status, 'failed');
    assert.equal(applied.batch.uploadStatus, 'complete_with_errors');
    assert.equal(await repository.getFragment('user_alpha', fragment.id), null);

    const duplicate = await repository.rejectOriginal('user_alpha', rejectInput());
    assert.equal(duplicate.outcome, 'duplicate');
    assert.equal(duplicate.batch.counters.failed, 1);
  });

  test(`${name}: derives pending and partial outcome states`, async () => {
    const repository = await createRepository();
    const multiBatch = makeMultiItemBatch(2);
    const [firstId, secondId] = Object.keys(multiBatch.uploads);
    await repository.createImportBatch('user_alpha', multiBatch);

    const firstFragment = makeUploadedFragment({
      id: firstId,
      storage: {
        ...fragment.storage,
        originalPath: multiBatch.uploads[firstId].originalPath,
        generation: 'generation-first',
      },
    });
    const pending = await repository.finalizeOriginal('user_alpha', finalizeInput({
      fragmentId: firstId,
      originalPath: firstFragment.storage.originalPath,
      generation: firstFragment.storage.generation,
      fragment: firstFragment,
    }));
    assert.equal(pending.batch.status, 'open');
    assert.equal(pending.batch.uploadStatus, 'pending');
    assert.equal(pending.batch.counters.saved, 1);

    const partial = await repository.rejectOriginal('user_alpha', rejectInput({
      fragmentId: secondId,
      originalPath: multiBatch.uploads[secondId].originalPath,
      generation: 'generation-second',
    }));
    assert.equal(partial.batch.status, 'processing');
    assert.equal(partial.batch.uploadStatus, 'complete_with_errors');
    assert.deepEqual(partial.batch.counters, {
      saved: 1,
      processed: 0,
      failed: 1,
      needsReview: 0,
    });
  });

  test(`${name}: rejects changed generation, unregistered item and wrong path`, async () => {
    const repository = await createRepository();
    await repository.createImportBatch('user_alpha', batch);
    await repository.finalizeOriginal('user_alpha', finalizeInput());

    await assert.rejects(
      () => repository.finalizeOriginal('user_alpha', finalizeInput({
        generation: 'different-generation',
        fragment: makeUploadedFragment({
          storage: { ...fragment.storage, generation: 'different-generation' },
        }),
      })),
      { code: 'repository/original-conflict' },
    );

    const fresh = await createRepository();
    await fresh.createImportBatch('user_alpha', batch);
    await assert.rejects(
      () => fresh.rejectOriginal('user_alpha', rejectInput({
        fragmentId: 'frag_87654321',
      })),
      { code: 'repository/unregistered-original' },
    );
    await assert.rejects(
      () => fresh.rejectOriginal('user_alpha', rejectInput({
        originalPath: 'users/user_alpha/originals/batch_12345678/frag_wrong000',
      })),
      { code: 'repository/unregistered-original' },
    );
    assert.equal((await fresh.getImportBatch('user_alpha', batch.id)).updatedAt, NOW);
  });

  test(`${name}: rejects owner mismatch and pre-existing Fragment without state mutation`, async () => {
    const repository = await createRepository();
    await repository.createImportBatch('user_alpha', batch);

    await assert.rejects(
      () => repository.finalizeOriginal('user_beta', finalizeInput()),
      { code: 'repository/owner-mismatch' },
    );

    await repository.createFragment('user_alpha', fragment);
    await assert.rejects(
      () => repository.finalizeOriginal('user_alpha', finalizeInput()),
      { code: 'repository/original-conflict' },
    );
    assert.equal((await repository.getImportBatch('user_alpha', batch.id)).counters.saved, 0);
  });

  test(`${name}: outcome return values cannot mutate stored batch or Fragment`, async () => {
    const repository = await createRepository();
    await repository.createImportBatch('user_alpha', batch);
    const outcome = await repository.finalizeOriginal('user_alpha', finalizeInput());

    outcome.batch.counters.saved = 20;
    outcome.fragment.status = 'failed';

    assert.equal((await repository.getImportBatch('user_alpha', batch.id)).counters.saved, 1);
    assert.equal((await repository.getFragment('user_alpha', fragment.id)).status, 'uploaded');
  });
}
