import { createApp } from '../app.js';
import { registerAuthBoundary } from '../auth/boundary.js';
import { registerImportRoutes } from '../imports/routes.js';
import { createImportService } from '../imports/service.js';
import { registerDemoRoutes } from './routes.js';

export function createDemoComposition({
  appConfig,
  repository,
  tokenVerifier,
  allowedAppIds,
  demoRepository,
  finalizeUpload,
  projectSnapshot,
  storageBucket,
  randomUUID,
  clock,
}) {
  const app = createApp({ appConfig });
  const requireAuth = registerAuthBoundary(app, { tokenVerifier, allowedAppIds });
  const importService = createImportService({ repository, randomUUID, clock });
  registerImportRoutes(app, { requireAuth, importService });
  registerDemoRoutes(app, {
    requireAuth,
    demoRepository,
    finalizeUpload,
    projectSnapshot,
    storageBucket,
    clock,
  });
  return app;
}
