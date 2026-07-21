import {
  ConnectionInputSchema,
  DiscoveryInputSchema,
  IdSchema,
  NoteInputSchema,
  ReviewInputSchema,
  parseSettingInput,
} from './schemas.js';

const INVALID = Object.freeze({ code: 'experience/invalid-request', message: 'Request is invalid' });
const UNAVAILABLE = Object.freeze({
  code: 'experience/unavailable',
  message: 'Experience service is temporarily unavailable',
});

function assertService(service) {
  for (const method of [
    'getSnapshot', 'saveReview', 'saveConnection', 'saveDiscovery', 'saveNote',
    'saveSetting', 'excludeJourney',
  ]) {
    if (typeof service?.[method] !== 'function') {
      throw new TypeError(`Experience service must implement ${method}()`);
    }
  }
  return service;
}

function sendError(request, reply, status, error) {
  return reply.code(status).send(Object.freeze({
    error: Object.freeze({ ...error, requestId: request.id }),
  }));
}

export function registerExperienceRoutes(app, { requireAuth, experienceService } = {}) {
  if (typeof requireAuth !== 'function') throw new TypeError('requireAuth is required');
  const service = assertService(experienceService);

  const execute = async (request, reply, operation) => {
    try {
      const userState = await operation(request.authContext.uid);
      return reply.code(200).send(Object.freeze({ userState }));
    } catch (error) {
      request.log.error({
        errorName: typeof error?.name === 'string' ? error.name : 'Error',
      }, 'experience operation failed');
      return sendError(request, reply, 503, UNAVAILABLE);
    }
  };

  app.get('/v1/experience-snapshot', { preHandler: requireAuth }, async (request, reply) => {
    try {
      return reply.code(200).send(await service.getSnapshot(request.authContext.uid));
    } catch (error) {
      request.log.error({
        errorName: typeof error?.name === 'string' ? error.name : 'Error',
      }, 'experience snapshot failed');
      return sendError(request, reply, 503, UNAVAILABLE);
    }
  });

  app.put('/v1/experience/reviews/:itemId', { preHandler: requireAuth }, (request, reply) => {
    const itemId = IdSchema.safeParse(request.params.itemId);
    const body = ReviewInputSchema.safeParse(request.body);
    if (!itemId.success || !body.success) return sendError(request, reply, 400, INVALID);
    return execute(request, reply, (ownerId) => service.saveReview(ownerId, {
      itemId: itemId.data,
      ...body.data,
    }));
  });

  app.put('/v1/experience/connections/:connectionId', { preHandler: requireAuth }, (request, reply) => {
    const connectionId = IdSchema.safeParse(request.params.connectionId);
    const body = ConnectionInputSchema.safeParse(request.body);
    if (!connectionId.success || !body.success) return sendError(request, reply, 400, INVALID);
    return execute(request, reply, (ownerId) => service.saveConnection(ownerId, {
      connectionId: connectionId.data,
      ...body.data,
    }));
  });

  app.put('/v1/experience/discoveries/:discoveryId', { preHandler: requireAuth }, (request, reply) => {
    const discoveryId = IdSchema.safeParse(request.params.discoveryId);
    const body = DiscoveryInputSchema.safeParse(request.body);
    if (!discoveryId.success || !body.success) return sendError(request, reply, 400, INVALID);
    return execute(request, reply, (ownerId) => service.saveDiscovery(ownerId, {
      discoveryId: discoveryId.data,
      ...body.data,
    }));
  });

  app.put('/v1/experience/notes/:noteId', { preHandler: requireAuth }, (request, reply) => {
    const noteId = IdSchema.safeParse(request.params.noteId);
    const body = NoteInputSchema.safeParse(request.body);
    if (!noteId.success || !body.success) return sendError(request, reply, 400, INVALID);
    return execute(request, reply, (ownerId) => service.saveNote(ownerId, {
      noteId: noteId.data,
      ...body.data,
    }));
  });

  app.put('/v1/experience/settings/:key', { preHandler: requireAuth }, (request, reply) => {
    const input = parseSettingInput(request.params.key, request.body);
    if (!input) return sendError(request, reply, 400, INVALID);
    return execute(request, reply, (ownerId) => service.saveSetting(ownerId, input));
  });

  app.delete('/v1/experience/journeys/:journeyId', { preHandler: requireAuth }, (request, reply) => {
    const journeyId = IdSchema.safeParse(request.params.journeyId);
    if (!journeyId.success) return sendError(request, reply, 400, INVALID);
    return execute(request, reply, (ownerId) => service.excludeJourney(ownerId, {
      journeyId: journeyId.data,
    }));
  });
}
