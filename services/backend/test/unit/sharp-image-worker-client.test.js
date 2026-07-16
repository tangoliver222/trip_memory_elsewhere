import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { runSharpImageWorker } from '../../src/adapters/sharp-image-worker-client.js';

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

const SAFE_LIMITS = Object.freeze({
  maxInputPixels: 60_000_000,
  maxImageWidth: 20_000,
  maxImageHeight: 20_000,
  maxPageCount: 100,
});

const input = (signal, createWorker) => ({
  path: '/private/user/source-name.png',
  expectedFormat: 'png',
  limits: SAFE_LIMITS,
  signal,
  createWorker,
});

function assertRetryableInfrastructureError(error, secret) {
  assert.equal(error?.code, 'processing/storage-unavailable');
  assert.equal(error?.retryable, true);
  assert.equal(error?.message, 'Processing storage is temporarily unavailable');
  assert.equal(JSON.stringify(error).includes(secret), false);
  assert.equal((error?.stack ?? '').includes(secret), false);
}

test('constructor error worker error exit and protocol failure are retryable and redacted', async () => {
  const secret = 'private-native-lifecycle-cause';
  for (const mode of ['constructor', 'error', 'exit', 'protocol']) {
    const worker = new FakeWorker();
    const createWorker = mode === 'constructor'
      ? () => { throw new Error(secret); }
      : () => worker;
    const operation = runSharpImageWorker(input(
      new AbortController().signal,
      createWorker,
    ));
    if (mode === 'error') worker.emit('error', new Error(secret));
    if (mode === 'exit') worker.emit('exit', 9);
    if (mode === 'protocol') {
      worker.emit('message', { kind: 'private-protocol', cause: secret });
    }

    let caught;
    try {
      await operation;
    } catch (error) {
      caught = error;
    }
    assertRetryableInfrastructureError(caught, secret);
    assert.equal(worker.terminateCount, mode === 'constructor' ? 0 : 1);
  }
});

test('AbortError becomes soft-timeout and terminates the worker once', async () => {
  const worker = new FakeWorker();
  const controller = new AbortController();
  const operation = runSharpImageWorker(input(controller.signal, () => worker));

  controller.abort();

  await assert.rejects(operation, {
    code: 'processing/soft-timeout',
    retryable: true,
    message: 'Processing exceeded its safe deadline',
  });
  assert.equal(worker.terminateCount, 1);
});

test('a sanitized worker-reported decode rejection remains a result for the processor', async () => {
  const worker = new FakeWorker();
  const operation = runSharpImageWorker(input(
    new AbortController().signal,
    () => worker,
  ));

  worker.emit('message', { kind: 'result', status: 'invalid' });

  assert.deepEqual(await operation, { kind: 'result', status: 'invalid' });
  assert.equal(worker.terminateCount, 1);
});
