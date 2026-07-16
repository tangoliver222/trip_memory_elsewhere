import { createApp } from '../../src/app.js';
import { registerIngestionRoutes } from '../../src/ingestion/routes.js';

const appConfig = { nodeEnv: 'test', bodyLimit: 32 * 1024, logLevel: 'silent' };

export function createIngestionTestApp({ finalizer }) {
  const app = createApp({ appConfig });
  registerIngestionRoutes(app, {
    finalizer,
    allowedBuckets: ['demo-elsewhere.appspot.com'],
  });
  return app;
}
