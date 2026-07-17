import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMemoryWrites,
  createMemoryRepository,
} from '../../src/repositories/memory.js';
import { runProcessingRepositoryContract } from './processing-repository.contract.js';
import { runRepositoryContract } from './repository.contract.js';
import { runRoutingRepositoryContract } from './routing-repository.contract.js';
import { runCapabilityRepositoryContract } from './capability-repository.contract.js';

runRepositoryContract({
  name: 'memory repository',
  createRepository: async () => createMemoryRepository(),
});

runProcessingRepositoryContract({
  name: 'memory repository',
  createRepository: async () => createMemoryRepository(),
});

runRoutingRepositoryContract({
  name: 'memory repository',
  createRepository: async () => createMemoryRepository(),
});

runCapabilityRepositoryContract({
  name: 'memory repository',
  createRepository: async () => createMemoryRepository(),
});

test('memory routing writes are copy-on-write atomic when a later write fails', () => {
  const collections = [
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
    'capabilityResults',
    'escalationRequests',
  ];
  const state = Object.fromEntries(collections.map((collection) => [collection, new Map()]));

  assert.throws(() => applyMemoryWrites(state, [
    { collection: 'routePlans', key: 'user/route', value: { state: 'approved' } },
    { collection: 'notACollection', key: 'user/head', value: {} },
  ]), TypeError);
  assert.equal(state.routePlans.size, 0);
  assert.equal(state.routingHeads.size, 0);
});
