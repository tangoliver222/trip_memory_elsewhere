import { z } from 'zod';
import { IdSchema } from '../domain/index.js';

const DEMO_HEADER = 'local-competition-v1';
const FinalizeSchema = z.strictObject({
  batchId: IdSchema,
  fragmentId: IdSchema,
});
const DecisionSchema = z.strictObject({
  decision: z.enum(['yes', 'no', 'later']),
  placeId: IdSchema.optional(),
});
const ResetSchema = z.strictObject({ confirm: z.literal('reset-local-demo') });
const ElseScopeSchema = z.strictObject({
  type: z.enum(['world', 'city', 'fragments', 'fragment', 'discovery']),
  id: IdSchema.optional(),
});
const ElseQuestionSchema = z.strictObject({
  question: z.string().trim().min(1).max(500),
  scope: ElseScopeSchema,
});

const STATUS = Object.freeze({
  'demo/invalid-request': 400,
  'demo/forbidden': 403,
  'demo/not-found': 404,
  'demo/conflict': 409,
  'demo/unavailable': 503,
});

class DemoError extends Error {
  constructor(code) {
    super({
      'demo/invalid-request': 'Request is invalid',
      'demo/forbidden': 'Demo access is forbidden',
      'demo/not-found': 'Resource was not found',
      'demo/conflict': 'Resource state has changed',
      'demo/unavailable': 'Demo service is unavailable',
    }[code]);
    this.code = code;
  }
}

function errorResponse(error, requestId) {
  const safe = error instanceof DemoError ? error : new DemoError('demo/unavailable');
  return Object.freeze({
    status: STATUS[safe.code],
    body: Object.freeze({
      error: Object.freeze({ code: safe.code, message: safe.message, requestId }),
    }),
  });
}

function assertPort(port, methods, name) {
  for (const method of methods) {
    if (typeof port?.[method] !== 'function') throw new TypeError(`${name} must implement ${method}()`);
  }
  return port;
}

export function registerDemoRoutes(app, {
  requireAuth,
  demoRepository,
  finalizeUpload,
  elseService,
  projectSnapshot,
  storageBucket,
  clock = () => new Date().toISOString(),
}) {
  if (typeof requireAuth !== 'function') throw new TypeError('requireAuth is required');
  const repository = assertPort(demoRepository, [
    'listFragments',
    'listImportBatches',
    'listDecisions',
    'getImportBatch',
    'getObjectFacts',
    'saveDecision',
    'resetOwner',
  ], 'Demo repository');
  if (typeof finalizeUpload?.handle !== 'function') {
    throw new TypeError('Finalize upload must implement handle()');
  }
  const elseAnswers = assertPort(elseService, ['ask'], 'Else service');
  if (typeof projectSnapshot !== 'function') throw new TypeError('projectSnapshot is required');
  if (typeof storageBucket !== 'string' || !storageBucket) throw new TypeError('storageBucket is required');
  if (typeof clock !== 'function') throw new TypeError('clock is required');

  const requireDemo = async (request, reply) => {
    if (request.headers['x-elsewhere-demo'] !== DEMO_HEADER) {
      const response = errorResponse(new DemoError('demo/forbidden'), request.id);
      return reply.code(response.status).send(response.body);
    }
  };
  const guards = [requireAuth, requireDemo];

  const loadSnapshot = async (ownerId) => {
    const [fragments, importBatches, decisions] = await Promise.all([
      repository.listFragments(ownerId),
      repository.listImportBatches(ownerId),
      repository.listDecisions(ownerId),
    ]);
    return projectSnapshot({ ownerId, fragments, importBatches, decisions });
  };

  app.get('/demo/v1/snapshot', { preHandler: guards }, async (request, reply) => {
    try {
      return reply.code(200).send(await loadSnapshot(request.authContext.uid));
    } catch (error) {
      const response = errorResponse(error, request.id);
      return reply.code(response.status).send(response.body);
    }
  });

  app.post('/demo/v1/else/ask', { preHandler: guards }, async (request, reply) => {
    try {
      const body = ElseQuestionSchema.safeParse(request.body);
      if (!body.success) throw new DemoError('demo/invalid-request');
      const snapshot = await loadSnapshot(request.authContext.uid);
      const answer = await elseAnswers.ask({
        snapshot,
        question: body.data.question,
        scope: body.data.scope,
      });
      return reply.code(200).send(answer);
    } catch (error) {
      const response = errorResponse(error, request.id);
      return reply.code(response.status).send(response.body);
    }
  });

  app.post('/demo/v1/finalize-upload', { preHandler: guards }, async (request, reply) => {
    try {
      const parsed = FinalizeSchema.safeParse(request.body);
      if (!parsed.success) throw new DemoError('demo/invalid-request');
      const ownerId = request.authContext.uid;
      const batch = await repository.getImportBatch(ownerId, parsed.data.batchId);
      const manifest = batch?.uploads?.[parsed.data.fragmentId];
      if (!manifest || manifest.originalPath
        !== `users/${ownerId}/originals/${parsed.data.batchId}/${parsed.data.fragmentId}`) {
        throw new DemoError('demo/not-found');
      }
      const facts = await repository.getObjectFacts({
        bucket: storageBucket,
        objectName: manifest.originalPath,
      });
      if (facts.contentType !== manifest.declaredContentType
        || facts.sizeBytes !== manifest.declaredSizeBytes) {
        throw new DemoError('demo/conflict');
      }
      await finalizeUpload.handle(Object.freeze({
        eventId: `demo-${parsed.data.batchId}-${parsed.data.fragmentId}-${facts.generation}`,
        bucket: storageBucket,
        objectName: manifest.originalPath,
        generation: facts.generation,
        uid: ownerId,
        batchId: parsed.data.batchId,
        fragmentId: parsed.data.fragmentId,
      }));
      return reply.code(204).send();
    } catch (error) {
      request.log.error({
        errorCode: typeof error?.code === 'string' ? error.code : 'unknown',
        errorName: typeof error?.name === 'string' ? error.name : 'Error',
      }, 'demo finalize failed');
      const response = errorResponse(error, request.id);
      return reply.code(response.status).send(response.body);
    }
  });

  app.post('/demo/v1/inbox/:itemId/decision', { preHandler: guards }, async (request, reply) => {
    try {
      const itemId = IdSchema.safeParse(request.params.itemId);
      const body = DecisionSchema.safeParse(request.body);
      if (!itemId.success || !body.success) throw new DemoError('demo/invalid-request');
      await repository.saveDecision(request.authContext.uid, itemId.data, Object.freeze({
        ...body.data,
        decidedAt: clock(),
      }));
      return reply.code(204).send();
    } catch (error) {
      const response = errorResponse(error, request.id);
      return reply.code(response.status).send(response.body);
    }
  });

  app.post('/demo/v1/reset', { preHandler: guards }, async (request, reply) => {
    try {
      const body = ResetSchema.safeParse(request.body);
      if (!body.success) throw new DemoError('demo/invalid-request');
      await repository.resetOwner(request.authContext.uid);
      return reply.code(204).send();
    } catch (error) {
      const response = errorResponse(error, request.id);
      return reply.code(response.status).send(response.body);
    }
  });
}
