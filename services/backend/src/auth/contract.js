export function assertTokenVerifier(verifier) {
  for (const method of ['verifyIdToken', 'verifyAppCheckToken']) {
    if (typeof verifier?.[method] !== 'function') {
      throw new TypeError(`Token verifier must implement ${method}()`);
    }
  }
  return verifier;
}
