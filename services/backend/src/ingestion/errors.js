const MESSAGES = Object.freeze({
  'ingestion/invalid-event': 'Invalid storage event',
  'ingestion/unregistered-original': 'Original is not registered',
  'ingestion/invalid-original': 'Original failed validation',
  'ingestion/original-conflict': 'Original generation conflict',
  'internal/error': 'Temporary ingestion failure',
});

export class IngestionError extends Error {
  constructor(code, { permanent }) {
    const message = MESSAGES[code];
    if (!message) throw new TypeError(`Unknown ingestion error code: ${code}`);
    super(message);
    this.name = 'IngestionError';
    this.code = code;
    this.permanent = permanent;
  }
}

export const invalidOriginal = () => new IngestionError(
  'ingestion/invalid-original',
  { permanent: true },
);

export const retryableIngestionError = () => new IngestionError(
  'internal/error',
  { permanent: false },
);
