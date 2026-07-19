import { IdSchema } from '../domain/index.js';
import { retryableIngestionError } from './errors.js';

const EVENT_KEYS = Object.freeze([
  'batchId',
  'bucket',
  'eventId',
  'fragmentId',
  'generation',
  'objectName',
  'uid',
]);
const FINALIZER_OUTCOMES = new Set(['applied', 'duplicate', 'rejected']);
const TERMINAL_PROCESSING_OUTCOMES = new Set([
  'succeeded',
  'failed_terminal',
  'terminal_noop',
]);
const ROUTING_OUTCOMES = new Set([
  'drafted',
  'approved',
  'completed',
  'terminal_noop',
]);
const SCHEDULING_OUTCOMES = new Set(['queued', 'terminal_noop']);

function requireHandler(port, name) {
  if (typeof port?.handle !== 'function') {
    throw new TypeError(`${name} must implement handle()`);
  }
  return port;
}

function normalizeOutcome(result, allowed) {
  if (!result
    || typeof result !== 'object'
    || Array.isArray(result)
    || Object.keys(result).length !== 1
    || !Object.hasOwn(result, 'outcome')
    || !allowed.has(result.outcome)) {
    throw retryableIngestionError();
  }
  return result.outcome;
}

function normalizeSchedulingOutcome(result) {
  if (result && typeof result === 'object' && !Array.isArray(result)
    && Object.keys(result).sort().join('\0') === 'outcome\0queued'
    && SCHEDULING_OUTCOMES.has(result.outcome)
    && Number.isSafeInteger(result.queued)
    && result.queued >= 0
    && ((result.outcome === 'queued' && result.queued > 0)
      || (result.outcome === 'terminal_noop' && result.queued === 0))) {
    return result.outcome;
  }
  return normalizeOutcome(result, SCHEDULING_OUTCOMES);
}

function normalizeEvent(input) {
  if (!input
    || typeof input !== 'object'
    || Array.isArray(input)
    || Object.keys(input).sort().join('\0') !== EVENT_KEYS.join('\0')
    || !IdSchema.safeParse(input.uid).success
    || !IdSchema.safeParse(input.batchId).success
    || !IdSchema.safeParse(input.fragmentId).success
    || typeof input.eventId !== 'string'
    || input.eventId.length === 0
    || input.eventId !== input.eventId.trim()
    || typeof input.bucket !== 'string'
    || input.bucket.length === 0
    || input.bucket !== input.bucket.trim()
    || typeof input.generation !== 'string'
    || input.generation.length === 0
    || input.generation !== input.generation.trim()
    || input.objectName !== `users/${input.uid}/originals/${input.batchId}/${input.fragmentId}`) {
    throw retryableIngestionError();
  }
  return Object.freeze({
    eventId: input.eventId,
    bucket: input.bucket,
    objectName: input.objectName,
    generation: input.generation,
    uid: input.uid,
    batchId: input.batchId,
    fragmentId: input.fragmentId,
  });
}

function toProcessorEvent(event) {
  return Object.freeze({
    uid: event.uid,
    batchId: event.batchId,
    fragmentId: event.fragmentId,
    sourceRevision: Object.freeze({
      bucket: event.bucket,
      objectName: event.objectName,
      generation: event.generation,
    }),
  });
}

export function createStorageFinalizedPipeline({
  originalFinalizer,
  deterministicProcessor,
  authoritativeRouter,
  capabilityScheduler,
} = {}) {
  const finalizer = requireHandler(originalFinalizer, 'Original finalizer');
  const processor = requireHandler(deterministicProcessor, 'Deterministic processor');
  const router = requireHandler(authoritativeRouter, 'Authoritative router');
  const scheduler = requireHandler(capabilityScheduler, 'Capability scheduler');

  return Object.freeze({
    async handle(eventInput) {
      const event = normalizeEvent(eventInput);
      const finalizerOutcome = normalizeOutcome(
        await finalizer.handle(event),
        FINALIZER_OUTCOMES,
      );
      if (finalizerOutcome === 'rejected') {
        return Object.freeze({ outcome: 'rejected' });
      }

      normalizeOutcome(
        await processor.handle(toProcessorEvent(event)),
        TERMINAL_PROCESSING_OUTCOMES,
      );
      const routingOutcome = normalizeOutcome(
        await router.handle(toProcessorEvent(event)),
        ROUTING_OUTCOMES,
      );
      normalizeSchedulingOutcome(
        await scheduler.handle({ uid: event.uid, batchId: event.batchId }),
      );
      return Object.freeze({ outcome: routingOutcome });
    },
  });
}
