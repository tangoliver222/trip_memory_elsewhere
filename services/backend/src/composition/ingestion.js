import { createApp } from '../app.js';
import { registerIngestionRoutes } from '../ingestion/routes.js';
import { createOriginalFinalizer } from '../ingestion/service.js';

export function createIngestionComposition({
  appConfig,
  repository,
  objectInspector,
  allowedBuckets,
  clock,
}) {
  const app = createApp({ appConfig });
  const finalizer = createOriginalFinalizer({ repository, objectInspector, clock });
  registerIngestionRoutes(app, { finalizer, allowedBuckets });
  return app;
}
