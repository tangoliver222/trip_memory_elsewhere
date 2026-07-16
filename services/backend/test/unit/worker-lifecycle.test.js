import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { runIsolatedWorker } from '../../src/adapters/worker-lifecycle.js';

class FakeWorker extends EventEmitter {
  constructor() {
    super();
    this.stdout = new PassThrough();
    this.stderr = new PassThrough();
    this.terminateCount = 0;
  }

  async terminate() {
    this.terminateCount += 1;
    return 1;
  }
}

const safeSignal = () => new AbortController().signal;

test('worker stdout and stderr are drained without entering lifecycle callbacks', async () => {
  const secret = 'private-temp-path-and-native-parser-warning';
  const worker = new FakeWorker();
  const stages = [];
  const operation = runIsolatedWorker({
    signal: safeSignal(),
    createWorker: () => worker,
    onStage: (stage) => stages.push(stage),
  });
  worker.stdout.write(secret);
  worker.stderr.write(secret);
  worker.emit('message', { kind: 'stage', stage: 'exif' });
  worker.emit('message', { kind: 'result', value: 'safe' });

  const result = await operation;

  assert.deepEqual(result, { kind: 'result', value: 'safe' });
  assert.deepEqual(stages, ['exif']);
  assert.equal(JSON.stringify({ result, stages }).includes(secret), false);
  assert.equal(worker.stdout.readableLength, 0);
  assert.equal(worker.stderr.readableLength, 0);
  assert.equal(worker.terminateCount, 1);
});

test('worker success error exit and abort paths terminate exactly once with redacted errors', async () => {
  const secret = 'private-native-worker-error';
  for (const mode of ['error', 'exit', 'abort']) {
    const worker = new FakeWorker();
    const controller = new AbortController();
    const operation = runIsolatedWorker({
      signal: controller.signal,
      createWorker: () => worker,
      onStage: (stage) => {
        if (stage === 'sharp' && mode === 'abort') controller.abort();
      },
    });

    if (mode === 'error') worker.emit('error', new Error(secret));
    if (mode === 'exit') worker.emit('exit', 9);
    if (mode === 'abort') worker.emit('message', { kind: 'stage', stage: 'sharp' });

    let caught;
    try {
      await operation;
    } catch (error) {
      caught = error;
    }
    assert.equal(caught instanceof Error, true);
    assert.equal((caught?.message ?? '').includes(secret), false);
    assert.equal(worker.terminateCount, 1);
  }
});
