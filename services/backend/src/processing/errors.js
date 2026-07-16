import {
  PROCESSING_ERROR_CODES,
  ProcessingErrorCodeSchema,
} from '../domain/processing-task.js';

const [
  TASK_BUSY,
  SOFT_TIMEOUT,
  STORAGE_UNAVAILABLE,
  REPOSITORY_UNAVAILABLE,
  MEDIA_LIMITS_EXCEEDED,
  INVALID_MEDIA,
  DERIVATIVE_CONFLICT,
] = PROCESSING_ERROR_CODES;

const MESSAGES = Object.freeze({
  [TASK_BUSY]: 'Processing task is busy',
  [SOFT_TIMEOUT]: 'Processing exceeded its safe deadline',
  [STORAGE_UNAVAILABLE]: 'Processing storage is temporarily unavailable',
  [REPOSITORY_UNAVAILABLE]: 'Processing repository is temporarily unavailable',
  [MEDIA_LIMITS_EXCEEDED]: 'Media exceeds processing limits',
  [INVALID_MEDIA]: 'Media is invalid',
  [DERIVATIVE_CONFLICT]: 'Derivative conflicts with existing output',
});

export class ProcessingError extends Error {
  constructor(code, { retryable }) {
    const parsed = ProcessingErrorCodeSchema.safeParse(code);
    if (!parsed.success) throw new TypeError('Unknown processing error code');
    if (typeof retryable !== 'boolean') throw new TypeError('Processing retryability is required');

    super(MESSAGES[parsed.data]);
    Object.defineProperty(this, 'name', { value: 'ProcessingError' });
    this.code = parsed.data;
    this.retryable = retryable;
  }
}

export const retryableProcessingError = (code) => new ProcessingError(
  code,
  { retryable: true },
);

export const terminalProcessingError = (code) => new ProcessingError(
  code,
  { retryable: false },
);
