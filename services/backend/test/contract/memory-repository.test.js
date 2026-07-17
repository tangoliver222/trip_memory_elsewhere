import { createMemoryRepository } from '../../src/repositories/memory.js';
import { runProcessingRepositoryContract } from './processing-repository.contract.js';
import { runRepositoryContract } from './repository.contract.js';
import { runRoutingRepositoryContract } from './routing-repository.contract.js';

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
