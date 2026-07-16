import test from 'node:test';
import assert from 'node:assert/strict';
import { IngestionError } from '../../src/ingestion/errors.js';
import { createIngestionTestApp } from '../helpers/create-ingestion-test-app.js';

const headers = {
  'ce-id': 'event-12345678',
  'ce-type': 'google.cloud.storage.object.v1.finalized',
  'ce-source': '//storage.googleapis.com/projects/_/buckets/demo-elsewhere.appspot.com',
};
const payload = {
  bucket: 'demo-elsewhere.appspot.com',
  name: 'users/user_alpha/originals/batch_12345678/frag_12345678',
  generation: '1740000000000001',
};

test('terminal ingestion outcomes return 204 without application auth headers', async (t) => {
  for (const outcome of ['applied', 'duplicate', 'rejected']) {
    const app = createIngestionTestApp({
      finalizer: { handle: async () => ({ outcome }) },
    });
    t.after(() => app.close());
    const response = await app.inject({
      method: 'POST',
      url: '/events/storage-finalized',
      headers,
      payload,
    });
    assert.equal(response.statusCode, 204);
    assert.equal(response.body, '');
  }
});

test('invalid CloudEvent returns stable 400 with server request ID', async (t) => {
  const app = createIngestionTestApp({ finalizer: { handle: async () => ({ outcome: 'applied' }) } });
  t.after(() => app.close());
  const response = await app.inject({
    method: 'POST',
    url: '/events/storage-finalized?requestId=forged-query-id',
    headers: { ...headers, 'ce-type': 'wrong', 'x-request-id': 'forged-header-id' },
    payload: { ...payload, requestId: 'forged-body-id' },
  });
  assert.equal(response.statusCode, 400);
  const body = response.json();
  assert.equal(body.error.code, 'ingestion/invalid-event');
  assert.notEqual(body.error.requestId, 'forged-query-id');
  assert.notEqual(body.error.requestId, 'forged-header-id');
  assert.notEqual(body.error.requestId, 'forged-body-id');
});

test('conflict and retryable failures have stable redacted responses', async (t) => {
  const conflictApp = createIngestionTestApp({
    finalizer: {
      async handle() {
        throw new IngestionError('ingestion/original-conflict', { permanent: true });
      },
    },
  });
  const retryApp = createIngestionTestApp({
    finalizer: {
      async handle() {
        throw new IngestionError('internal/error', { permanent: false });
      },
    },
  });
  t.after(() => Promise.all([conflictApp.close(), retryApp.close()]));

  const conflict = await conflictApp.inject({
    method: 'POST', url: '/events/storage-finalized', headers, payload,
  });
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.json().error.code, 'ingestion/original-conflict');

  const retry = await retryApp.inject({
    method: 'POST', url: '/events/storage-finalized', headers, payload,
  });
  assert.equal(retry.statusCode, 503);
  assert.equal(retry.json().error.code, 'internal/error');
  assert.deepEqual(Object.keys(retry.json().error).sort(), ['code', 'message', 'requestId']);
});
