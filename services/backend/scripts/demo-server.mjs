import { createFirebaseAdmin } from '../src/adapters/firebase.js';
import { config } from '../src/config.js';
import { createDemoRuntime } from '../src/demo/runtime.js';

const REQUIRED_DEMO_ENV = Object.freeze([
  'FIREBASE_AUTH_EMULATOR_HOST',
  'FIRESTORE_EMULATOR_HOST',
  'FIREBASE_STORAGE_EMULATOR_HOST',
]);

if (process.env.NODE_ENV !== 'development'
  || process.env.ELSEWHERE_DEMO_MODE !== 'true'
  || REQUIRED_DEMO_ENV.some((name) => !process.env[name])) {
  throw new Error('Demo server requires development mode and all Firebase Emulator hosts');
}

const firebase = createFirebaseAdmin({
  projectId: config.firebaseProjectId,
  appName: 'elsewhere-local-competition-demo',
});
const tokenVerifier = Object.freeze({
  async verifyIdToken(token) {
    const decoded = await firebase.auth.verifyIdToken(token);
    return Object.freeze({ uid: decoded.uid });
  },
  async verifyAppCheckToken(token) {
    if (token !== 'local-demo-app-check') throw new Error('Invalid local demo token');
    return Object.freeze({ appId: 'elsewhere-web-local' });
  },
});
const app = createDemoRuntime({
  appConfig: config,
  firebase,
  tokenVerifier,
  allowedAppIds: ['elsewhere-web-local'],
  storageBucket: config.storageBuckets[0],
});

const close = async (signal) => {
  app.log.info({ signal }, 'shutting down local competition demo');
  await app.close();
  process.exit(0);
};
process.once('SIGINT', () => void close('SIGINT'));
process.once('SIGTERM', () => void close('SIGTERM'));

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error({ err: error }, 'local competition demo startup failed');
  process.exit(1);
}
