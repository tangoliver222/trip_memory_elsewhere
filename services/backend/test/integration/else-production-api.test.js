import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiComposition } from '../../src/composition/api.js';
import { createMemoryRepository } from '../../src/repositories/memory.js';

const appConfig = Object.freeze({ nodeEnv: 'test', bodyLimit: 32 * 1024, logLevel: 'silent' });
const authHeaders = Object.freeze({
  authorization: 'Bearer id-user-alpha',
  'x-firebase-appcheck': 'valid-app-check',
});
const tokenVerifier = Object.freeze({
  async verifyIdToken(token) {
    if (token !== 'id-user-alpha') throw new Error('private ID token failure');
    return { uid: 'user_alpha' };
  },
  async verifyAppCheckToken(token) {
    if (token !== 'valid-app-check') throw new Error('private App Check failure');
    return { appId: 'elsewhere-web-test' };
  },
});

function harness({ failure } = {}) {
  const calls = [];
  const elseQueryService = Object.freeze({
    async ask(ownerId, input) {
      calls.push({ ownerId, input });
      if (failure) throw failure;
      return Object.freeze({
        status: 'completed',
        state: 'found',
        answer: '你保存过一张 Common Grounds 小票。',
        sources: Object.freeze([Object.freeze({
          fragmentId: 'frag_12345678',
          label: 'COMMON-GROUNDS-receipt.png',
          kind: 'receipt',
        })]),
        uncertainty: '只有一份原件。',
        nextAction: null,
        scope: Object.freeze({ label: '全部旅行世界' }),
      });
    },
  });
  const app = createApiComposition({
    appConfig,
    repository: createMemoryRepository(),
    tokenVerifier,
    allowedAppIds: ['elsewhere-web-test'],
    elseQueryService,
  });
  return { app, calls };
}

test('production Else uses the verified owner and a strict request body', async (t) => {
  const { app, calls } = harness();
  t.after(() => app.close());

  const forged = await app.inject({
    method: 'POST',
    url: '/v1/else/ask',
    headers: authHeaders,
    payload: {
      question: '我保存过什么？',
      scope: { type: 'world' },
      ownerId: 'user_beta',
    },
  });
  assert.equal(forged.statusCode, 400);
  assert.deepEqual(calls, []);

  const response = await app.inject({
    method: 'POST',
    url: '/v1/else/ask',
    headers: authHeaders,
    payload: { question: '我保存过什么？', scope: { type: 'world' } },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().sources[0].fragmentId, 'frag_12345678');
  assert.deepEqual(calls, [{
    ownerId: 'user_alpha',
    input: { question: '我保存过什么？', scope: { type: 'world' } },
  }]);
});

test('production Else auth fails before service execution', async (t) => {
  const { app, calls } = harness();
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/v1/else/ask',
    payload: { question: '我保存过什么？', scope: { type: 'world' } },
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, 'auth/missing-id-token');
  assert.deepEqual(calls, []);
});

test('production Else exposes stable budget and provider failures with server request IDs', async (t) => {
  for (const [code, status] of [
    ['else/budget-exhausted', 429],
    ['else/provider-failed', 502],
    ['else/unavailable', 503],
  ]) {
    const failure = Object.assign(new Error('private provider/project detail'), { code });
    const { app } = harness({ failure });
    t.after(() => app.close());
    const response = await app.inject({
      method: 'POST',
      url: '/v1/else/ask',
      headers: { ...authHeaders, 'x-request-id': 'forged-request' },
      payload: { question: '我保存过什么？', scope: { type: 'world' } },
    });
    assert.equal(response.statusCode, status);
    assert.equal(response.json().error.code, code);
    assert.notEqual(response.json().error.requestId, 'forged-request');
    assert.doesNotMatch(response.body, /private|provider\/project/i);
  }
});
