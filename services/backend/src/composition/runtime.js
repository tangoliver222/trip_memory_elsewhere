import { randomUUID as nodeRandomUUID } from 'node:crypto';
import { createFirebaseDerivativeStore } from '../adapters/firebase-derivative-store.js';
import { createFirebaseObjectInspector } from '../adapters/firebase-object-inspector.js';
import { createFirebaseSourceMaterializer } from '../adapters/firebase-source-materializer.js';
import { createFirebaseThumbnailReader } from '../adapters/firebase-thumbnail-reader.js';
import { createFirebaseTokenVerifier } from '../adapters/firebase-token-verifier.js';
import { createFirebaseAdmin } from '../adapters/firebase.js';
import { createMediaMetadataReader } from '../adapters/media-metadata-reader.js';
import { createSharpImageProcessor } from '../adapters/sharp-image-processor.js';
import { createSharpRoutingFeatureReader } from '../adapters/sharp-routing-feature-reader.js';
import { createDeterministicProcessor } from '../processing/service.js';
import { createFirestoreRepository } from '../repositories/firestore.js';
import { createAuthoritativeRouter } from '../routing/service.js';
import { createApiComposition } from './api.js';
import { createIngestionComposition } from './ingestion.js';

export function createRuntimeApp(appConfig, {
  firebaseFactory = createFirebaseAdmin,
  repositoryFactory = createFirestoreRepository,
  objectInspectorFactory = createFirebaseObjectInspector,
  sourceMaterializerFactory = createFirebaseSourceMaterializer,
  metadataReaderFactory = createMediaMetadataReader,
  imageProcessorFactory = createSharpImageProcessor,
  derivativeStoreFactory = createFirebaseDerivativeStore,
  deterministicProcessorFactory = createDeterministicProcessor,
  thumbnailReaderFactory = createFirebaseThumbnailReader,
  routingFeatureReaderFactory = createSharpRoutingFeatureReader,
  authoritativeRouterFactory = createAuthoritativeRouter,
  clock = () => new Date().toISOString(),
  randomUUID = nodeRandomUUID,
} = {}) {
  const firebase = firebaseFactory({
    projectId: appConfig.firebaseProjectId,
    appName: `elsewhere-${appConfig.serviceMode}`,
  });
  const repository = repositoryFactory({ db: firebase.db });

  if (appConfig.serviceMode === 'api') {
    return createApiComposition({
      appConfig,
      repository,
      tokenVerifier: createFirebaseTokenVerifier({
        auth: firebase.auth,
        appCheck: firebase.appCheck,
      }),
      allowedAppIds: appConfig.allowedAppIds,
    });
  }

  if (appConfig.serviceMode === 'ingestion') {
    const adapterConfig = Object.freeze({
      storage: firebase.storage,
      allowedBuckets: appConfig.storageBuckets,
    });
    const objectInspector = objectInspectorFactory(adapterConfig);
    const materializer = sourceMaterializerFactory(adapterConfig);
    const metadataReader = metadataReaderFactory({ limits: appConfig.processing?.limits });
    const imageProcessor = imageProcessorFactory({ limits: appConfig.processing?.limits });
    const derivativeStore = derivativeStoreFactory(adapterConfig);
    const deterministicProcessor = deterministicProcessorFactory({
      repository,
      materializer,
      metadataReader,
      imageProcessor,
      derivativeStore,
      processingConfig: appConfig.processing,
      clock,
      randomUUID,
    });
    const thumbnailReader = thumbnailReaderFactory(adapterConfig);
    const featureReader = routingFeatureReaderFactory({ thumbnailReader });
    const authoritativeRouter = authoritativeRouterFactory({
      repository,
      featureReader,
      clock,
      randomUUID,
    });
    return createIngestionComposition({
      appConfig,
      repository,
      objectInspector,
      deterministicProcessor,
      authoritativeRouter,
      allowedBuckets: appConfig.storageBuckets,
      clock,
    });
  }

  throw new TypeError('Unsupported Elsewhere service mode');
}
