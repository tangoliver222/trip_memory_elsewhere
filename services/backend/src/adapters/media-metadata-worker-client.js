import { Worker } from 'node:worker_threads';
import { runIsolatedWorker } from './worker-lifecycle.js';

const WORKER_URL = new URL('./media-metadata-worker.js', import.meta.url);

export function runMediaMetadataWorker({
  path,
  format,
  maxMetadataDecompressedBytes,
  signal,
  onStage,
}) {
  return runIsolatedWorker({
    signal,
    onStage,
    createWorker: () => new Worker(WORKER_URL, {
      workerData: { path, format, maxMetadataDecompressedBytes },
      stdout: true,
      stderr: true,
    }),
  });
}
