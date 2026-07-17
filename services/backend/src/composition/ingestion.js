import { createApp } from '../app.js';
import { registerIngestionRoutes } from '../ingestion/routes.js';
import { createStorageFinalizedPipeline } from '../ingestion/pipeline.js';
import { createOriginalFinalizer } from '../ingestion/service.js';

export function createIngestionComposition({
  appConfig,
  repository,
  objectInspector,
  deterministicProcessor,
  authoritativeRouter,
  capabilityScheduler,
  allowedBuckets,
  clock,
}) {
  const app = createApp({ appConfig });
  const finalizer = createOriginalFinalizer({ repository, objectInspector, clock });
  const eventHandler = createStorageFinalizedPipeline({
    originalFinalizer: finalizer,
    deterministicProcessor,
    authoritativeRouter,
    capabilityScheduler,
  });
  registerIngestionRoutes(app, { eventHandler, allowedBuckets });
  return app;
}
