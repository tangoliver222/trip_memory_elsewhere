import { randomUUID } from 'node:crypto';
import { createFirebaseDerivativeStore } from '../src/adapters/firebase-derivative-store.js';
import { createFirebaseObjectInspector } from '../src/adapters/firebase-object-inspector.js';
import { createFirebaseSourceMaterializer } from '../src/adapters/firebase-source-materializer.js';
import { createFirebaseThumbnailReader } from '../src/adapters/firebase-thumbnail-reader.js';
import { createFirebaseAdmin } from '../src/adapters/firebase.js';
import { createMediaMetadataReader } from '../src/adapters/media-metadata-reader.js';
import { createSharpImageProcessor } from '../src/adapters/sharp-image-processor.js';
import { createSharpRoutingFeatureReader } from '../src/adapters/sharp-routing-feature-reader.js';
import { createCapabilityScheduler } from '../src/capabilities/scheduler.js';
import { config } from '../src/config.js';
import { createDemoComposition } from '../src/demo/composition.js';
import { projectCompetitionSnapshot } from '../src/demo/projection.js';
import { createDemoRepository } from '../src/demo/repository.js';
import { createStorageFinalizedPipeline } from '../src/ingestion/pipeline.js';
import { createOriginalFinalizer } from '../src/ingestion/service.js';
import { createDeterministicProcessor } from '../src/processing/service.js';
import { createFirestoreRepository } from '../src/repositories/firestore.js';
import { createAuthoritativeRouter } from '../src/routing/service.js';

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

const storageBucket = config.storageBuckets[0];
const firebase = createFirebaseAdmin({
  projectId: config.firebaseProjectId,
  appName: 'elsewhere-local-competition-demo',
});
const repository = createFirestoreRepository({ db: firebase.db });
const storageConfig = Object.freeze({
  storage: firebase.storage,
  allowedBuckets: [storageBucket],
});
const materializer = createFirebaseSourceMaterializer(storageConfig);
const metadataReader = createMediaMetadataReader({ limits: config.processing.limits });
const imageProcessor = createSharpImageProcessor({ limits: config.processing.limits });
const derivativeStore = createFirebaseDerivativeStore(storageConfig);
const deterministicProcessor = createDeterministicProcessor({
  repository,
  materializer,
  metadataReader,
  imageProcessor,
  derivativeStore,
  processingConfig: config.processing,
  clock: () => new Date().toISOString(),
  randomUUID,
});
const thumbnailReader = createFirebaseThumbnailReader(storageConfig);
const featureReader = createSharpRoutingFeatureReader({ thumbnailReader });
const authoritativeRouter = createAuthoritativeRouter({
  repository,
  featureReader,
  clock: () => new Date().toISOString(),
  randomUUID,
});
const capabilityScheduler = createCapabilityScheduler({
  repository,
  dispatcher: Object.freeze({
    async enqueueOcrTask({ taskName }) {
      return Object.freeze({ outcome: 'created', taskName });
    },
  }),
  providerVersion: config.capabilities.ocr.providerVersion,
  clock: () => new Date().toISOString(),
});
const originalFinalizer = createOriginalFinalizer({
  repository,
  objectInspector: createFirebaseObjectInspector(storageConfig),
  clock: () => new Date().toISOString(),
});
const finalizeUpload = createStorageFinalizedPipeline({
  originalFinalizer,
  deterministicProcessor,
  authoritativeRouter,
  capabilityScheduler,
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
const demoRepository = createDemoRepository({
  db: firebase.db,
  storage: firebase.storage,
  storageBucket,
});
const app = createDemoComposition({
  appConfig: config,
  repository,
  tokenVerifier,
  allowedAppIds: ['elsewhere-web-local'],
  demoRepository,
  finalizeUpload,
  projectSnapshot: projectCompetitionSnapshot,
  storageBucket,
  randomUUID,
  clock: () => new Date().toISOString(),
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
