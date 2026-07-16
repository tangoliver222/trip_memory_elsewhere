import { ImportServiceError } from './errors.js';

const STATUS_BY_CODE = Object.freeze({
  'import/invalid-request': 400,
  'import/batch-not-found': 404,
  'import/batch-conflict': 409,
});

const INTERNAL_ERROR = Object.freeze({
  code: 'internal/error',
  message: 'Request could not be completed',
});

const errorResponse = (error, requestId) => {
  const publicError = error instanceof ImportServiceError
    ? { code: error.code, message: error.message }
    : INTERNAL_ERROR;
  return Object.freeze({
    error: Object.freeze({ ...publicError, requestId }),
  });
};

export function registerImportRoutes(app, { requireAuth, importService }) {
  if (typeof requireAuth !== 'function') throw new TypeError('requireAuth is required');
  for (const method of ['createBatch', 'getReceipt']) {
    if (typeof importService?.[method] !== 'function') {
      throw new TypeError(`Import service must implement ${method}()`);
    }
  }

  app.post('/v1/import-batches', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const result = await importService.createBatch(request.authContext.uid, request.body);
      return reply.code(201).send(result);
    } catch (error) {
      const status = error instanceof ImportServiceError
        ? STATUS_BY_CODE[error.code]
        : 500;
      return reply.code(status ?? 500).send(errorResponse(error, request.id));
    }
  });

  app.get('/v1/import-batches/:batchId', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const receipt = await importService.getReceipt(
        request.authContext.uid,
        request.params.batchId,
      );
      return reply.code(200).send(receipt);
    } catch (error) {
      const status = error instanceof ImportServiceError
        ? STATUS_BY_CODE[error.code]
        : 500;
      return reply.code(status ?? 500).send(errorResponse(error, request.id));
    }
  });
}
