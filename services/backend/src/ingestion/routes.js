import { IngestionError } from './errors.js';
import { parseStorageFinalizedEvent } from './storage-event.js';

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

export function registerIngestionRoutes(app, { finalizer, allowedBuckets }) {
  if (typeof finalizer?.handle !== 'function') {
    throw new TypeError('Finalizer must implement handle()');
  }

  app.post('/events/storage-finalized', async (request, reply) => {
    try {
      const event = parseStorageFinalizedEvent({
        headers: request.headers,
        body: request.body,
        allowedBuckets,
      });
      const result = await finalizer.handle(event);
      if (!['applied', 'duplicate', 'rejected'].includes(result?.outcome)) {
        throw internalError();
      }
      return reply.code(204).send();
    } catch (caught) {
      const error = caught instanceof IngestionError ? caught : internalError();
      return reply
        .code(STATUS_BY_CODE[error.code] ?? 503)
        .send(errorResponse(error, request.id));
    }
  });
}
