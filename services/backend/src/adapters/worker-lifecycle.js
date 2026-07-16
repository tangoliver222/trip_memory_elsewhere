import { runAbortableOperation } from './abortable-operation.js';

function waitForFinalMessage(worker, onStage) {
  let settled = false;
  let onMessage;
  let onError;
  let onExit;
  const cleanup = () => {
    worker.off('message', onMessage);
    worker.off('error', onError);
    worker.off('exit', onExit);
  };
  const promise = new Promise((resolve, reject) => {
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const fail = () => finish(reject, new Error('Metadata worker failed'));
    onMessage = (message) => {
      if (message?.kind === 'stage') {
        if (!['exif', 'sharp'].includes(message.stage)) return fail();
        try {
          onStage?.(message.stage);
        } catch {
          fail();
        }
        return;
      }
      if (!['result', 'parser-error'].includes(message?.kind)) return fail();
      finish(resolve, message);
    };
    onError = () => fail();
    onExit = () => fail();
    worker.on('message', onMessage);
    worker.on('error', onError);
    worker.on('exit', onExit);
  });
  return { promise, cleanup };
}

function discard(stream) {
  if (!stream || typeof stream.resume !== 'function') return () => {};
  const drain = () => {};
  stream.on('data', drain);
  stream.resume();
  return () => stream.off('data', drain);
}

export async function runIsolatedWorker({ signal, createWorker, onStage }) {
  if (!(signal instanceof AbortSignal) || typeof createWorker !== 'function') {
    throw new TypeError('Valid isolated worker input is required');
  }
  let worker;
  let waiter;
  let termination;
  let cleanupOutput = () => {};
  const terminate = () => {
    waiter?.cleanup();
    if (!worker) return Promise.resolve();
    if (!termination) {
      termination = Promise.resolve(worker.terminate())
        .catch(() => undefined)
        .finally(cleanupOutput);
    }
    return termination;
  };

  try {
    return await runAbortableOperation({
      signal,
      start: () => {
        worker = createWorker();
        const cleanupStdout = discard(worker.stdout);
        const cleanupStderr = discard(worker.stderr);
        cleanupOutput = () => {
          cleanupStdout();
          cleanupStderr();
        };
        waiter = waitForFinalMessage(worker, onStage);
        return waiter.promise;
      },
      cancel: terminate,
    });
  } finally {
    await terminate();
  }
}
