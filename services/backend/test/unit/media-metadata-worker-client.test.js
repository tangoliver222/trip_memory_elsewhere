import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMediaMetadataWorker } from '../../src/adapters/media-metadata-worker-client.js';
import { alphaPngBytes } from '../fixtures/media.js';

async function createPng(t) {
  const directory = await mkdtemp(join(tmpdir(), 'elsewhere-worker-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'fixture.png');
  await writeFile(path, alphaPngBytes());
  return path;
}

test('Sharp metadata executes at a cancellable stage inside the dedicated worker', async (t) => {
  const path = await createPng(t);
  const controller = new AbortController();
  const stages = [];
  const operation = runMediaMetadataWorker({
    path,
    format: 'png',
    maxMetadataDecompressedBytes: 1024 * 1024,
    signal: controller.signal,
    onStage: (stage) => {
      stages.push(stage);
      if (stage === 'sharp') controller.abort();
    },
  });

  await assert.rejects(operation, { name: 'AbortError' });
  assert.deepEqual(stages, ['exif', 'sharp']);
});

test('native Sharp is absent from the parent reader and confined to the worker', async () => {
  const readerSource = await readFile(
    new URL('../../src/adapters/media-metadata-reader.js', import.meta.url),
    'utf8',
  );
  const workerSource = await readFile(
    new URL('../../src/adapters/media-metadata-worker.js', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(readerSource, /from ['"]sharp['"]/);
  assert.match(workerSource, /from ['"]sharp['"]/);
  assert.match(workerSource, /\.metadata\(\)/);
});
