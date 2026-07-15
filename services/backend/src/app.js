import Fastify from 'fastify';
import { config } from './config.js';

export function createApp({ appConfig = config } = {}) {
  const app = Fastify({
    logger: appConfig.logLevel === 'silent' ? false : { level: appConfig.logLevel },
    bodyLimit: appConfig.bodyLimit,
  });

  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/readyz', async () => ({ status: 'ready' }));

  return app;
}
