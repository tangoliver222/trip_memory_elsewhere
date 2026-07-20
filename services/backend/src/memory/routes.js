import { projectMemorySnapshot } from './snapshot.js';

const UNAVAILABLE = Object.freeze({
  code: 'memory/unavailable',
  message: 'Memory snapshot is temporarily unavailable',
});

export function registerMemorySnapshotRoutes(app, { requireAuth, memorySnapshotReader } = {}) {
  if (typeof requireAuth !== 'function') throw new TypeError('requireAuth is required');
  if (typeof memorySnapshotReader?.readOwnerSnapshot !== 'function') {
    throw new TypeError('Memory snapshot reader must implement readOwnerSnapshot()');
  }

  app.get('/v1/memory-snapshot', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const ownerId = request.authContext.uid;
      const source = await memorySnapshotReader.readOwnerSnapshot(ownerId);
      return reply.code(200).send(projectMemorySnapshot({ ownerId, ...source }));
    } catch (error) {
      request.log.error({
        errorName: typeof error?.name === 'string' ? error.name : 'Error',
      }, 'memory snapshot failed');
      return reply.code(503).send(Object.freeze({
        error: Object.freeze({ ...UNAVAILABLE, requestId: request.id }),
      }));
    }
  });
}
