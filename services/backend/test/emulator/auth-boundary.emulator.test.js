import assert from 'node:assert/strict';
import test from 'node:test';
import { deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { deleteApp as deleteClientApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { createFirebaseAdmin } from '../../src/adapters/firebase.js';
import { createFirebaseTokenVerifier } from '../../src/adapters/firebase-token-verifier.js';
import { createProtectedTestApp } from '../helpers/create-protected-app.js';

test('anonymous Auth Emulator identity reaches the protected handler', {
  skip: !process.env.FIREBASE_AUTH_EMULATOR_HOST,
}, async (t) => {
  const suffix = `${process.pid}-${Date.now()}`;
  const projectId = 'demo-elsewhere';
  const clientApp = initializeApp({ apiKey: 'demo-api-key', projectId }, `client-${suffix}`);
  const clientAuth = getAuth(clientApp);
  connectAuthEmulator(
    clientAuth,
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`,
    { disableWarnings: true },
  );

  const admin = createFirebaseAdmin({ projectId, appName: `admin-${suffix}` });
  const tokenVerifier = createFirebaseTokenVerifier({
    auth: admin.auth,
    appCheck: {
      async verifyToken(token) {
        if (token !== 'test-app-check') throw new Error('invalid test token');
        return { appId: 'elsewhere-web-dev' };
      },
    },
  });
  const repository = {
    async getFragment(uid) {
      return { ownerId: uid };
    },
  };
  const { app } = createProtectedTestApp({
    tokenVerifier,
    allowedAppIds: ['elsewhere-web-dev'],
    repository,
  });

  t.after(async () => {
    await app.close();
    await deleteClientApp(clientApp);
    await deleteAdminApp(admin.app);
  });

  const credential = await signInAnonymously(clientAuth);
  const idToken = await credential.user.getIdToken();
  const verified = await tokenVerifier.verifyIdToken(idToken);
  assert.equal(verified.uid, credential.user.uid);

  const response = await app.inject({
    method: 'POST',
    url: '/protected',
    headers: {
      authorization: `Bearer ${idToken}`,
      'x-firebase-appcheck': 'test-app-check',
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    authContext: {
      uid: credential.user.uid,
      appId: 'elsewhere-web-dev',
    },
    fragment: { ownerId: credential.user.uid },
  });
});
