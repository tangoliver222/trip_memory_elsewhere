import test from 'node:test';
import assert from 'node:assert/strict';
import { runAbortableOperation } from '../../src/adapters/abortable-operation.js';

test('in-flight abort cancels and rejects a never-resolving operation promptly', async () => {
  const controller = new AbortController();
  let cancelCount = 0;
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const operation = runAbortableOperation({
    signal: controller.signal,
    start: () => {
      markStarted();
      return new Promise(() => {});
    },
    cancel: async () => { cancelCount += 1; },
  });
  await started;
  controller.abort();

  await assert.rejects(operation, { name: 'AbortError' });
  assert.equal(cancelCount, 1);
});

test('a completed operation remains terminal after a later abort', async () => {
  const controller = new AbortController();
  let cancelCount = 0;

  const result = await runAbortableOperation({
    signal: controller.signal,
    start: async () => 'terminal-evidence',
    cancel: async () => { cancelCount += 1; },
  });
  controller.abort();

  assert.equal(result, 'terminal-evidence');
  assert.equal(cancelCount, 0);
});
