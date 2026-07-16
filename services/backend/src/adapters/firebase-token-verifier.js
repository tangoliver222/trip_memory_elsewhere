import { assertTokenVerifier } from '../auth/contract.js';
import { TokenVerificationError } from '../auth/errors.js';

export function createFirebaseTokenVerifier({ auth, appCheck }) {
  return assertTokenVerifier({
    async verifyIdToken(token) {
      try {
        const result = await auth.verifyIdToken(token);
        if (typeof result?.uid !== 'string' || !result.uid) throw new Error('missing uid');
        return Object.freeze({ uid: result.uid });
      } catch {
        throw new TokenVerificationError('id-token');
      }
    },

    async verifyAppCheckToken(token) {
      try {
        const result = await appCheck.verifyToken(token);
        if (typeof result?.appId !== 'string' || !result.appId) throw new Error('missing appId');
        return Object.freeze({ appId: result.appId });
      } catch {
        throw new TokenVerificationError('app-check');
      }
    },
  });
}
