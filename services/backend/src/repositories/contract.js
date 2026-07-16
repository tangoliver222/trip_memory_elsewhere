const IMPORT_BATCH_METHODS = [
  'createImportBatch',
  'getImportBatch',
];

const PROCESSING_LEASE_METHODS = [
  'claimProcessingTask',
  'heartbeatProcessingTask',
  'failDeterministicProcessing',
];

const METHODS = [
  'createFragment',
  'getFragment',
  ...IMPORT_BATCH_METHODS,
  'finalizeOriginal',
  'rejectOriginal',
];

function assertMethods(repository, methods) {
  for (const method of methods) {
    if (typeof repository?.[method] !== 'function') {
      throw new TypeError(`Repository must implement ${method}()`);
    }
  }
  return repository;
}

export const assertImportBatchRepository = (repository) => (
  assertMethods(repository, IMPORT_BATCH_METHODS)
);

export const assertProcessingLeaseRepository = (repository) => (
  assertMethods(repository, PROCESSING_LEASE_METHODS)
);

export const assertRepository = (repository) => assertMethods(repository, METHODS);
