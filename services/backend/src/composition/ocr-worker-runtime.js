import { createHash, randomUUID as nodeRandomUUID } from 'node:crypto';
import { createDocumentAiOcr } from '../adapters/document-ai-ocr.js';
import { createFirebaseCapabilityArtifactStore } from '../adapters/firebase-capability-artifact-store.js';
import { createFirebaseSourceMaterializer } from '../adapters/firebase-source-materializer.js';
import { normalizeDocumentAiOcr } from '../capabilities/ocr-normalizer.js';
import { createOcrCapabilityWorker } from '../capabilities/worker.js';

const fakeOcrProvider = Object.freeze({
  async process() { throw new Error('Fake OCR provider has no configured response'); },
});

function providerAuditId(documentAi) {
  const value = documentAi
    ? `${documentAi.projectId}/${documentAi.location}/${documentAi.processorId}`
    : 'fake/document-ai';
  return `processoraudit_${createHash('sha256').update(value).digest('hex').slice(0, 32)}`;
}

export function createOcrWorkerRuntime({
  appConfig,
  firebase,
  repository,
  sourceMaterializerFactory = createFirebaseSourceMaterializer,
  capabilityArtifactStoreFactory = createFirebaseCapabilityArtifactStore,
  documentAiOcrFactory = createDocumentAiOcr,
  capabilityWorkerFactory = createOcrCapabilityWorker,
  clock = () => new Date().toISOString(),
  randomUUID = nodeRandomUUID,
} = {}) {
  const adapterConfig = Object.freeze({
    storage: firebase?.storage,
    allowedBuckets: appConfig?.storageBuckets,
  });
  const providerVersion = appConfig?.capabilities?.ocr?.providerVersion;
  const documentAi = appConfig?.capabilities?.documentAi;
  const materializer = sourceMaterializerFactory(adapterConfig);
  const artifactStore = capabilityArtifactStoreFactory(adapterConfig);
  const ocrProvider = appConfig?.capabilities?.mode === 'google'
    ? documentAiOcrFactory({ config: documentAi })
    : fakeOcrProvider;
  return capabilityWorkerFactory({
    repository,
    materializer,
    ocrProvider,
    artifactStore,
    normalizer: normalizeDocumentAiOcr,
    clock,
    leaseOwnerFactory: () => `delivery_${randomUUID()}`,
    supportedVersions: Object.freeze({
      router: Object.freeze(['v1']),
      policy: Object.freeze(['v2', 'v3']),
      costModel: Object.freeze(['v2', 'v3']),
      executors: Object.freeze({ 'document-ocr': Object.freeze(['v1']) }),
      providers: Object.freeze({
        'document-ai-enterprise-ocr': Object.freeze([providerVersion]),
      }),
    }),
    providerMetadata: Object.freeze({
      endpointRegion: documentAi?.location ?? 'local',
      pricingVersion: 'document-ai-enterprise-ocr-2026-07-17',
      processorAuditId: providerAuditId(documentAi),
      unitCostMicros: 1_500,
    }),
  });
}
