import { createApp } from '../app.js';
import { registerCapabilityRoutes } from '../capabilities/routes.js';

export function createCapabilityWorkerComposition({ appConfig, worker }) {
  const app = createApp({ appConfig });
  registerCapabilityRoutes(app, { worker });
  return app;
}
