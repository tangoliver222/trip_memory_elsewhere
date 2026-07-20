import { IdSchema } from '../domain/index.js';
import { ElseQueryError } from './errors.js';

const DEFAULT_OWNER_DAILY_LIMIT = 10;
const DEFAULT_PROJECT_DAILY_LIMIT = 100;

function parseLimit(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}

function parseClock(clock) {
  if (typeof clock !== 'function') throw new TypeError('Else budget clock is required');
  return clock;
}

function readUsed(snapshot, expected) {
  if (!snapshot.exists) return 0;
  const value = snapshot.data();
  if (value?.day !== expected.day
    || (expected.ownerId && value?.ownerId !== expected.ownerId)
    || !Number.isSafeInteger(value?.used)
    || value.used < 0) {
    throw new TypeError('Else budget ledger is invalid');
  }
  return value.used;
}

export function createFirestoreElseQueryBudget({
  db,
  clock = () => new Date().toISOString(),
  ownerDailyLimit = DEFAULT_OWNER_DAILY_LIMIT,
  projectDailyLimit = DEFAULT_PROJECT_DAILY_LIMIT,
} = {}) {
  if (!db || typeof db.doc !== 'function' || typeof db.runTransaction !== 'function') {
    throw new TypeError('Firestore database is required');
  }
  const now = parseClock(clock);
  const ownerLimit = parseLimit(ownerDailyLimit, 'Owner daily limit');
  const projectLimit = parseLimit(projectDailyLimit, 'Project daily limit');

  return Object.freeze({
    async reserve(ownerId) {
      const uid = IdSchema.parse(ownerId);
      const timestamp = now();
      if (typeof timestamp !== 'string'
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(timestamp)) {
        throw new TypeError('Else budget clock must return a UTC ISO timestamp');
      }
      const day = timestamp.slice(0, 10);
      const ownerRef = db.doc(`users/${uid}/elseQueryBudgets/${day}`);
      const projectRef = db.doc(`elseQueryBudgets/${day}`);

      return db.runTransaction(async (transaction) => {
        const [ownerSnapshot, projectSnapshot] = await Promise.all([
          transaction.get(ownerRef),
          transaction.get(projectRef),
        ]);
        const ownerUsed = readUsed(ownerSnapshot, { day, ownerId: uid });
        const projectUsed = readUsed(projectSnapshot, { day });
        if (ownerUsed >= ownerLimit || projectUsed >= projectLimit) {
          throw new ElseQueryError('else/budget-exhausted');
        }

        transaction.set(ownerRef, {
          day,
          ownerId: uid,
          used: ownerUsed + 1,
          limit: ownerLimit,
          updatedAt: timestamp,
        });
        transaction.set(projectRef, {
          day,
          used: projectUsed + 1,
          limit: projectLimit,
          updatedAt: timestamp,
        });
        return Object.freeze({
          day,
          ownerUsed: ownerUsed + 1,
          ownerLimit,
          projectUsed: projectUsed + 1,
          projectLimit,
        });
      });
    },
  });
}
