import test from 'node:test';
import assert from 'node:assert/strict';
import { retryableProcessingError } from '../../src/processing/errors.js';
import { createIngestionTestApp } from '../helpers/create-ingestion-test-app.js';

const headers = Object.freeze({
  'ce-id': 'event-12345678',
  'ce-type': 'google.cloud.storage.object.v1.finalized',
  'ce-source': '//storage.googleapis.com/projects/_/buckets/demo-elsewhere.appspot.com',
});
const payload = Object.freeze({
  bucket: 'demo-elsewhere.appspot.com',
  name: 'users/user_alpha/originals/batch_12345678/frag_12345678',
  generation: '1740000000000001',
});

const inject = (app, overrides = {}) => app.inject({
  method: 'POST',
  url: '/events/storage-finalized',
  headers,
  payload,
  ...overrides,
});

test('only persisted processing terminal outcomes return 204', async (t) => {
  for (const outcome of ['succeeded', 'failed_terminal', 'terminal_noop']) {
    const app = createIngestionTestApp({
      eventHandler: { async handle() { return { outcome }; } },
    });
    t.after(() => app.close());

    const response = await inject(app);
    assert.equal(response.statusCode, 204, outcome);
    assert.equal(response.body, '');
  }
});

test('busy soft-timeout and terminal-transaction failures return stable redacted 503', async (t) => {
  for (const code of [
    'processing/task-busy',
    'processing/soft-timeout',
    'processing/repository-unavailable',
  ]) {
    const app = createIngestionTestApp({
      eventHandler: {
        async handle() {
          throw retryableProcessingError(code);
        },
      },
    });
    t.after(() => app.close());

    const response = await inject(app);
    assert.equal(response.statusCode, 503, code);
    const body = response.json();
    assert.equal(body.error.code, code);
    assert.deepEqual(Object.keys(body.error).sort(), ['code', 'message', 'requestId']);
    assert.equal(JSON.stringify(body).includes(payload.name), false);
  }
});

test('retry correctness depends on 503 and not a Retry-After header', async (t) => {
  const app = createIngestionTestApp({
    eventHandler: {
      async handle() {
        throw retryableProcessingError('processing/task-busy');
      },
    },
  });
  t.after(() => app.close());

  const response = await inject(app);
  assert.equal(response.statusCode, 503);
  assert.equal(response.headers['retry-after'], undefined);
});

test('malformed or unknown processing results return stable 503', async (t) => {
  for (const eventHandler of [
    { async handle() { return { outcome: 'busy' }; } },
    { async handle() { throw new Error(`raw failure for ${payload.name}`); } },
  ]) {
    const app = createIngestionTestApp({ eventHandler });
    t.after(() => app.close());
    const response = await inject(app);
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().error.code, 'internal/error');
    assert.equal(response.body.includes(payload.name), false);
  }
});

test('processing errors use only the server request id', async (t) => {
  const app = createIngestionTestApp({
    eventHandler: {
      async handle() {
        throw retryableProcessingError('processing/soft-timeout');
      },
    },
  });
  t.after(() => app.close());

  const response = await inject(app, {
    url: '/events/storage-finalized?requestId=forged-query-id',
    headers: { ...headers, 'x-request-id': 'forged-header-id' },
    payload: { ...payload, requestId: 'forged-body-id' },
  });
  const requestId = response.json().error.requestId;
  assert.equal(response.statusCode, 503);
  assert.notEqual(requestId, 'forged-query-id');
  assert.notEqual(requestId, 'forged-header-id');
  assert.notEqual(requestId, 'forged-body-id');
});
