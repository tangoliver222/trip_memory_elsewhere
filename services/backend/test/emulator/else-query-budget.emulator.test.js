import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createFirestoreElseQueryBudget } from '../../src/else/firestore-budget.js';

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

test('concurrent Else reservations never exceed owner or project daily limits', {
  skip: !enabled,
  concurrency: false,
}, async (t) => {
  const app = initializeApp(
    { projectId: 'demo-elsewhere' },
    `else-query-budget-${process.pid}-${Date.now()}`,
  );
  const database = getFirestore(app);
  const day = '2099-07-20';
  const ownerId = 'user_else_budget01';
  const ownerRef = database.doc(`users/${ownerId}`);
  const projectRef = database.doc(`elseQueryBudgets/${day}`);
  await Promise.all([
    database.recursiveDelete(ownerRef),
    projectRef.delete(),
  ]);
  t.after(async () => {
    await Promise.all([
      database.recursiveDelete(ownerRef),
      projectRef.delete(),
    ]);
    await deleteApp(app);
  });

  const budget = createFirestoreElseQueryBudget({
    db: database,
    clock: () => `${day}T12:00:00.000Z`,
    ownerDailyLimit: 10,
    projectDailyLimit: 100,
  });
  const outcomes = await Promise.allSettled(
    Array.from({ length: 11 }, () => budget.reserve(ownerId)),
  );

  assert.equal(outcomes.filter(({ status }) => status === 'fulfilled').length, 10);
  assert.equal(outcomes.filter(({ status }) => status === 'rejected').length, 1);
  const [ownerLedger, projectLedger] = await Promise.all([
    database.doc(`users/${ownerId}/elseQueryBudgets/${day}`).get(),
    projectRef.get(),
  ]);
  assert.equal(ownerLedger.data().used, 10);
  assert.equal(projectLedger.data().used, 10);
});
