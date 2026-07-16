import { Worker } from 'node:worker_threads';
import {
  retryableProcessingError,
} from '../processing/errors.js';
import { runIsolatedWorker } from './worker-lifecycle.js';

const WORKER_URL = new URL('./sharp-image-worker.js', import.meta.url);

function defaultWorker({ path, expectedFormat, limits }) {
  return new Worker(WORKER_URL, {
    workerData: { path, expectedFormat, limits },
    stdout: true,
    stderr: true,
  });
}

export async function runSharpImageWorker({
  path,
  expectedFormat,
  limits,
  signal,
  createWorker,
}) {
  const factory = createWorker ?? (() => defaultWorker({ path, expectedFormat, limits }));
  try {
    return await runIsolatedWorker({ signal, createWorker: factory });
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError') {
      throw retryableProcessingError('processing/soft-timeout');
    }
    throw retryableProcessingError('processing/storage-unavailable');
  }
}
