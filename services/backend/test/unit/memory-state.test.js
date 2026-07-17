import test from 'node:test';
import assert from 'node:assert/strict';
import * as memory from '../../src/repositories/memory.js';

const COLLECTIONS = [
  'fragments',
  'importBatches',
  'processingTasks',
  'contentHashes',
  'duplicateCandidates',
  'routePlans',
  'routingHeads',
  'routingCohorts',
  'budgetLedgers',
  'budgetReservations',
  'capabilityExecutions',
  'escalationRequests',
];

test('a preparation failure cannot partially mutate the current memory snapshot', () => {
  assert.equal(typeof memory.applyMemoryWrites, 'function');
  const state = Object.fromEntries(COLLECTIONS.map((collection) => [collection, new Map()]));
  state.fragments.set('user_alpha/frag_old0001', { id: 'frag_old0001' });
  const before = [...state.fragments.entries()];

  function* throwingWrites() {
    yield {
      collection: 'fragments',
      key: 'user_alpha/frag_new0001',
      value: { id: 'frag_new0001' },
    };
    throw new Error('preparation failed after one write');
  }

  assert.throws(
    () => memory.applyMemoryWrites(state, throwingWrites()),
    /preparation failed after one write/,
  );
  assert.deepEqual([...state.fragments.entries()], before);
  assert.equal(state.fragments.has('user_alpha/frag_new0001'), false);
});
