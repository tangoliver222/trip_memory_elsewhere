import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorageFinalizedPipeline } from '../../src/ingestion/pipeline.js';
import { CapabilityError } from '../../src/capabilities/errors.js';
import { RoutingServiceError } from '../../src/routing/errors.js';
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
const routedEvent = Object.freeze({
  uid: 'user_alpha',
  batchId: 'batch_12345678',
  fragmentId: 'frag_12345678',
  sourceRevision: Object.freeze({
    bucket: payload.bucket,
    objectName: payload.name,
    generation: payload.generation,
  }),
});

function createApp({
  routingOutcome = 'drafted',
  routingError = null,
  schedulerError = null,
  calls = [],
} = {}) {
  const eventHandler = createStorageFinalizedPipeline({
    originalFinalizer: {
      async handle(event) {
        calls.push(['finalizer', event]);
        return { outcome: 'applied' };
      },
    },
    deterministicProcessor: {
      async handle(event) {
        calls.push(['processor', event]);
        return { outcome: 'succeeded' };
      },
    },
    authoritativeRouter: {
      async handle(event) {
        calls.push(['router', event]);
        if (routingError) throw routingError;
        return { outcome: routingOutcome };
      },
    },
    capabilityScheduler: {
      async handle(input) {
        calls.push(['scheduler', input]);
        if (schedulerError) throw schedulerError;
        return { outcome: 'queued' };
      },
    },
  });
  return createIngestionTestApp({ eventHandler });
}

test('ingestion acknowledges only after the authoritative route state is persisted', async (t) => {
  const calls = [];
  const app = createApp({ calls });
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/events/storage-finalized',
    headers,
    payload,
  });

  assert.equal(response.statusCode, 204);
  assert.deepEqual(
    calls.map(([name]) => name),
    ['finalizer', 'processor', 'router', 'scheduler'],
  );
  assert.deepEqual(calls[2][1], routedEvent);
  assert.deepEqual(calls[3][1], { uid: 'user_alpha', batchId: 'batch_12345678' });
});

test('routing persistence failure returns a stable redacted 503 for Eventarc retry', async (t) => {
  const app = createApp({
    routingError: new RoutingServiceError('routing/repository-unavailable'),
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/events/storage-finalized?requestId=forged',
    headers: { ...headers, 'x-request-id': 'forged' },
    payload: { ...payload, requestId: 'forged' },
  });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(Object.keys(response.json().error).sort(), ['code', 'message', 'requestId']);
  assert.equal(response.json().error.code, 'internal/error');
  assert.equal(response.body.includes('routing/repository-unavailable'), false);
  assert.notEqual(response.json().error.requestId, 'forged');
});

test('routing integration adds no production business endpoint', async (t) => {
  const app = createApp();
  t.after(() => app.close());

  for (const url of ['/protected', '/routing', '/route-plans', '/v1/routing']) {
    assert.equal((await app.inject({ method: 'POST', url })).statusCode, 404);
  }
});

test('dispatch failure remains retryable and is redacted by the ingestion boundary', async (t) => {
  const app = createApp({
    schedulerError: new CapabilityError('capability/dispatch-unavailable', {
      retryable: true,
      billingUncertain: false,
    }),
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/events/storage-finalized',
    headers,
    payload,
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error.code, 'internal/error');
  assert.equal(response.body.includes('capability/dispatch-unavailable'), false);
});
