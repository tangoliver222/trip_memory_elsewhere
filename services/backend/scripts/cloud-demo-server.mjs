import { createFirebaseTokenVerifier } from '../src/adapters/firebase-token-verifier.js';
import { createFirebaseAdmin } from '../src/adapters/firebase.js';
import { createOcrWorkerRuntime } from '../src/composition/ocr-worker-runtime.js';
import { config } from '../src/config.js';
import {
  loadCloudDemoEnvironment,
  loadCloudOcrEnvironment,
} from '../src/demo/cloud-environment.js';
import { createCloudOcrCoordinator } from '../src/demo/cloud-ocr-coordinator.js';
import { createDemoRuntime } from '../src/demo/runtime.js';
import { createFirestoreRepository } from '../src/repositories/firestore.js';

const cloud = loadCloudDemoEnvironment(process.env);
const cloudOcr = loadCloudOcrEnvironment(process.env, cloud.projectId);
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
const ocrRepository = cloudOcr ? createFirestoreRepository({ db: firebase.db }) : null;
const afterFinalize = cloudOcr
  ? createCloudOcrCoordinator({
    repository: ocrRepository,
    worker: createOcrWorkerRuntime({
      appConfig: Object.freeze({
        ...config,
        storageBuckets: Object.freeze([cloud.storageBucket]),
        capabilities: Object.freeze({
          ...config.capabilities,
          mode: 'google',
          ocr: Object.freeze({
            ...config.capabilities.ocr,
            providerVersion: cloudOcr.providerVersion,
          }),
          documentAi: cloudOcr.documentAi,
        }),
      }),
      firebase,
      repository: ocrRepository,
    }),
  })
  : undefined;
const app = createDemoRuntime({
  appConfig: config,
  firebase,
  tokenVerifier: createFirebaseTokenVerifier({
    auth: firebase.auth,
    appCheck: firebase.appCheck,
  }),
  allowedAppIds: cloud.allowedAppIds,
  storageBucket: cloud.storageBucket,
  afterFinalize,
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
