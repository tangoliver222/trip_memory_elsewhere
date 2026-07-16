import { createApp } from '../app.js';
import { registerAuthBoundary } from '../auth/boundary.js';
import { registerImportRoutes } from '../imports/routes.js';
import { createImportService } from '../imports/service.js';

export function createApiComposition({
  appConfig,
  repository,
  tokenVerifier,
  allowedAppIds,
  randomUUID,
  clock,
}) {
  const app = createApp({ appConfig });
  const requireAuth = registerAuthBoundary(app, { tokenVerifier, allowedAppIds });
  const importService = createImportService({ repository, randomUUID, clock });
  registerImportRoutes(app, { requireAuth, importService });
  return app;
}
