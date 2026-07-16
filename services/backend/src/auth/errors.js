const DEFINITIONS = Object.freeze({
  'auth/missing-id-token': 'Sign in and retry.',
  'auth/invalid-id-token': 'Refresh your session and retry.',
  'app-check/missing-token': 'Refresh the app session and retry.',
  'app-check/invalid-token': 'Refresh the app session and retry.',
});

export function authErrorResponse(code, requestId) {
  const message = DEFINITIONS[code];
  if (!message) throw new TypeError(`Unknown auth error code: ${code}`);
  return Object.freeze({
    error: Object.freeze({ code, requestId, message }),
  });
}

export class TokenVerificationError extends Error {
  constructor(kind) {
    super('Token verification failed');
    this.name = 'TokenVerificationError';
    this.kind = kind;
  }
}
