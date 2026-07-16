const MESSAGES = Object.freeze({
  'import/invalid-request': 'Invalid import request',
  'import/batch-not-found': 'Import batch not found',
  'import/batch-conflict': 'Import batch conflict',
});

export class ImportServiceError extends Error {
  constructor(code) {
    const message = MESSAGES[code];
    if (!message) throw new TypeError(`Unknown import error code: ${code}`);
    super(message);
    this.name = 'ImportServiceError';
    this.code = code;
  }
}
