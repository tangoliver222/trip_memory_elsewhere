import {
  IdSchema,
  IsoDateTimeSchema,
  TechnicalMetadataSchema,
  ThumbnailDerivativeSchema,
  WarningCodesSchema,
  parseFragment,
  parseProcessingTask,
  parseProvenance,
} from '../domain/index.js';
import { assertProcessingRepository } from '../repositories/contract.js';
import {
  ProcessingError,
  retryableProcessingError,
  terminalProcessingError,
} from './errors.js';
import { makeDerivativePath, makeProcessingTaskId } from './identity.js';
import { selectNearDuplicates } from './near-duplicates.js';

const PROCESSOR_NAME = 'deterministic-media';
const PROCESSOR_VERSION = 'v1';
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const EVENT_KEYS = Object.freeze(['batchId', 'fragmentId', 'sourceRevision', 'uid']);
const SOURCE_REVISION_KEYS = Object.freeze(['bucket', 'generation', 'objectName']);
const METADATA_RESULT_KEYS = Object.freeze([
  'factHints',
  'metadataStatus',
  'technicalMetadata',
  'warningCodes',
]);
const FACT_HINT_KEYS = Object.freeze(['capturedAt', 'geo']);
const CAPTURED_AT_HINT_KEYS = Object.freeze([
  'instant',
  'localDateTime',
  'offsetMinutes',
  'sourceType',
  'status',
  'zoneId',
]);
const GEO_HINT_KEYS = Object.freeze(['lat', 'lng', 'sourceType', 'status']);
const IMAGE_RESULT_KEYS = Object.freeze(['perceptualHash', 'thumbnail', 'warnings']);
const THUMBNAIL_KEYS = Object.freeze(['buffer', 'contentType', 'height', 'width']);
const PERCEPTUAL_HASH_KEYS = Object.freeze(['bands', 'value']);
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

function readBeforeDeadline(clock, signal, deadlineAt) {
  const timestamp = readClock(clock);
  if (signal.aborted || Date.parse(timestamp) >= Date.parse(deadlineAt)) {
    throw softTimeout();
  }
  return timestamp;
}

function assertBeforeDeadline(clock, signal, deadlineAt) {
  readBeforeDeadline(clock, signal, deadlineAt);
}

async function settleBeforeDeadline(operation, { clock, signal, deadlineAt }) {
  readBeforeDeadline(clock, signal, deadlineAt);
  let removeAbortListener = () => {};
  const aborted = new Promise((resolve, reject) => {
    const onAbort = () => reject(softTimeout());
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    removeAbortListener = () => signal.removeEventListener('abort', onAbort);
  });
  const pending = Promise.resolve().then(operation);
  try {
    const result = await Promise.race([pending, aborted]);
    readBeforeDeadline(clock, signal, deadlineAt);
    return result;
  } finally {
    removeAbortListener();
  }
}

function mapRepositoryError(error) {
  if (error instanceof ProcessingError) return error;
  if (error?.code === 'repository/owner-mismatch'
    || error?.code === 'repository/processing-target-mismatch') {
    return invalidMedia();
  }
  if (error?.code === 'repository/lease-owner-mismatch') {
    return retryableProcessingError('processing/task-busy');
  }
  return repositoryUnavailable();
}

async function repositoryCall(operation) {
  try {
    return await operation();
  } catch (error) {
    throw mapRepositoryError(error);
  }
}

function repositoryCallBeforeDeadline(operation, deadline) {
  return settleBeforeDeadline(() => repositoryCall(operation), deadline);
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

function sameSourceRevision(actual, expected) {
  return actual.bucket === expected.bucket
    && actual.objectName === expected.objectName
    && actual.generation === expected.generation;
}

function matchingTask(input, event, claimInput) {
  let task;
  try {
    task = parseProcessingTask(input);
  } catch {
    throw repositoryUnavailable();
  }
  if (task.id !== claimInput.taskId
    || task.ownerId !== event.uid
    || task.fragmentId !== event.fragmentId
    || task.batchId !== event.batchId
    || task.processorName !== PROCESSOR_NAME
    || task.processorVersion !== PROCESSOR_VERSION
    || !sameSourceRevision(task.sourceRevision, event.sourceRevision)) {
    throw repositoryUnavailable();
  }
  return task;
}

function matchingFragment(input, event, claimInput) {
  let fragment;
  try {
    fragment = parseFragment(input);
  } catch {
    throw repositoryUnavailable();
  }
  const processing = fragment.processing.deterministic;
  if (fragment.id !== event.fragmentId
    || fragment.ownerId !== event.uid
    || fragment.batchId !== event.batchId
    || fragment.status !== 'processing'
    || fragment.storage.bucket !== event.sourceRevision.bucket
    || fragment.storage.originalPath !== event.sourceRevision.objectName
    || fragment.storage.generation !== event.sourceRevision.generation
    || processing?.taskId !== claimInput.taskId
    || processing?.processorName !== PROCESSOR_NAME
    || processing?.processorVersion !== PROCESSOR_VERSION
    || processing?.state !== 'running') {
    throw repositoryUnavailable();
  }
  return fragment;
}

function normalizeClaim(claim, event, claimInput) {
  if (!claim || typeof claim !== 'object' || Array.isArray(claim)) {
    throw repositoryUnavailable();
  }
  const task = matchingTask(claim.task, event, claimInput);
  if (claim.outcome === 'terminal') {
    if (!['succeeded', 'failed_terminal'].includes(task.state)) throw repositoryUnavailable();
    return Object.freeze({ outcome: 'terminal', task });
  }
  if (claim.outcome === 'busy') {
    if (task.state !== 'running') throw repositoryUnavailable();
    return Object.freeze({ outcome: 'busy', task });
  }
  if (claim.outcome !== 'claimed'
    || task.state !== 'running'
    || task.leaseOwner !== claimInput.leaseOwner
    || task.attemptStartedAt !== claimInput.claimedAt
    || task.softDeadlineAt !== claimInput.softDeadlineAt
    || task.leaseAcquiredAt !== claimInput.claimedAt
    || task.leaseExpiresAt !== claimInput.leaseExpiresAt) {
    throw repositoryUnavailable();
  }
  return Object.freeze({
    outcome: 'claimed',
    task,
    fragment: matchingFragment(claim.fragment, event, claimInput),
  });
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

function validateFactHints(input) {
  if (!hasExactKeys(input, FACT_HINT_KEYS)
    || !(input.capturedAt === null
      || hasExactKeys(input.capturedAt, CAPTURED_AT_HINT_KEYS))
    || !(input.geo === null || hasExactKeys(input.geo, GEO_HINT_KEYS))) {
    throw invalidMedia();
  }
  if (input.capturedAt !== null) capturedAtValue(input.capturedAt);
  if (input.geo !== null) geoValue(input.geo);
  return input;
}

function validateMetadataResult(input) {
  if (!hasExactKeys(input, METADATA_RESULT_KEYS)) throw invalidMedia();
  try {
    const technicalMetadata = TechnicalMetadataSchema.parse(input.technicalMetadata);
    const warningCodes = WarningCodesSchema.parse(input.warningCodes);
    if (input.metadataStatus !== technicalMetadata.metadataStatus
      || warningCodes.length !== technicalMetadata.warningCodes.length
      || warningCodes.some((code, index) => code !== technicalMetadata.warningCodes[index])) {
      throw invalidMedia();
    }
    return Object.freeze({
      technicalMetadata,
      factHints: validateFactHints(input.factHints),
      metadataStatus: input.metadataStatus,
      warningCodes,
    });
  } catch (error) {
    if (error instanceof ProcessingError) throw error;
    throw invalidMedia();
  }
}

function validateImageResult(input) {
  if (!hasExactKeys(input, IMAGE_RESULT_KEYS)) throw invalidMedia();
  let warnings;
  try {
    warnings = WarningCodesSchema.parse(input.warnings);
  } catch {
    throw invalidMedia();
  }

  let thumbnail = null;
  if (input.thumbnail !== null) {
    if (!hasExactKeys(input.thumbnail, THUMBNAIL_KEYS)
      || !Buffer.isBuffer(input.thumbnail.buffer)
      || input.thumbnail.buffer.byteLength === 0
      || input.thumbnail.contentType !== 'image/webp'
      || !Number.isInteger(input.thumbnail.width)
      || input.thumbnail.width <= 0
      || input.thumbnail.width > 512
      || !Number.isInteger(input.thumbnail.height)
      || input.thumbnail.height <= 0
      || input.thumbnail.height > 512) {
      throw invalidMedia();
    }
    thumbnail = input.thumbnail;
  }

  let perceptualHash = null;
  if (input.perceptualHash !== null) {
    const hash = input.perceptualHash;
    if (!hasExactKeys(hash, PERCEPTUAL_HASH_KEYS)
      || typeof hash.value !== 'string'
      || !/^[a-f0-9]{16}$/.test(hash.value)
      || !Array.isArray(hash.bands)
      || hash.bands.length !== 8
      || hash.bands.some((band, index) => band !== `${index}:${hash.value.slice(
        index * 2,
        (index + 1) * 2,
      )}`)) {
      throw invalidMedia();
    }
    perceptualHash = hash;
  }
  return Object.freeze({ thumbnail, perceptualHash, warnings });
}

function validateDerivativeResult(input, expected) {
  let derivative;
  try {
    derivative = ThumbnailDerivativeSchema.parse(input);
  } catch {
    throw invalidMedia();
  }
  let expectedPath;
  try {
    expectedPath = makeDerivativePath({
      ownerId: expected.ownerId,
      fragmentId: expected.fragmentId,
      processorName: PROCESSOR_NAME,
      processorVersion: PROCESSOR_VERSION,
      inputHash: expected.inputHash,
    });
  } catch {
    throw invalidMedia();
  }
  if (derivative.path !== expectedPath
    || derivative.width !== expected.thumbnail.width
    || derivative.height !== expected.thumbnail.height) {
    throw invalidMedia();
  }
  return derivative;
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
      ), event, claimInput);
      if (claim.outcome === 'terminal') return TERMINAL_NOOP;
      if (claim.outcome === 'busy') {
        throw retryableProcessingError('processing/task-busy');
      }

      const controller = new AbortController();
      const remainingMs = Date.parse(claimInput.softDeadlineAt)
        - Date.parse(readClock(clock));
      if (remainingMs <= 0) controller.abort();
      const timeout = remainingMs > 0
        ? setTimeout(() => controller.abort(), remainingMs)
        : null;
      timeout?.unref?.();
      let cleanup = null;
      let terminalPersisted = false;
      let terminalSettlementStarted = false;
      let primaryFailure = null;
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
          assertBeforeDeadline(clock, controller.signal, claimInput.softDeadlineAt);
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
          assertBeforeDeadline(clock, controller.signal, claimInput.softDeadlineAt);

          const checkpointHash = claim.task.inputHash ?? null;
          if (checkpointHash !== null && checkpointHash !== material.inputHash) {
            throw invalidMedia();
          }
          if (checkpointHash === null) {
            const registeredAt = readBeforeDeadline(
              clock,
              controller.signal,
              claimInput.softDeadlineAt,
            );
            await repositoryCallBeforeDeadline(
              () => store.registerContentHash(event.uid, {
                taskId,
                leaseOwner,
                registeredAt,
                sha256: material.inputHash,
              }),
              {
                clock,
                signal: controller.signal,
                deadlineAt: claimInput.softDeadlineAt,
              },
            );
          }

          assertBeforeDeadline(clock, controller.signal, claimInput.softDeadlineAt);
          const metadataResult = validateMetadataResult(await mediaCall(() => metadata.read({
            path: material.path,
            sourceType: claim.fragment.type,
            contentType: claim.fragment.storage.contentType,
            signal: controller.signal,
            deadlineAt: claimInput.softDeadlineAt,
          })));
          technicalMetadata = metadataResult.technicalMetadata;
          capabilityStatuses.metadata = metadataResult.metadataStatus;
          warningCodes = uniqueWarnings(warningCodes, metadataResult.warningCodes ?? []);

          assertBeforeDeadline(clock, controller.signal, claimInput.softDeadlineAt);
          const imageResult = validateImageResult(await mediaCall(() => image.process({
            path: material.path,
            contentType: claim.fragment.storage.contentType,
            signal: controller.signal,
            deadlineAt: claimInput.softDeadlineAt,
          })));
          perceptualHash = imageResult.perceptualHash;
          capabilityStatuses.perceptualHash = perceptualHash === null
            ? 'unsupported'
            : 'complete';
          warningCodes = uniqueWarnings(warningCodes, imageResult.warnings ?? []);

          if (imageResult.thumbnail === null) {
            capabilityStatuses.thumbnail = 'unsupported';
          } else {
            assertBeforeDeadline(clock, controller.signal, claimInput.softDeadlineAt);
            const derivativeInput = {
              bucket: claim.fragment.storage.bucket,
              ownerId: event.uid,
              fragmentId: event.fragmentId,
              inputHash: material.inputHash,
              thumbnail: {
                buffer: imageResult.thumbnail.buffer,
                width: imageResult.thumbnail.width,
                height: imageResult.thumbnail.height,
              },
              signal: controller.signal,
              deadlineAt: claimInput.softDeadlineAt,
            };
            derivative = validateDerivativeResult(
              await storageCall(() => derivatives.putThumbnail(derivativeInput)),
              derivativeInput,
            );
            capabilityStatuses.thumbnail = 'complete';
          }

          let nearMatches = [];
          if (perceptualHash !== null) {
            assertBeforeDeadline(clock, controller.signal, claimInput.softDeadlineAt);
            const bandMatches = await repositoryCallBeforeDeadline(
              () => store.findNearDuplicateInputs(
                event.uid,
                { fragmentId: event.fragmentId, bands: perceptualHash.bands },
              ),
              {
                clock,
                signal: controller.signal,
                deadlineAt: claimInput.softDeadlineAt,
              },
            );
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

          const completedAt = readBeforeDeadline(
            clock,
            controller.signal,
            claimInput.softDeadlineAt,
          );
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
          terminalSettlementStarted = true;
          const completed = await repositoryCallBeforeDeadline(
            () => store.completeDeterministicProcessing(event.uid, completion),
            {
              clock,
              signal: controller.signal,
              deadlineAt: claimInput.softDeadlineAt,
            },
          );
          terminalSettlementStarted = false;
          if (completed?.outcome === 'duplicate') {
            terminalPersisted = true;
            return TERMINAL_NOOP;
          }
          if (completed?.outcome !== 'applied') throw repositoryUnavailable();
          terminalPersisted = true;
          return SUCCEEDED;
        } catch (caught) {
          const error = caught instanceof ProcessingError ? caught : repositoryUnavailable();
          primaryFailure = error;
          if (error.code === 'processing/task-busy') throw error;
          if (terminalSettlementStarted && error.code === 'processing/soft-timeout') {
            throw error;
          }
          if (!error.retryable) {
            const completedAt = readBeforeDeadline(
              clock,
              controller.signal,
              claimInput.softDeadlineAt,
            );
            let completed;
            try {
              terminalSettlementStarted = true;
              completed = await repositoryCallBeforeDeadline(
                () => store.completeDeterministicProcessing(event.uid, terminalCompletion({
                  taskId,
                  leaseOwner,
                  completedAt,
                  error,
                  technicalMetadata,
                  derivative,
                  perceptualHash,
                  capabilityStatuses,
                  warningCodes,
                })),
                {
                  clock,
                  signal: controller.signal,
                  deadlineAt: claimInput.softDeadlineAt,
                },
              );
              terminalSettlementStarted = false;
              if (!['applied', 'duplicate'].includes(completed?.outcome)) {
                throw repositoryUnavailable();
              }
            } catch (settlementError) {
              if (settlementError instanceof ProcessingError
                && settlementError.code === 'processing/soft-timeout') {
                throw settlementError;
              }
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
        if (timeout !== null) clearTimeout(timeout);
        controller.abort();
        if (cleanup !== null) {
          try {
            await storageCall(() => cleanup());
          } catch (error) {
            if (primaryFailure === null) throw error;
          }
        }
      }
    },
  });
}
