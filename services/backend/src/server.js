import { createRuntimeApp } from './composition/runtime.js';
import { config } from './config.js';

const app = createRuntimeApp(config);

const close = async (signal) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  process.exit(0);
};

process.once('SIGINT', () => void close('SIGINT'));
process.once('SIGTERM', () => void close('SIGTERM'));

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error({ err: error }, 'startup failed');
  process.exit(1);
}
