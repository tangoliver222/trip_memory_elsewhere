import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';
import { registerAuthBoundary } from '../../src/auth/boundary.js';

const appConfig = { nodeEnv: 'test', bodyLimit: 32 * 1024, logLevel: 'silent' };
const validHeaders = {
  authorization: 'Bearer valid-id',
  'x-firebase-appcheck': 'valid-app',
};

function createReply() {
  return {
    sent: false,
    statusCode: null,
    payload: null,
    code(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    send(payload) {
      this.sent = true;
      this.payload = payload;
      return this;
    },
  };
}

function createVerifier({ appId = 'elsewhere-web-dev' } = {}) {
  const calls = { id: 0, appCheck: 0 };
  return {
    calls,
    verifier: {
      async verifyIdToken(token) {
        calls.id += 1;
        if (token !== 'valid-id') throw new Error('secret Firebase auth error');
        return { uid: 'user_alpha' };
      },
      async verifyAppCheckToken(token) {
        calls.appCheck += 1;
        if (token !== 'valid-app') throw new Error('secret Firebase app error');
        return { appId };
      },
    },
  };
}

async function execute(requireAuth, request) {
  const reply = createReply();
  const calls = { handler: 0, repository: 0, repositoryUid: null };
  await requireAuth(request, reply);
  if (!reply.sent) {
    calls.handler += 1;
    calls.repository += 1;
    calls.repositoryUid = request.authContext.uid;
  }
  return { reply, calls };
}

test('registers authContext decoration and rejects invalid allowlists', async (t) => {
  const app = createApp({ appConfig });
  t.after(() => app.close());
  const { verifier } = createVerifier();

  for (const allowedAppIds of [undefined, [], [''], [' elsewhere-web-dev ']]) {
    assert.throws(
      () => registerAuthBoundary(app, { tokenVerifier: verifier, allowedAppIds }),
      /allowedAppIds/,
    );
  }

  const requireAuth = registerAuthBoundary(app, {
    tokenVerifier: verifier,
    allowedAppIds: ['elsewhere-web-dev'],
  });
  assert.equal(typeof requireAuth, 'function');
  assert.equal(app.hasRequestDecorator('authContext'), true);
});

test('returns stable failures before handler or repository execution', async (t) => {
  const cases = [
    [{}, 'auth/missing-id-token'],
    [{ authorization: 'Bearer first, Bearer second' }, 'auth/invalid-id-token'],
    [
      { authorization: 'Bearer invalid-id', 'x-firebase-appcheck': 'valid-app' },
      'auth/invalid-id-token',
    ],
    [{ authorization: 'Bearer valid-id' }, 'app-check/missing-token'],
    [
      { authorization: 'Bearer valid-id', 'x-firebase-appcheck': 'invalid-app' },
      'app-check/invalid-token',
    ],
  ];

  for (const [headers, code] of cases) {
    const app = createApp({ appConfig });
    t.after(() => app.close());
    const { verifier, calls: verifierCalls } = createVerifier();
    const requireAuth = registerAuthBoundary(app, {
      tokenVerifier: verifier,
      allowedAppIds: ['elsewhere-web-dev'],
    });
    const request = { id: `server-${code}`, headers };
    const { reply, calls } = await execute(requireAuth, request);

    assert.equal(reply.statusCode, 401);
    assert.equal(reply.payload.error.code, code);
    assert.equal(reply.payload.error.requestId, request.id);
    assert.equal(JSON.stringify(reply.payload).includes('secret Firebase'), false);
    assert.equal(calls.handler, 0);
    assert.equal(calls.repository, 0);
    if (code.startsWith('auth/')) assert.equal(verifierCalls.appCheck, 0);
  }
});

test('rejects an App Check token from an app outside the allowlist', async (t) => {
  const app = createApp({ appConfig });
  t.after(() => app.close());
  const { verifier } = createVerifier({ appId: 'other-app' });
  const requireAuth = registerAuthBoundary(app, {
    tokenVerifier: verifier,
    allowedAppIds: ['elsewhere-web-dev'],
  });
  const { reply, calls } = await execute(requireAuth, {
    id: 'server-app-id',
    headers: validHeaders,
  });

  assert.equal(reply.payload.error.code, 'app-check/invalid-token');
  assert.equal(calls.handler, 0);
  assert.equal(calls.repository, 0);
});

test('installs a frozen context that client owner fields cannot replace', async (t) => {
  const app = createApp({ appConfig });
  t.after(() => app.close());
  const { verifier } = createVerifier();
  const requireAuth = registerAuthBoundary(app, {
    tokenVerifier: verifier,
    allowedAppIds: ['elsewhere-web-dev'],
  });
  const request = {
    id: 'server-success',
    headers: { ...validHeaders, 'x-user-id': 'user_beta' },
    body: { uid: 'user_beta', ownerId: 'user_beta' },
  };
  const { reply, calls } = await execute(requireAuth, request);

  assert.equal(reply.sent, false);
  assert.deepEqual(request.authContext, {
    uid: 'user_alpha',
    appId: 'elsewhere-web-dev',
  });
  assert.equal(Object.isFrozen(request.authContext), true);
  assert.equal(calls.repositoryUid, 'user_alpha');
  assert.throws(() => {
    request.authContext.uid = 'user_beta';
  }, TypeError);
  assert.throws(() => {
    request.authContext = { uid: 'user_beta' };
  }, TypeError);
});
