import { z } from 'zod';
import { IdSchema } from '../domain/index.js';
import { ElseQueryError } from './errors.js';

const ScopeSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('world') }),
  z.strictObject({ type: z.literal('fragments') }),
  z.strictObject({ type: z.literal('fragment'), id: IdSchema }),
]);
const AskSchema = z.strictObject({
  question: z.string().trim().min(1).max(500),
  scope: ScopeSchema,
});
const STATUS = Object.freeze({
  'else/invalid-request': 400,
  'else/budget-exhausted': 429,
  'else/provider-failed': 502,
  'else/unavailable': 503,
});

export function registerElseQueryRoutes(app, { requireAuth, elseQueryService } = {}) {
  if (typeof requireAuth !== 'function') throw new TypeError('requireAuth is required');
  if (typeof elseQueryService?.ask !== 'function') {
    throw new TypeError('Else query service must implement ask()');
  }

  app.post('/v1/else/ask', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const parsed = AskSchema.safeParse(request.body);
      if (!parsed.success) throw new ElseQueryError('else/invalid-request');
      const answer = await elseQueryService.ask(request.authContext.uid, parsed.data);
      return reply.code(200).send(answer);
    } catch (error) {
      const safe = error instanceof ElseQueryError
        ? error
        : new ElseQueryError(typeof error?.code === 'string' ? error.code : 'else/unavailable');
      request.log.error({ errorCode: safe.code }, 'Else query failed');
      return reply.code(STATUS[safe.code] ?? 503).send(Object.freeze({
        error: Object.freeze({ code: safe.code, message: safe.message, requestId: request.id }),
      }));
    }
  });
}
