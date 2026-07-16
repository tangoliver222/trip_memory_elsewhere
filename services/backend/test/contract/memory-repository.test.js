import { createMemoryRepository } from '../../src/repositories/memory.js';
import { runProcessingRepositoryContract } from './processing-repository.contract.js';
import { runRepositoryContract } from './repository.contract.js';

runRepositoryContract({
  name: 'memory repository',
  createRepository: async () => createMemoryRepository(),
});

runProcessingRepositoryContract({
  name: 'memory repository',
  createRepository: async () => createMemoryRepository(),
});
