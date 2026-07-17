import { z } from 'zod';

export const OCR_CAPABILITY_ROUTE = '/internal/capabilities/ocr';

const TaskBodySchema = z.strictObject({
  capabilityExecutionId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/),
  ownerId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/),
  routePlanId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/),
  routePlanRevision: z.number().int().positive().max(5),
});
const ResultSchema = z.strictObject({
  outcome: z.enum([
    'completed',
    'insufficient_input',
    'unsupported',
    'failed_retryable',
    'failed_terminal',
    'billing_uncertain',
    'terminal_noop',
  ]),
  retryable: z.boolean(),
});
const ACKNOWLEDGED = new Set([
  'completed',
  'insufficient_input',
  'unsupported',
  'failed_terminal',
  'billing_uncertain',
  'terminal_noop',
]);

function errorResponse(code, message, requestId) {
  return Object.freeze({
    error: Object.freeze({ code, message, requestId }),
  });
}

function headerValue(value, maximum = 1_000) {
  if (value === undefined) return null;
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new TypeError('Invalid Cloud Tasks header');
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw new TypeError('Invalid Cloud Tasks header');
  }
  return parsed;
}

function deliveryCount(headers) {
  const taskName = headers['x-cloudtasks-taskname'];
  if (taskName !== undefined && (typeof taskName !== 'string'
    || taskName.length < 1
    || taskName.length > 1_024
    || taskName.includes(','))) {
    throw new TypeError('Invalid Cloud Tasks header');
  }
  const retry = headerValue(headers['x-cloudtasks-taskretrycount']);
  const execution = headerValue(headers['x-cloudtasks-taskexecutioncount']);
  return execution ?? retry ?? 0;
}

export function registerCapabilityRoutes(app, { worker } = {}) {
  if (typeof worker?.handle !== 'function') throw new TypeError('OCR worker is invalid');

  app.post(OCR_CAPABILITY_ROUTE, async (request, reply) => {
    let task;
    try {
      task = {
        ...TaskBodySchema.parse(request.body),
        taskDeliveryCount: deliveryCount(request.headers),
      };
    } catch {
      return reply.code(400).send(errorResponse(
        'capability/invalid-task',
        'Invalid capability task',
        request.id,
      ));
    }

    let result;
    try {
      result = ResultSchema.parse(await worker.handle(task));
    } catch {
      return reply.code(503).send(errorResponse(
        'capability/internal-error',
        'Temporary capability failure',
        request.id,
      ));
    }
    if (result.outcome === 'failed_retryable' && result.retryable) {
      return reply.code(503).send(errorResponse(
        'capability/retryable',
        'Capability work can be retried safely',
        request.id,
      ));
    }
    if (!ACKNOWLEDGED.has(result.outcome) || result.retryable) {
      return reply.code(503).send(errorResponse(
        'capability/internal-error',
        'Temporary capability failure',
        request.id,
      ));
    }
    return reply.code(204).send();
  });
}
