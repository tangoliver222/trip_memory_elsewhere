import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';

test('health endpoints are stable and reveal no model or credential details', async (t) => {
  const app = createApp({
    appConfig: { nodeEnv: 'test', bodyLimit: 32 * 1024, logLevel: 'silent' },
  });
  t.after(() => app.close());

  const health = await app.inject({ method: 'GET', url: '/healthz' });
  assert.equal(health.statusCode, 200);
  assert.deepEqual(health.json(), { status: 'ok' });
  assert.equal(JSON.stringify(health.json()).includes('model'), false);

  const ready = await app.inject({ method: 'GET', url: '/readyz' });
  assert.equal(ready.statusCode, 200);
  assert.deepEqual(ready.json(), { status: 'ready' });
});
