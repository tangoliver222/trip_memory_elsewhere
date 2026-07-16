import {
  IdSchema,
  IsoDateTimeSchema,
  parseProvenance,
} from '../domain/index.js';
import { assertProcessingRepository } from '../repositories/contract.js';
import {
  ProcessingError,
  retryableProcessingError,
  terminalProcessingError,
} from './errors.js';
import { makeProcessingTaskId } from './identity.js';
import { selectNearDuplicates } from './near-duplicates.js';

const PROCESSOR_NAME = 'deterministic-media';
const PROCESSOR_VERSION = 'v1';
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const EVENT_KEYS = Object.freeze(['batchId', 'fragmentId', 'sourceRevision', 'uid']);
const SOURCE_REVISION_KEYS = Object.freeze(['bucket', 'generation', 'objectName']);
const SUCCEEDED = Object.freeze({ outcome: 'succeeded' });
const FAILED_TERMINAL = Object.freeze({ outcome: 'failed_terminal' });
const TERMINAL_NOOP = Object.freeze({ outcome: 'terminal_noop' });

const invalidMedia = () => terminalProcessingError('processing/invalid-media');
const repositoryUnavailable = () => retryableProcessingError(
  'processing/repository-unavailable',
);
const storageUnavailable = () => retryableProcessingError('processing/storage-unavailable');
const softTimeout = () => retryableProcessingError('processing/soft-timeout');

function hasExactKeys(input, keys) {
  return input
    && typeof input === 'object'
    && !Array.isArray(input)
    && Object.keys(input).sort().join('\0') === keys.join('\0');
}

function normalizeEvent(input) {
  if (!hasExactKeys(input, EVENT_KEYS)
    || !IdSchema.safeParse(input.uid).success
    || !IdSchema.safeParse(input.fragmentId).success
    || !IdSchema.safeParse(input.batchId).success
    || !hasExactKeys(input.sourceRevision, SOURCE_REVISION_KEYS)
    || Object.values(input.sourceRevision).some((value) => (
      typeof value !== 'string' || value.length === 0 || value !== value.trim()
    ))) {
    throw invalidMedia();
  }
  return Object.freeze({
    uid: input.uid,
    fragmentId: input.fragmentId,
    batchId: input.batchId,
    sourceRevision: Object.freeze({ ...input.sourceRevision }),
  });
}

function validateConfig(config) {
  const timeouts = config?.timeouts;
  const limits = config?.limits;
  if (!timeouts
    || !limits
    || !Number.isInteger(timeouts.softMs)
    || !Number.isInteger(timeouts.leaseMs)
    || timeouts.softMs <= 0
    || timeouts.leaseMs <= timeouts.softMs
    || !Number.isInteger(limits.maxInputBytes)
    || limits.maxInputBytes <= 0) {
    throw new TypeError('Valid processing configuration is required');
  }
  return config;
}

function requirePort(port, method, name) {
  if (typeof port?.[method] !== 'function') {
    throw new TypeError(`${name} must implement ${method}()`);
  }
  return port;
}

function readClock(clock) {
  try {
    return new Date(IsoDateTimeSchema.parse(clock())).toISOString();
  } catch {
    throw new TypeError('Clock must return an ISO date-time');
  }
}

function addMilliseconds(instant, milliseconds) {
  return new Date(Date.parse(instant) + milliseconds).toISOString();
}

function assertActive(signal) {
  if (signal.aborted) throw softTimeout();
}

async function repositoryCall(operation) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ProcessingError) throw error;
    throw repositoryUnavailable();
  }
}

async function storageCall(operation) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ProcessingError) throw error;
    throw storageUnavailable();
  }
}

async function mediaCall(operation) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ProcessingError) throw error;
    throw invalidMedia();
  }
}

function normalizeClaim(claim) {
  if (claim?.outcome === 'busy' || claim?.outcome === 'terminal') return claim;
  if (claim?.outcome !== 'claimed'
    || !claim.task
    || !claim.fragment
    || ![null, undefined].includes(claim.task.inputHash)
      && (typeof claim.task.inputHash !== 'string'
        || !HASH_PATTERN.test(claim.task.inputHash))) {
    throw repositoryUnavailable();
  }
  return claim;
}

function capturedAtValue(hint) {
  if (!hint
    || hint.sourceType !== 'exif'
    || !['unresolved', 'suggested'].includes(hint.status)
    || typeof hint.localDateTime !== 'string'
    || hint.localDateTime.length === 0
    || !(hint.offsetMinutes === null
      || (Number.isInteger(hint.offsetMinutes)
        && hint.offsetMinutes >= -840
        && hint.offsetMinutes <= 840))
    || !(hint.zoneId === null || (typeof hint.zoneId === 'string' && hint.zoneId.length > 0))
    || !(hint.instant === null || IsoDateTimeSchema.safeParse(hint.instant).success)) {
    throw invalidMedia();
  }
  return {
    localDateTime: hint.localDateTime,
    offsetMinutes: hint.offsetMinutes,
    zoneId: hint.zoneId,
    instant: hint.instant,
  };
}

function geoValue(hint) {
  if (!hint
    || hint.sourceType !== 'gps'
    || hint.status !== 'suggested'
    || typeof hint.lat !== 'number'
    || !Number.isFinite(hint.lat)
    || hint.lat < -90
    || hint.lat > 90
    || typeof hint.lng !== 'number'
    || !Number.isFinite(hint.lng)
    || hint.lng < -180
    || hint.lng > 180) {
    throw invalidMedia();
  }
  return { lat: hint.lat, lng: hint.lng };
}

function makeFactSuggestion({ key, hint, fragmentId, observedAt }) {
  const sourceType = key === 'capturedAt' ? 'exif' : 'gps';
  const value = key === 'capturedAt' ? capturedAtValue(hint) : geoValue(hint);
  // A timezone-less EXIF observation remains local evidence in `value`. The fact wrapper is
  // `suggested` because the repository contract has no unresolved-write state for new evidence.
  return parseProvenance({
    value,
    sourceType,
    sourceRefs: [{ type: 'fragment', id: fragmentId }],
    processor: {
      name: PROCESSOR_NAME,
      version: PROCESSOR_VERSION,
      modelAlias: null,
      promptVersion: null,
    },
    confidence: 1,
    status: 'suggested',
    observedAt,
  });
}

function factSuggestions(hints, fragmentId, observedAt) {
  if (!hints || typeof hints !== 'object' || Array.isArray(hints)) throw invalidMedia();
  const suggestions = {};
  if (hints.capturedAt !== null) {
    suggestions.capturedAt = makeFactSuggestion({
      key: 'capturedAt',
      hint: hints.capturedAt,
      fragmentId,
      observedAt,
    });
  }
  if (hints.geo !== null) {
    suggestions.geo = makeFactSuggestion({
      key: 'geo',
      hint: hints.geo,
      fragmentId,
      observedAt,
    });
  }
  return suggestions;
}

function uniqueWarnings(...groups) {
  return [...new Set(groups.flat())];
}

function terminalCompletion({
  taskId,
  leaseOwner,
  completedAt,
  error,
  technicalMetadata,
  derivative,
  perceptualHash,
  capabilityStatuses,
  warningCodes,
}) {
  return {
    taskId,
    leaseOwner,
    completedAt,
    technicalMetadata,
    factSuggestions: {},
    derivative,
    perceptualHash,
    capabilityStatuses,
    warningCodes,
    nearMatches: [],
    errorCode: error.code,
  };
}

export function createDeterministicProcessor({
  repository,
  materializer,
  metadataReader,
  imageProcessor,
  derivativeStore,
  processingConfig,
  clock,
  randomUUID,
} = {}) {
  const store = assertProcessingRepository(repository);
  const sourceMaterializer = requirePort(materializer, 'materialize', 'Materializer');
  const metadata = requirePort(metadataReader, 'read', 'Metadata reader');
  const image = requirePort(imageProcessor, 'process', 'Image processor');
  const derivatives = requirePort(derivativeStore, 'putThumbnail', 'Derivative store');
  const config = validateConfig(processingConfig);
  if (typeof clock !== 'function') throw new TypeError('clock must be a function');
  if (typeof randomUUID !== 'function') throw new TypeError('randomUUID must be a function');

  return Object.freeze({
    async handle(eventInput) {
      const event = normalizeEvent(eventInput);
      let taskId;
      let leaseOwner;
      try {
        taskId = makeProcessingTaskId({
          ownerId: event.uid,
          fragmentId: event.fragmentId,
          processorName: PROCESSOR_NAME,
          processorVersion: PROCESSOR_VERSION,
          ...event.sourceRevision,
        });
        leaseOwner = IdSchema.parse(`exec_${randomUUID()}`);
      } catch {
        throw new TypeError('Server processing identity is invalid');
      }

      const claimedAt = readClock(clock);
      const claimInput = {
        taskId,
        fragmentId: event.fragmentId,
        batchId: event.batchId,
        processorName: PROCESSOR_NAME,
        processorVersion: PROCESSOR_VERSION,
        sourceRevision: event.sourceRevision,
        leaseOwner,
        claimedAt,
        softDeadlineAt: addMilliseconds(claimedAt, config.timeouts.softMs),
        leaseExpiresAt: addMilliseconds(claimedAt, config.timeouts.leaseMs),
      };
      const claim = normalizeClaim(await repositoryCall(
        () => store.claimProcessingTask(event.uid, claimInput),
      ));
      if (claim.outcome === 'terminal') return TERMINAL_NOOP;
      if (claim.outcome === 'busy') {
        throw retryableProcessingError('processing/task-busy');
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeouts.softMs);
      timeout.unref?.();
      let cleanup = null;
      let terminalPersisted = false;
      let technicalMetadata = null;
      let derivative = null;
      let perceptualHash = null;
      let warningCodes = [];
      const capabilityStatuses = {
        metadata: 'failed',
        thumbnail: 'failed',
        perceptualHash: 'failed',
      };

      try {
        try {
          assertActive(controller.signal);
          const material = await storageCall(() => sourceMaterializer.materialize({
            sourceRevision: event.sourceRevision,
            expectedStorageFacts: claim.fragment.storage,
            maxBytes: config.limits.maxInputBytes,
            signal: controller.signal,
            deadlineAt: claimInput.softDeadlineAt,
          }));
          cleanup = material?.cleanup;
          if (typeof cleanup !== 'function'
            || typeof material?.path !== 'string'
            || typeof material?.inputHash !== 'string'
            || !HASH_PATTERN.test(material.inputHash)) {
            throw invalidMedia();
          }

          const checkpointHash = claim.task.inputHash ?? null;
          if (checkpointHash !== null && checkpointHash !== material.inputHash) {
            throw invalidMedia();
          }
          assertActive(controller.signal);
          if (checkpointHash === null) {
            const registeredAt = readClock(clock);
            await repositoryCall(() => store.registerContentHash(event.uid, {
              taskId,
              leaseOwner,
              registeredAt,
              sha256: material.inputHash,
            }));
          }

          assertActive(controller.signal);
          const metadataResult = await mediaCall(() => metadata.read({
            path: material.path,
            sourceType: claim.fragment.type,
            contentType: claim.fragment.storage.contentType,
            signal: controller.signal,
            deadlineAt: claimInput.softDeadlineAt,
          }));
          technicalMetadata = metadataResult.technicalMetadata;
          capabilityStatuses.metadata = metadataResult.metadataStatus;
          warningCodes = uniqueWarnings(warningCodes, metadataResult.warningCodes ?? []);

          assertActive(controller.signal);
          const imageResult = await mediaCall(() => image.process({
            path: material.path,
            contentType: claim.fragment.storage.contentType,
            signal: controller.signal,
            deadlineAt: claimInput.softDeadlineAt,
          }));
          perceptualHash = imageResult.perceptualHash;
          capabilityStatuses.perceptualHash = perceptualHash === null
            ? 'unsupported'
            : 'complete';
          warningCodes = uniqueWarnings(warningCodes, imageResult.warnings ?? []);

          if (imageResult.thumbnail === null) {
            capabilityStatuses.thumbnail = 'unsupported';
          } else {
            assertActive(controller.signal);
            derivative = await storageCall(() => derivatives.putThumbnail({
              bucket: claim.fragment.storage.bucket,
              ownerId: event.uid,
              fragmentId: event.fragmentId,
              inputHash: material.inputHash,
              thumbnail: imageResult.thumbnail,
            }));
            capabilityStatuses.thumbnail = 'complete';
          }

          let nearMatches = [];
          if (perceptualHash !== null) {
            assertActive(controller.signal);
            const bandMatches = await repositoryCall(() => store.findNearDuplicateInputs(
              event.uid,
              { fragmentId: event.fragmentId, bands: perceptualHash.bands },
            ));
            let selected;
            try {
              selected = selectNearDuplicates({
                queryFragmentId: event.fragmentId,
                queryHash: perceptualHash.value,
                bandMatches,
              });
            } catch {
              throw repositoryUnavailable();
            }
            nearMatches = selected.matches.map(({ fragmentId, distance, rank }) => ({
              fragmentId,
              distance,
              rank,
            }));
            if (selected.truncated) {
              warningCodes = uniqueWarnings(
                warningCodes,
                ['processing/near-scan-truncated'],
              );
            }
          }

          assertActive(controller.signal);
          const completedAt = readClock(clock);
          const completion = {
            taskId,
            leaseOwner,
            completedAt,
            technicalMetadata,
            factSuggestions: factSuggestions(
              metadataResult.factHints,
              event.fragmentId,
              completedAt,
            ),
            derivative,
            perceptualHash,
            capabilityStatuses,
            warningCodes,
            nearMatches,
            errorCode: null,
          };
          const completed = await repositoryCall(
            () => store.completeDeterministicProcessing(event.uid, completion),
          );
          if (completed?.outcome === 'duplicate') {
            terminalPersisted = true;
            return TERMINAL_NOOP;
          }
          if (completed?.outcome !== 'applied') throw repositoryUnavailable();
          terminalPersisted = true;
          return SUCCEEDED;
        } catch (caught) {
          const error = caught instanceof ProcessingError ? caught : repositoryUnavailable();
          if (!error.retryable) {
            const completedAt = readClock(clock);
            let completed;
            try {
              completed = await repositoryCall(() => store.completeDeterministicProcessing(
                event.uid,
                terminalCompletion({
                  taskId,
                  leaseOwner,
                  completedAt,
                  error,
                  technicalMetadata,
                  derivative,
                  perceptualHash,
                  capabilityStatuses,
                  warningCodes,
                }),
              ));
              if (!['applied', 'duplicate'].includes(completed?.outcome)) {
                throw repositoryUnavailable();
              }
            } catch {
              const failedAt = readClock(clock);
              try {
                await store.failDeterministicProcessing(event.uid, {
                  taskId,
                  leaseOwner,
                  failedAt,
                  errorCode: 'processing/repository-unavailable',
                });
              } catch {
                throw repositoryUnavailable();
              }
              throw repositoryUnavailable();
            }
            if (completed?.outcome === 'duplicate') {
              terminalPersisted = true;
              return TERMINAL_NOOP;
            }
            terminalPersisted = true;
            return FAILED_TERMINAL;
          }

          if (!terminalPersisted) {
            const failedAt = readClock(clock);
            try {
              await store.failDeterministicProcessing(event.uid, {
                taskId,
                leaseOwner,
                failedAt,
                errorCode: error.code,
              });
            } catch {
              throw repositoryUnavailable();
            }
          }
          throw error;
        }
      } finally {
        clearTimeout(timeout);
        controller.abort();
        if (cleanup !== null) {
          await storageCall(() => cleanup());
        }
      }
    },
  });
}
