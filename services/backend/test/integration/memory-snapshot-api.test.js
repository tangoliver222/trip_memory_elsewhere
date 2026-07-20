import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiComposition } from '../../src/composition/api.js';
import { createMemoryRepository } from '../../src/repositories/memory.js';
import { makePendingBatch, makeUploadedFragment } from '../fixtures/import.js';

const appConfig = Object.freeze({
  nodeEnv: 'test',
  bodyLimit: 32 * 1024,
  logLevel: 'silent',
});

const authHeaders = Object.freeze({
  authorization: 'Bearer id-user-alpha',
  'x-firebase-appcheck': 'valid-app-check',
});

const tokenVerifier = Object.freeze({
  async verifyIdToken(token) {
    if (token !== 'id-user-alpha') throw new Error('private ID token error');
    return { uid: 'user_alpha' };
  },
  async verifyAppCheckToken(token) {
    if (token !== 'valid-app-check') throw new Error('private App Check error');
    return { appId: 'elsewhere-web-test' };
  },
});

function harness({ readError } = {}) {
  const calls = [];
  const fragment = makeUploadedFragment({
    source: {
      ...makeUploadedFragment().source,
      providerItemId: null,
      providerMetadata: {},
      sourceCreatedAt: '2026-07-12T03:22:14.000Z',
      locationHint: {
        lat: 13.7791,
        lng: 100.5443,
        accuracyMeters: 12,
        source: 'camera_device',
      },
    },
    facts: {
      capturedAt: {
        value: '2026-07-12T03:22:14.000Z',
        sourceType: 'exif',
        sourceRefs: [{ type: 'fragment', id: 'frag_12345678' }],
        processor: {
          name: 'deterministic-media',
          version: 'v1',
          modelAlias: null,
          promptVersion: null,
        },
        confidence: 1,
        status: 'suggested',
        observedAt: '2026-07-16T00:00:00.000Z',
      },
    },
  });
  const batch = makePendingBatch();
  const memorySnapshotReader = Object.freeze({
    async readOwnerSnapshot(ownerId) {
      calls.push(ownerId);
      if (readError) throw readError;
      return Object.freeze({
        fragments: Object.freeze([fragment]),
        importBatches: Object.freeze([batch]),
        fragmentsTruncated: false,
        importBatchesTruncated: false,
      });
    },
  });
  const app = createApiComposition({
    appConfig,
    repository: createMemoryRepository(),
    tokenVerifier,
    allowedAppIds: ['elsewhere-web-test'],
    memorySnapshotReader,
    randomUUID: () => '00000000-0000-4000-8000-000000000001',
    clock: () => '2026-07-20T00:00:00.000Z',
  });
  return { app, calls };
}

test('production memory snapshot returns a bounded owner-only projection', async (t) => {
  const { app, calls } = harness();
  t.after(() => app.close());

  const response = await app.inject({
    method: 'GET',
    url: '/v1/memory-snapshot?ownerId=user_beta',
    headers: authHeaders,
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, ['user_alpha']);
  const body = response.json();
  assert.equal(body.summary.totalFragments, 1);
  assert.equal(body.summary.totalImportBatches, 1);
  assert.equal(body.fragments[0].id, 'frag_12345678');
  assert.equal(body.fragments[0].original.storagePath,
    'users/user_alpha/originals/batch_12345678/frag_12345678');
  assert.equal(body.fragments[0].facts.capturedAt.value, '2026-07-12T03:22:14.000Z');
  assert.equal(body.page.fragmentsTruncated, false);
  assert.match(body.revision, /^[a-f0-9]{20}$/);

  for (const forbidden of [
    'ownerId', 'bucket', 'generation', 'crc32c', 'md5Hash', 'hashes',
    'providerItemId', 'providerMetadata', 'sourceRefs', 'processor',
  ]) {
    assert.equal(JSON.stringify(body).includes(`"${forbidden}"`), false, forbidden);
  }
});

test('auth failures occur before memory snapshot reads', async (t) => {
  const { app, calls } = harness();
  t.after(() => app.close());

  const response = await app.inject({ method: 'GET', url: '/v1/memory-snapshot' });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, 'auth/missing-id-token');
  assert.deepEqual(calls, []);
});

test('memory snapshot failures are stable and never trust a client request ID', async (t) => {
  const { app } = harness({ readError: new Error('private Firestore path users/user_alpha') });
  t.after(() => app.close());

  const response = await app.inject({
    method: 'GET',
    url: '/v1/memory-snapshot',
    headers: { ...authHeaders, 'x-request-id': 'forged-client-request' },
  });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(Object.keys(response.json().error).sort(), ['code', 'message', 'requestId']);
  assert.equal(response.json().error.code, 'memory/unavailable');
  assert.notEqual(response.json().error.requestId, 'forged-client-request');
  assert.doesNotMatch(response.body, /private|users\//i);
});
