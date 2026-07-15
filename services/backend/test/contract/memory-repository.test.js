import { createMemoryRepository } from '../../src/repositories/memory.js';
import { runRepositoryContract } from './repository.contract.js';

runRepositoryContract({
  name: 'memory repository',
  createRepository: async () => createMemoryRepository(),
});
