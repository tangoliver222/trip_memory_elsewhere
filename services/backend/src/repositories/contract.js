const METHODS = [
  'createFragment',
  'getFragment',
  'createImportBatch',
  'getImportBatch',
];

export function assertRepository(repository) {
  for (const method of METHODS) {
    if (typeof repository?.[method] !== 'function') {
      throw new TypeError(`Repository must implement ${method}()`);
    }
  }
  return repository;
}
