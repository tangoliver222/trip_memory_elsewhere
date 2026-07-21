import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiComposition } from '../../src/composition/api.js';
import { createMemoryRepository } from '../../src/repositories/memory.js';

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

function harness({ failure = null } = {}) {
  const calls = [];
  const state = Object.freeze({
    revision: 4,
    reviewDecisions: Object.freeze({}),
    connectionDecisions: Object.freeze({}),
    savedDiscoveryIds: Object.freeze([]),
    notes: Object.freeze({}),
    settings: Object.freeze({}),
    excludedJourneyIds: Object.freeze([]),
    updatedAt: '2026-07-21T02:00:00.000Z',
  });
  const experienceService = Object.freeze({
    async getSnapshot(ownerId) {
      calls.push(['getSnapshot', ownerId]);
      if (failure) throw failure;
      return { revision: 'experience-revision', world: { totalFragments: 0 }, userState: state };
    },
    async saveReview(ownerId, input) {
      calls.push(['saveReview', ownerId, input]);
      if (failure) throw failure;
      return state;
    },
    async saveConnection(ownerId, input) {
      calls.push(['saveConnection', ownerId, input]);
      if (failure) throw failure;
      return state;
    },
    async saveDiscovery(ownerId, input) {
      calls.push(['saveDiscovery', ownerId, input]);
      if (failure) throw failure;
      return state;
    },
    async saveNote(ownerId, input) {
      calls.push(['saveNote', ownerId, input]);
      if (failure) throw failure;
      return state;
    },
    async saveSetting(ownerId, input) {
      calls.push(['saveSetting', ownerId, input]);
      if (failure) throw failure;
      return state;
    },
    async excludeJourney(ownerId, input) {
      calls.push(['excludeJourney', ownerId, input]);
      if (failure) throw failure;
      return state;
    },
  });
  const app = createApiComposition({
    appConfig,
    repository: createMemoryRepository(),
    tokenVerifier,
    allowedAppIds: ['elsewhere-web-test'],
    experienceService,
    randomUUID: () => '00000000-0000-4000-8000-000000000001',
    clock: () => '2026-07-21T02:00:00.000Z',
  });
  return { app, calls };
}

test('experience snapshot and mutations always use the verified owner', async (t) => {
  const { app, calls } = harness();
  t.after(() => app.close());

  const requests = [
    ['GET', '/v1/experience-snapshot?ownerId=user_beta', undefined],
    ['PUT', '/v1/experience/reviews/inbox-place-frag_12345678', {
      decision: 'yes',
    }],
    ['PUT', '/v1/experience/connections/connection_12345678', { decision: 'confirmed' }],
    ['PUT', '/v1/experience/discoveries/discovery_12345678', { saved: true }],
    ['PUT', '/v1/experience/notes/note_12345678', { text: '只属于用户的文字' }],
    ['PUT', '/v1/experience/settings/aiTone', { value: 'fact' }],
    ['DELETE', '/v1/experience/journeys/journey_12345678', undefined],
  ];

  for (const [method, url, payload] of requests) {
    const response = await app.inject({ method, url, headers: authHeaders, payload });
    assert.equal(response.statusCode, 200, `${method} ${url}: ${response.body}`);
  }

  assert.equal(calls.length, requests.length);
  assert.equal(calls.every(([, ownerId]) => ownerId === 'user_alpha'), true);
  assert.equal(calls[1][2].ownerId, undefined);
  const forgedOwner = await app.inject({
    method: 'PUT',
    url: '/v1/experience/reviews/inbox-place-frag_12345678',
    headers: authHeaders,
    payload: { decision: 'yes', ownerId: 'user_beta' },
  });
  assert.equal(forgedOwner.statusCode, 400);
  assert.equal(calls.length, requests.length);
  assert.equal((await app.inject({ url: '/demo/v1/snapshot' })).statusCode, 404);
});

test('experience auth and validation fail before service execution', async (t) => {
  const { app, calls } = harness();
  t.after(() => app.close());

  const unauthenticated = await app.inject({
    method: 'PUT',
    url: '/v1/experience/discoveries/discovery_12345678',
    payload: { saved: true },
  });
  assert.equal(unauthenticated.statusCode, 401);

  const invalid = await app.inject({
    method: 'PUT',
    url: '/v1/experience/notes/note_12345678',
    headers: authHeaders,
    payload: { text: 'x'.repeat(10_001), extra: true },
  });
  assert.equal(invalid.statusCode, 400);
  assert.deepEqual(calls, []);
});

test('experience failures use stable redacted errors and server request ids', async (t) => {
  const { app } = harness({ failure: new Error('private Firestore users/user_alpha') });
  t.after(() => app.close());

  const response = await app.inject({
    method: 'PUT',
    url: '/v1/experience/settings/sensitiveBlur',
    headers: { ...authHeaders, 'x-request-id': 'forged-client-id' },
    payload: { value: true },
  });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(Object.keys(response.json().error).sort(), ['code', 'message', 'requestId']);
  assert.equal(response.json().error.code, 'experience/unavailable');
  assert.notEqual(response.json().error.requestId, 'forged-client-id');
  assert.doesNotMatch(response.body, /private|users\//i);
});
