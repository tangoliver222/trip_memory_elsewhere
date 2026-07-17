import { retryableIngestionError } from './errors.js';

const FINALIZER_OUTCOMES = new Set(['applied', 'duplicate', 'rejected']);
const TERMINAL_PROCESSING_OUTCOMES = new Set([
  'succeeded',
  'failed_terminal',
  'terminal_noop',
]);

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
} = {}) {
  const finalizer = requireHandler(originalFinalizer, 'Original finalizer');
  const processor = requireHandler(deterministicProcessor, 'Deterministic processor');

  return Object.freeze({
    async handle(event) {
      const finalizerOutcome = normalizeOutcome(
        await finalizer.handle(event),
        FINALIZER_OUTCOMES,
      );
      if (finalizerOutcome === 'rejected') {
        return Object.freeze({ outcome: 'rejected' });
      }

      const processingOutcome = normalizeOutcome(
        await processor.handle(toProcessorEvent(event)),
        TERMINAL_PROCESSING_OUTCOMES,
      );
      return Object.freeze({ outcome: processingOutcome });
    },
  });
}
