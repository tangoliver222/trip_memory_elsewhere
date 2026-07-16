import { createApp } from '../../src/app.js';
import { registerAuthBoundary } from '../../src/auth/boundary.js';

const appConfig = { nodeEnv: 'test', bodyLimit: 32 * 1024, logLevel: 'silent' };

export function createProtectedTestApp({ tokenVerifier, allowedAppIds, repository }) {
  const app = createApp({ appConfig });
  const requireAuth = registerAuthBoundary(app, { tokenVerifier, allowedAppIds });
  const calls = { handler: 0 };

  app.post('/protected', { preHandler: requireAuth }, async (request) => {
    calls.handler += 1;
    return {
      authContext: request.authContext,
      fragment: await repository.getFragment(request.authContext.uid, 'frag_12345678'),
    };
  });

  return { app, calls };
}
