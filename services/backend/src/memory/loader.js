import { projectMemorySnapshot } from './snapshot.js';

export function createMemorySnapshotLoader({ memorySnapshotReader } = {}) {
  if (typeof memorySnapshotReader?.readOwnerSnapshot !== 'function') {
    throw new TypeError('Memory snapshot reader must implement readOwnerSnapshot()');
  }
  return Object.freeze({
    async load(ownerId) {
      const source = await memorySnapshotReader.readOwnerSnapshot(ownerId);
      return projectMemorySnapshot({ ownerId, ...source });
    },
  });
}
