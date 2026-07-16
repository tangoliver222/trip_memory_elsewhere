import { assertTokenVerifier } from './contract.js';
import { authErrorResponse } from './errors.js';
import { parseAppCheckToken, parseBearerToken } from './headers.js';

const reject = (reply, code, requestId) => (
  reply.code(401).send(authErrorResponse(code, requestId))
);

export function registerAuthBoundary(app, { tokenVerifier, allowedAppIds }) {
  const verifier = assertTokenVerifier(tokenVerifier);
  if (!Array.isArray(allowedAppIds)
    || allowedAppIds.length === 0
    || allowedAppIds.some((value) => (
      typeof value !== 'string' || value !== value.trim() || !value
    ))) {
    throw new TypeError('allowedAppIds must be a non-empty string array');
  }

  const allowed = new Set(allowedAppIds);
  app.decorateRequest('authContext', null);

  return async function requireAuth(request, reply) {
    const authorization = request.headers.authorization;
    if (authorization === undefined) {
      return reject(reply, 'auth/missing-id-token', request.id);
    }
    const idToken = parseBearerToken(authorization);
    if (!idToken) return reject(reply, 'auth/invalid-id-token', request.id);

    let identity;
    try {
      identity = await verifier.verifyIdToken(idToken);
      if (typeof identity?.uid !== 'string' || !identity.uid) throw new Error();
    } catch {
      return reject(reply, 'auth/invalid-id-token', request.id);
    }

    const appCheckHeader = request.headers['x-firebase-appcheck'];
    if (appCheckHeader === undefined) {
      return reject(reply, 'app-check/missing-token', request.id);
    }
    const appCheckToken = parseAppCheckToken(appCheckHeader);
    if (!appCheckToken) return reject(reply, 'app-check/invalid-token', request.id);

    let application;
    try {
      application = await verifier.verifyAppCheckToken(appCheckToken);
      if (!allowed.has(application?.appId)) throw new Error();
    } catch {
      return reject(reply, 'app-check/invalid-token', request.id);
    }

    Object.defineProperty(request, 'authContext', {
      value: Object.freeze({ uid: identity.uid, appId: application.appId }),
      writable: false,
      enumerable: true,
      configurable: false,
    });
  };
}
