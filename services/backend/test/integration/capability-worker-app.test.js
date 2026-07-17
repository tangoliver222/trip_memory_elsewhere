import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiComposition } from '../../src/composition/api.js';
import { createIngestionComposition } from '../../src/composition/ingestion.js';
import { createMemoryRepository } from '../../src/repositories/memory.js';
import { createCapabilityWorkerTestApp } from '../helpers/create-capability-worker-test-app.js';

const OCR_ROUTE = '/internal/capabilities/ocr';
const TASK = Object.freeze({
  capabilityExecutionId: 'execution_12345678',
  ownerId: 'user_alpha',
  routePlanId: 'route_12345678',
  routePlanRevision: 1,
});
const appConfig = Object.freeze({
  nodeEnv: 'test',
  bodyLimit: 32 * 1024,
  logLevel: 'silent',
});
const tokenVerifier = Object.freeze({
  async verifyIdToken() { return { uid: 'user_alpha' }; },
  async verifyAppCheckToken() { return { appId: 'elsewhere-web-test' }; },
});

function workerApp(handle) {
  return createCapabilityWorkerTestApp({ worker: { handle } });
}

test('only the worker root exposes the internal OCR task route', async (t) => {
  const api = createApiComposition({
    appConfig,
    repository: createMemoryRepository(),
    tokenVerifier,
    allowedAppIds: ['elsewhere-web-test'],
  });
  const ingestion = createIngestionComposition({
    appConfig,
    repository: createMemoryRepository(),
    objectInspector: { async inspectOriginal() { throw new Error('not reached'); } },
    deterministicProcessor: { async handle() { throw new Error('not reached'); } },
    authoritativeRouter: { async handle() { throw new Error('not reached'); } },
    capabilityScheduler: { async handle() { throw new Error('not reached'); } },
    allowedBuckets: ['demo-elsewhere.appspot.com'],
    clock: () => '2026-07-17T13:30:00.000Z',
  });
  const worker = workerApp(async () => ({ outcome: 'completed', retryable: false }));
  t.after(() => Promise.all([api.close(), ingestion.close(), worker.close()]));

  assert.equal((await api.inject({ method: 'POST', url: OCR_ROUTE })).statusCode, 404);
  assert.equal((await ingestion.inject({ method: 'POST', url: OCR_ROUTE })).statusCode, 404);
  assert.equal((await worker.inject({ method: 'POST', url: OCR_ROUTE, payload: TASK })).statusCode, 204);
  assert.equal((await worker.inject({ url: '/healthz' })).statusCode, 200);
  assert.equal((await worker.inject({ url: '/readyz' })).statusCode, 200);
  assert.equal((await worker.inject({ url: '/protected' })).statusCode, 404);
});

test('strict task body and errors use only the server request ID', async (t) => {
  const app = workerApp(async () => ({ outcome: 'completed', retryable: false }));
  t.after(() => app.close());
  const response = await app.inject({
    method: 'POST',
    url: `${OCR_ROUTE}?requestId=forged-query-id`,
    headers: { 'x-request-id': 'forged-header-id' },
    payload: { ...TASK, requestId: 'forged-client-id' },
  });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, 'capability/invalid-task');
  assert.notEqual(response.json().error.requestId, 'forged-query-id');
  assert.notEqual(response.json().error.requestId, 'forged-header-id');
  assert.notEqual(response.json().error.requestId, 'forged-client-id');
  assert.deepEqual(Object.keys(response.json().error).sort(), ['code', 'message', 'requestId']);
});

test('Cloud Tasks headers are bounded observability and never replace task identity', async (t) => {
  const calls = [];
  const app = workerApp(async (task) => {
    calls.push(task);
    return { outcome: 'completed', retryable: false };
  });
  t.after(() => app.close());
  const response = await app.inject({
    method: 'POST',
    url: OCR_ROUTE,
    headers: {
      'x-cloudtasks-taskname': 'forged-owner-or-execution',
      'x-cloudtasks-taskretrycount': '4',
      'x-cloudtasks-taskexecutioncount': '5',
    },
    payload: TASK,
  });
  assert.equal(response.statusCode, 204);
  assert.deepEqual(calls, [{ ...TASK, taskDeliveryCount: 5 }]);

  for (const value of ['', '1,2', '-1', '1001', 'not-a-number']) {
    const invalid = await app.inject({
      method: 'POST',
      url: OCR_ROUTE,
      headers: { 'x-cloudtasks-taskexecutioncount': value },
      payload: TASK,
    });
    assert.equal(invalid.statusCode, 400);
  }
});

test('route acknowledges terminal and uncertain outcomes but retries only safe pre-call work', async (t) => {
  const apps = [
    ['completed', false, 204],
    ['insufficient_input', false, 204],
    ['unsupported', false, 204],
    ['failed_terminal', false, 204],
    ['billing_uncertain', false, 204],
    ['terminal_noop', false, 204],
    ['failed_retryable', true, 503],
  ].map(([outcome, retryable, status]) => ({
    status,
    app: workerApp(async () => ({ outcome, retryable })),
  }));
  t.after(() => Promise.all(apps.map(({ app }) => app.close())));

  for (const { app, status } of apps) {
    const response = await app.inject({ method: 'POST', url: OCR_ROUTE, payload: TASK });
    assert.equal(response.statusCode, status);
    if (status === 503) {
      assert.equal(response.json().error.code, 'capability/retryable');
    } else {
      assert.equal(response.body, '');
    }
  }
});
