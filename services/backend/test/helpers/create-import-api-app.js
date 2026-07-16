import { createApp } from '../../src/app.js';
import { registerAuthBoundary } from '../../src/auth/boundary.js';
import { createImportService } from '../../src/imports/service.js';
import { registerImportRoutes } from '../../src/imports/routes.js';
import { createMemoryRepository } from '../../src/repositories/memory.js';

const appConfig = { nodeEnv: 'test', bodyLimit: 32 * 1024, logLevel: 'silent' };

const defaultVerifier = {
  async verifyIdToken(token) {
    if (token === 'id-user-alpha') return { uid: 'user_alpha' };
    if (token === 'id-user-beta') return { uid: 'user_beta' };
    throw new Error('invalid ID token');
  },
  async verifyAppCheckToken(token) {
    if (token !== 'valid-app-check') throw new Error('invalid App Check token');
    return { appId: 'elsewhere-web-test' };
  },
};

const uuidSequence = () => {
  let value = 0;
  return () => `00000000-0000-4000-8000-${String(value += 1).padStart(12, '0')}`;
};

export function createImportApiTestApp({
  repository = createMemoryRepository(),
  importService,
  tokenVerifier = defaultVerifier,
  allowedAppIds = ['elsewhere-web-test'],
} = {}) {
  const app = createApp({ appConfig });
  const requireAuth = registerAuthBoundary(app, { tokenVerifier, allowedAppIds });
  const service = importService ?? createImportService({
    repository,
    randomUUID: uuidSequence(),
    clock: () => '2026-07-16T05:30:00.000Z',
  });
  registerImportRoutes(app, { requireAuth, importService: service });
  return { app, repository, importService: service };
}
