import { createApp } from '../app.js';
import { registerAuthBoundary } from '../auth/boundary.js';
import { registerImportRoutes } from '../imports/routes.js';
import { createImportService } from '../imports/service.js';
import { registerMemorySnapshotRoutes } from '../memory/routes.js';

export function createApiComposition({
  appConfig,
  repository,
  tokenVerifier,
  allowedAppIds,
  memorySnapshotReader,
  randomUUID,
  clock,
}) {
  const app = createApp({ appConfig });
  const requireAuth = registerAuthBoundary(app, { tokenVerifier, allowedAppIds });
  const importService = createImportService({ repository, randomUUID, clock });
  registerImportRoutes(app, { requireAuth, importService });
  if (memorySnapshotReader) {
    registerMemorySnapshotRoutes(app, { requireAuth, memorySnapshotReader });
  }
  return app;
}
