import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirestoreElseQueryBudget } from '../../src/else/firestore-budget.js';

function createFakeDatabase(seed = {}) {
  const documents = new Map(Object.entries(structuredClone(seed)));
  const writes = [];
  const reference = (path) => ({ path });
  const snapshot = (path) => ({
    exists: documents.has(path),
    data: () => structuredClone(documents.get(path)),
  });
  return {
    documents,
    writes,
    doc: reference,
    async runTransaction(callback) {
      const pending = [];
      const result = await callback({
        async get(ref) { return snapshot(ref.path); },
        set(ref, value) { pending.push([ref.path, structuredClone(value)]); },
      });
      for (const [path, value] of pending) {
        documents.set(path, value);
        writes.push([path, value]);
      }
      return result;
    },
  };
}

test('Else budget increments owner and project UTC-day ledgers in one transaction', async () => {
  const database = createFakeDatabase();
  const budget = createFirestoreElseQueryBudget({
    db: database,
    clock: () => '2026-07-20T23:59:59.000Z',
    ownerDailyLimit: 10,
    projectDailyLimit: 100,
  });

  assert.deepEqual(await budget.reserve('user_alpha'), {
    day: '2026-07-20',
    ownerUsed: 1,
    ownerLimit: 10,
    projectUsed: 1,
    projectLimit: 100,
  });
  assert.deepEqual(database.writes.map(([path]) => path), [
    'users/user_alpha/elseQueryBudgets/2026-07-20',
    'elseQueryBudgets/2026-07-20',
  ]);
  for (const [, value] of database.writes) {
    assert.equal(JSON.stringify(value).includes('question'), false);
    assert.equal(JSON.stringify(value).includes('source'), false);
  }
});

test('Else budget exhaustion writes neither ledger and exposes one stable error', async () => {
  const day = '2026-07-20';
  const ownerPath = `users/user_alpha/elseQueryBudgets/${day}`;
  const projectPath = `elseQueryBudgets/${day}`;
  const database = createFakeDatabase({
    [ownerPath]: {
      day, ownerId: 'user_alpha', used: 10, limit: 10, updatedAt: `${day}T10:00:00.000Z`,
    },
    [projectPath]: {
      day, used: 17, limit: 100, updatedAt: `${day}T10:00:00.000Z`,
    },
  });
  const budget = createFirestoreElseQueryBudget({
    db: database,
    clock: () => `${day}T11:00:00.000Z`,
  });

  await assert.rejects(
    budget.reserve('user_alpha'),
    (error) => error?.code === 'else/budget-exhausted'
      && error?.message === 'Else query budget is exhausted',
  );
  assert.equal(database.writes.length, 0);
  assert.equal(database.documents.get(projectPath).used, 17);
});

test('Else budget validates owner IDs and numeric limits before Firestore I/O', () => {
  const database = createFakeDatabase();
  assert.throws(() => createFirestoreElseQueryBudget({ db: database, ownerDailyLimit: 0 }));
  const budget = createFirestoreElseQueryBudget({ db: database });
  assert.rejects(() => budget.reserve('../other-user'));
  assert.equal(database.writes.length, 0);
});
