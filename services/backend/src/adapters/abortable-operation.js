const aborted = () => new DOMException('Operation aborted', 'AbortError');

export function runAbortableOperation({ signal, start, cancel }) {
  if (!(signal instanceof AbortSignal)
    || typeof start !== 'function'
    || typeof cancel !== 'function') {
    throw new TypeError('Valid abortable operation input is required');
  }
  if (signal.aborted) return Promise.reject(aborted());

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      callback(value);
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      Promise.resolve()
        .then(cancel)
        .catch(() => undefined)
        .then(() => reject(aborted()));
    };

    signal.addEventListener('abort', onAbort, { once: true });
    try {
      Promise.resolve(start()).then(
        (value) => finish(resolve, value),
        (error) => finish(reject, error),
      );
    } catch (error) {
      finish(reject, error);
    }
  });
}
