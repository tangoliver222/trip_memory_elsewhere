import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';
import { createProtectedTestApp } from '../helpers/create-protected-app.js';

const appConfig = { nodeEnv: 'test', bodyLimit: 32 * 1024, logLevel: 'silent' };

const tokenVerifier = {
  async verifyIdToken(token) {
    if (token !== 'valid-id') throw new Error('invalid id');
    return { uid: 'user_alpha' };
  },
  async verifyAppCheckToken(token) {
    if (token !== 'valid-app') throw new Error('invalid app');
    return { appId: 'elsewhere-web-dev' };
  },
};

function createRepository() {
  const calls = [];
  return {
    calls,
    async getFragment(uid, id) {
      calls.push({ uid, id });
      return { id, ownerId: uid };
    },
  };
}

test('health endpoints stay public and production has no protected probe', async (t) => {
  const app = createApp({ appConfig });
  t.after(() => app.close());
  assert.equal((await app.inject({ method: 'GET', url: '/healthz' })).statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: '/readyz' })).statusCode, 200);
  assert.equal((await app.inject({ method: 'POST', url: '/protected' })).statusCode, 404);
});

test('test harness rejects before its handler and repository', async (t) => {
  const repository = createRepository();
  const { app, calls } = createProtectedTestApp({
    tokenVerifier,
    allowedAppIds: ['elsewhere-web-dev'],
    repository,
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/protected?requestId=query-forged',
    headers: { 'x-request-id': 'header-forged' },
    payload: { requestId: 'body-forged' },
  });
  const body = response.json();
  assert.equal(response.statusCode, 401);
  assert.equal(body.error.code, 'auth/missing-id-token');
  assert.equal(typeof body.error.requestId, 'string');
  assert.notEqual(body.error.requestId, 'header-forged');
  assert.notEqual(body.error.requestId, 'query-forged');
  assert.notEqual(body.error.requestId, 'body-forged');
  assert.equal(calls.handler, 0);
  assert.equal(repository.calls.length, 0);
});

test('test harness uses verified uid and ignores forged owner fields', async (t) => {
  const repository = createRepository();
  const { app, calls } = createProtectedTestApp({
    tokenVerifier,
    allowedAppIds: ['elsewhere-web-dev'],
    repository,
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/protected',
    headers: {
      authorization: 'Bearer valid-id',
      'x-firebase-appcheck': 'valid-app',
      'x-user-id': 'user_beta',
    },
    payload: { uid: 'user_beta', ownerId: 'user_beta' },
  });
  const body = response.json();
  assert.equal(response.statusCode, 200);
  assert.deepEqual(body.authContext, {
    uid: 'user_alpha',
    appId: 'elsewhere-web-dev',
  });
  assert.equal(calls.handler, 1);
  assert.deepEqual(repository.calls, [{ uid: 'user_alpha', id: 'frag_12345678' }]);
});

test('comma-merged credentials do not enter the test handler', async (t) => {
  const repository = createRepository();
  const { app, calls } = createProtectedTestApp({
    tokenVerifier,
    allowedAppIds: ['elsewhere-web-dev'],
    repository,
  });
  t.after(() => app.close());

  for (const headers of [
    { authorization: 'Bearer valid-id, Bearer second', 'x-firebase-appcheck': 'valid-app' },
    { authorization: 'Bearer valid-id', 'x-firebase-appcheck': 'valid-app, second' },
  ]) {
    const response = await app.inject({ method: 'POST', url: '/protected', headers });
    assert.equal(response.statusCode, 401);
  }
  assert.equal(calls.handler, 0);
  assert.equal(repository.calls.length, 0);
});
