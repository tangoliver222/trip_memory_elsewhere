import { createFirebaseTokenVerifier } from '../src/adapters/firebase-token-verifier.js';
import { createFirebaseAdmin } from '../src/adapters/firebase.js';
import { config } from '../src/config.js';
import { loadCloudDemoEnvironment } from '../src/demo/cloud-environment.js';
import { createDemoRuntime } from '../src/demo/runtime.js';

const cloud = loadCloudDemoEnvironment(process.env);
if (config.firebaseProjectId !== cloud.projectId
  || config.storageBuckets.length !== 1
  || config.storageBuckets[0] !== cloud.storageBucket
  || config.allowedAppIds.length !== cloud.allowedAppIds.length
  || config.allowedAppIds.some((value, index) => value !== cloud.allowedAppIds[index])) {
  throw new Error('Cloud demo environment does not match backend configuration');
}

const firebase = createFirebaseAdmin({
  projectId: cloud.projectId,
  appName: 'elsewhere-cloud-competition-demo',
});
const app = createDemoRuntime({
  appConfig: config,
  firebase,
  tokenVerifier: createFirebaseTokenVerifier({
    auth: firebase.auth,
    appCheck: firebase.appCheck,
  }),
  allowedAppIds: cloud.allowedAppIds,
  storageBucket: cloud.storageBucket,
});

const close = async (signal) => {
  app.log.info({ signal }, 'shutting down cloud competition demo');
  await app.close();
  process.exit(0);
};
process.once('SIGINT', () => void close('SIGINT'));
process.once('SIGTERM', () => void close('SIGTERM'));

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error({ err: error }, 'cloud competition demo startup failed');
  process.exit(1);
}
