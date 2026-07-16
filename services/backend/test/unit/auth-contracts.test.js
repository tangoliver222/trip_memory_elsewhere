import test from 'node:test';
import assert from 'node:assert/strict';
import { assertTokenVerifier } from '../../src/auth/contract.js';
import { authErrorResponse, TokenVerificationError } from '../../src/auth/errors.js';
import { parseAppCheckToken, parseBearerToken } from '../../src/auth/headers.js';

test('Bearer parser accepts exactly one non-empty token', () => {
  assert.equal(parseBearerToken('Bearer id-token'), 'id-token');
  assert.equal(parseBearerToken('bearer id-token'), 'id-token');
  for (const value of [
    undefined,
    '',
    ' ',
    [],
    ['Bearer a', 'Bearer b'],
    'Basic token',
    'Bearer',
    'Bearer ',
    'Bearer a b',
    'Bearer a, Bearer b',
  ]) {
    assert.equal(parseBearerToken(value), null);
  }
});

test('App Check parser rejects empty, repeated and comma-merged values', () => {
  assert.equal(parseAppCheckToken('app-check-token'), 'app-check-token');
  for (const value of [
    undefined,
    '',
    ' ',
    [],
    ['a', 'b'],
    'a,b',
    'a, b',
    'a b',
  ]) {
    assert.equal(parseAppCheckToken(value), null);
  }
});

test('auth errors expose only stable public fields', () => {
  const response = authErrorResponse('auth/invalid-id-token', 'req-server');
  assert.deepEqual(response, {
    error: {
      code: 'auth/invalid-id-token',
      requestId: 'req-server',
      message: 'Refresh your session and retry.',
    },
  });
  assert.equal(Object.isFrozen(response), true);
  assert.equal(Object.isFrozen(response.error), true);
});

test('token verification errors never include the provider error', () => {
  const error = new TokenVerificationError('id-token');
  assert.equal(error.message, 'Token verification failed');
  assert.equal(error.kind, 'id-token');
  assert.equal(error.message.includes('secret-provider-message'), false);
});

test('token verifier contract requires both methods', () => {
  const verifier = {
    verifyIdToken: async () => ({ uid: 'user_alpha' }),
    verifyAppCheckToken: async () => ({ appId: 'elsewhere-web-dev' }),
  };
  assert.equal(assertTokenVerifier(verifier), verifier);
  assert.throws(() => assertTokenVerifier({}), /verifyIdToken/);
  assert.throws(() => assertTokenVerifier({ verifyIdToken() {} }), /verifyAppCheckToken/);
});
