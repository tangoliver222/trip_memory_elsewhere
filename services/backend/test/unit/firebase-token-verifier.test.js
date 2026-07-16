import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirebaseTokenVerifier } from '../../src/adapters/firebase-token-verifier.js';

test('Firebase verifier exposes only uid and VerifyAppCheckTokenResponse.appId', async () => {
  const verifier = createFirebaseTokenVerifier({
    auth: {
      verifyIdToken: async () => ({
        uid: 'user_alpha',
        email: 'private@example.com',
      }),
    },
    appCheck: {
      verifyToken: async () => ({
        appId: 'elsewhere-web-dev',
        token: { app_id: 'wrong-nested-value' },
      }),
    },
  });

  assert.deepEqual(await verifier.verifyIdToken('id-token'), { uid: 'user_alpha' });
  assert.deepEqual(await verifier.verifyAppCheckToken('app-token'), {
    appId: 'elsewhere-web-dev',
  });
});

test('Firebase verifier rejects missing uid or appId with generic errors', async () => {
  const verifier = createFirebaseTokenVerifier({
    auth: { verifyIdToken: async () => ({ sub: 'not-accepted' }) },
    appCheck: { verifyToken: async () => ({ token: { app_id: 'not-accepted' } }) },
  });

  await assert.rejects(() => verifier.verifyIdToken('id-token'), {
    name: 'TokenVerificationError',
    message: 'Token verification failed',
    kind: 'id-token',
  });
  await assert.rejects(() => verifier.verifyAppCheckToken('app-token'), {
    name: 'TokenVerificationError',
    message: 'Token verification failed',
    kind: 'app-check',
  });
});

test('Firebase verifier does not leak provider error messages', async () => {
  const verifier = createFirebaseTokenVerifier({
    auth: {
      verifyIdToken: async () => {
        throw new Error('secret auth provider detail');
      },
    },
    appCheck: {
      verifyToken: async () => {
        throw new Error('secret app provider detail');
      },
    },
  });

  for (const operation of [
    () => verifier.verifyIdToken('id-token'),
    () => verifier.verifyAppCheckToken('app-token'),
  ]) {
    await assert.rejects(operation, (error) => (
      error.message === 'Token verification failed'
      && !error.message.includes('secret')
      && error.cause === undefined
    ));
  }
});
