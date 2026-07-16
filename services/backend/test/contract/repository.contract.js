import test from 'node:test';
import assert from 'node:assert/strict';
import { makePendingBatch, makeUploadedFragment } from '../fixtures/import.js';

const fragment = makeUploadedFragment();
const batch = makePendingBatch();

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
}
