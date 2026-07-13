export function createCleanupRegistry() {
  const cleanups = new Set();
  return {
    add(cleanup) {
      if (typeof cleanup === 'function') cleanups.add(cleanup);
      return cleanup;
    },
    flush() {
      cleanups.forEach((cleanup) => cleanup());
      cleanups.clear();
    },
    get size() {
      return cleanups.size;
    },
  };
}
