import { IngestionError } from './errors.js';
import { parseStorageFinalizedEvent } from './storage-event.js';
import { ProcessingError } from '../processing/errors.js';

const STATUS_BY_CODE = Object.freeze({
  'ingestion/invalid-event': 400,
  'ingestion/unregistered-original': 400,
  'ingestion/original-conflict': 409,
  'internal/error': 503,
});

const internalError = () => new IngestionError('internal/error', { permanent: false });

const errorResponse = (error, requestId) => Object.freeze({
  error: Object.freeze({
    code: error.code,
    message: error.message,
    requestId,
  }),
});

const ACKNOWLEDGED_OUTCOMES = new Set([
  'rejected',
  'succeeded',
  'failed_terminal',
  'terminal_noop',
]);

export function registerIngestionRoutes(app, { eventHandler, allowedBuckets }) {
  if (typeof eventHandler?.handle !== 'function') {
    throw new TypeError('Event handler must implement handle()');
  }

  app.post('/events/storage-finalized', async (request, reply) => {
    try {
      const event = parseStorageFinalizedEvent({
        headers: request.headers,
        body: request.body,
        allowedBuckets,
      });
      const result = await eventHandler.handle(event);
      if (!result
        || typeof result !== 'object'
        || Array.isArray(result)
        || Object.keys(result).length !== 1
        || !Object.hasOwn(result, 'outcome')
        || !ACKNOWLEDGED_OUTCOMES.has(result.outcome)) {
        throw internalError();
      }
      return reply.code(204).send();
    } catch (caught) {
      const error = caught instanceof IngestionError || caught instanceof ProcessingError
        ? caught
        : internalError();
      return reply
        .code(STATUS_BY_CODE[error.code] ?? 503)
        .send(errorResponse(error, request.id));
    }
  });
}
