import { randomUUID } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { createFirebaseDerivativeStore } from '../adapters/firebase-derivative-store.js';
import { createFirebaseCapabilityArtifactReader } from '../adapters/firebase-capability-artifact-reader.js';
import { createFirebaseObjectInspector } from '../adapters/firebase-object-inspector.js';
import { createFirebaseSourceMaterializer } from '../adapters/firebase-source-materializer.js';
import { createFirebaseThumbnailReader } from '../adapters/firebase-thumbnail-reader.js';
import { createMediaMetadataReader } from '../adapters/media-metadata-reader.js';
import { createSharpImageProcessor } from '../adapters/sharp-image-processor.js';
import { createSharpRoutingFeatureReader } from '../adapters/sharp-routing-feature-reader.js';
import { createCapabilityScheduler } from '../capabilities/scheduler.js';
import { createStorageFinalizedPipeline } from '../ingestion/pipeline.js';
import { createOriginalFinalizer } from '../ingestion/service.js';
import { createDeterministicProcessor } from '../processing/service.js';
import { createFirestoreRepository } from '../repositories/firestore.js';
import { createAuthoritativeRouter } from '../routing/service.js';
import { createDemoComposition } from './composition.js';
import { createDemoElseService, createGeminiElseProvider } from './else-service.js';
import { projectCompetitionSnapshot } from './projection.js';
import { createDemoRepository } from './repository.js';

export function createDemoRuntime({
  appConfig,
  firebase,
  tokenVerifier,
  allowedAppIds,
  storageBucket,
  afterFinalize,
  clock = () => new Date().toISOString(),
  uuid = randomUUID,
}) {
  const repository = createFirestoreRepository({ db: firebase.db });
  const storageConfig = Object.freeze({
    storage: firebase.storage,
    allowedBuckets: [storageBucket],
  });
  const materializer = createFirebaseSourceMaterializer(storageConfig);
  const deterministicProcessor = createDeterministicProcessor({
    repository,
    materializer,
    metadataReader: createMediaMetadataReader({ limits: appConfig.processing.limits }),
    imageProcessor: createSharpImageProcessor({ limits: appConfig.processing.limits }),
    derivativeStore: createFirebaseDerivativeStore(storageConfig),
    processingConfig: appConfig.processing,
    clock,
    randomUUID: uuid,
  });
  const featureReader = createSharpRoutingFeatureReader({
    thumbnailReader: createFirebaseThumbnailReader(storageConfig),
  });
  const authoritativeRouter = createAuthoritativeRouter({
    repository,
    featureReader,
    clock,
    randomUUID: uuid,
  });
  const capabilityScheduler = createCapabilityScheduler({
    repository,
    dispatcher: Object.freeze({
      async enqueueOcrTask({ taskName }) {
        return Object.freeze({ outcome: 'created', taskName });
      },
    }),
    providerVersion: appConfig.capabilities.ocr.providerVersion,
    clock,
  });
  const finalizeUpload = createStorageFinalizedPipeline({
    originalFinalizer: createOriginalFinalizer({
      repository,
      objectInspector: createFirebaseObjectInspector(storageConfig),
      clock,
    }),
    deterministicProcessor,
    authoritativeRouter,
    capabilityScheduler,
  });
  const demoRepository = createDemoRepository({
    db: firebase.db,
    storage: firebase.storage,
    storageBucket,
    routingRepository: repository,
    artifactReader: createFirebaseCapabilityArtifactReader(storageConfig),
  });
  const hasGemini = Boolean(
    appConfig.apiKey || (appConfig.useVertex && appConfig.vertexProject),
  );
  const geminiClient = hasGemini
    ? new GoogleGenAI(appConfig.useVertex
      ? { vertexai: true, project: appConfig.vertexProject, location: appConfig.vertexLocation }
      : { apiKey: appConfig.apiKey })
    : null;
  const elseService = createDemoElseService({
    provider: geminiClient
      ? createGeminiElseProvider({ client: geminiClient, model: appConfig.models.FAST_MULTIMODAL })
      : null,
  });

  return createDemoComposition({
    appConfig,
    repository,
    tokenVerifier,
    allowedAppIds,
    demoRepository,
    finalizeUpload,
    afterFinalize,
    elseService,
    projectSnapshot: projectCompetitionSnapshot,
    storageBucket,
    randomUUID: uuid,
    clock,
  });
}
