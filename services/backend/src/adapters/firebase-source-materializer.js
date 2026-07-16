import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ProcessingError, retryableProcessingError, terminalProcessingError } from '../processing/errors.js';

const HARD_MAX_BYTES = 50 * 1024 * 1024;
const MATERIAL_DIRECTORY_PREFIX = 'elsewhere-source-';
const MATERIAL_FILE_NAME = 'source';

const invalidMedia = () => terminalProcessingError('processing/invalid-media');
const mediaLimitsExceeded = () => terminalProcessingError('processing/media-limits-exceeded');
const softTimeout = () => retryableProcessingError('processing/soft-timeout');
const storageUnavailable = () => retryableProcessingError('processing/storage-unavailable');

function normalizeSourceRevision(input, allowedBuckets) {
  if (!input
    || !allowedBuckets.has(input.bucket)
    || typeof input.objectName !== 'string'
    || input.objectName.length === 0
    || typeof input.generation !== 'string'
    || input.generation.length === 0) {
    throw invalidMedia();
  }
  return Object.freeze({
    bucket: input.bucket,
    objectName: input.objectName,
    generation: input.generation,
  });
}

function normalizeExpectedFacts(input) {
  if (!input
    || typeof input.bucket !== 'string'
    || input.bucket.length === 0
    || typeof input.originalPath !== 'string'
    || input.originalPath.length === 0
    || typeof input.generation !== 'string'
    || input.generation.length === 0
    || !Number.isSafeInteger(input.sizeBytes)
    || input.sizeBytes <= 0
    || typeof input.contentType !== 'string'
    || input.contentType.length === 0
    || typeof input.crc32c !== 'string'
    || input.crc32c.length === 0) {
    throw invalidMedia();
  }
  return Object.freeze({
    bucket: input.bucket,
    originalPath: input.originalPath,
    generation: input.generation,
    sizeBytes: input.sizeBytes,
    contentType: input.contentType,
    crc32c: input.crc32c,
  });
}

function assertSourceIdentity(sourceRevision, expectedFacts) {
  if (expectedFacts.bucket !== sourceRevision.bucket
    || expectedFacts.originalPath !== sourceRevision.objectName
    || expectedFacts.generation !== sourceRevision.generation) {
    throw invalidMedia();
  }
}

function normalizeDeadline(deadlineAt) {
  const timestamp = typeof deadlineAt === 'number' ? deadlineAt : Date.parse(deadlineAt);
  if (!Number.isFinite(timestamp)) throw invalidMedia();
  return timestamp;
}

function assertMetadata(metadata, sourceRevision, expectedFacts) {
  const actualGeneration = metadata?.generation === undefined
    ? null
    : String(metadata.generation);
  const actualSize = Number(metadata?.size);
  if (actualGeneration !== sourceRevision.generation
    || actualGeneration !== expectedFacts.generation
    || !Number.isSafeInteger(actualSize)
    || actualSize <= 0
    || actualSize !== expectedFacts.sizeBytes
    || metadata?.contentType !== expectedFacts.contentType
    || metadata?.crc32c !== expectedFacts.crc32c) {
    throw invalidMedia();
  }
}

function createBoundedHashTransform({ expectedSize, byteLimit, hash }) {
  let sizeBytes = 0;
  const stream = new Transform({
    transform(chunk, _encoding, callback) {
      const nextSize = sizeBytes + chunk.byteLength;
      if (nextSize > expectedSize || nextSize > byteLimit) {
        callback(mediaLimitsExceeded());
        return;
      }
      sizeBytes = nextSize;
      hash.update(chunk);
      callback(null, chunk);
    },
    flush(callback) {
      callback(sizeBytes === expectedSize ? null : invalidMedia());
    },
  });
  return Object.freeze({ stream, getSize: () => sizeBytes });
}

async function removeMaterial(directory) {
  if (directory === null) return;
  try {
    await rm(directory, { recursive: true, force: true });
  } catch {
    throw storageUnavailable();
  }
}

function stableFailure(error, aborted) {
  if (error instanceof ProcessingError) return error;
  if (aborted) return softTimeout();
  return storageUnavailable();
}

function createCancellationGate({ sourceSignal, deadline }) {
  const operationController = new AbortController();
  let cancelled = false;
  let timeout = null;
  let rejectCancellation;
  const cancellation = new Promise((_resolve, reject) => {
    rejectCancellation = reject;
  });
  cancellation.catch(() => {});

  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    operationController.abort();
    rejectCancellation(softTimeout());
  };
  sourceSignal.addEventListener('abort', cancel, { once: true });
  const remaining = deadline - Date.now();
  if (sourceSignal.aborted || remaining <= 0) cancel();
  else timeout = setTimeout(cancel, remaining);

  return Object.freeze({
    signal: operationController.signal,
    race(operation) {
      return Promise.race([operation, cancellation]);
    },
    throwIfCancelled() {
      if (sourceSignal.aborted || cancelled || Date.now() >= deadline) {
        cancel();
        throw softTimeout();
      }
    },
    isCancelled() {
      return sourceSignal.aborted || cancelled || Date.now() >= deadline;
    },
    dispose() {
      if (timeout !== null) clearTimeout(timeout);
      sourceSignal.removeEventListener('abort', cancel);
    },
  });
}

export function createFirebaseSourceMaterializer({
  storage,
  allowedBuckets,
  tempRoot = tmpdir(),
} = {}) {
  if (typeof storage?.bucket !== 'function') throw new TypeError('Firebase Storage is required');
  if (!Array.isArray(allowedBuckets)
    || allowedBuckets.length === 0
    || allowedBuckets.some((bucket) => typeof bucket !== 'string' || bucket.length === 0)) {
    throw new TypeError('allowedBuckets must be a non-empty string array');
  }
  if (typeof tempRoot !== 'string' || tempRoot.length === 0) {
    throw new TypeError('tempRoot must be a non-empty string');
  }
  const allowed = new Set(allowedBuckets);

  return Object.freeze({
    async materialize({
      sourceRevision: sourceRevisionInput,
      expectedStorageFacts: expectedStorageFactsInput,
      maxBytes,
      signal,
      deadlineAt,
    } = {}) {
      const sourceRevision = normalizeSourceRevision(sourceRevisionInput, allowed);
      const expectedFacts = normalizeExpectedFacts(expectedStorageFactsInput);
      assertSourceIdentity(sourceRevision, expectedFacts);
      if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw invalidMedia();
      if (!signal
        || typeof signal.addEventListener !== 'function'
        || typeof signal.removeEventListener !== 'function') throw invalidMedia();
      const deadline = normalizeDeadline(deadlineAt);
      if (signal.aborted || Date.now() >= deadline) throw softTimeout();

      const byteLimit = Math.min(maxBytes, HARD_MAX_BYTES);
      if (expectedFacts.sizeBytes > byteLimit) throw mediaLimitsExceeded();

      let directory = null;
      let sourceStream = null;
      let destinationStream = null;
      const cancellation = createCancellationGate({ sourceSignal: signal, deadline });

      try {
        cancellation.throwIfCancelled();
        let file;
        try {
          file = storage
            .bucket(sourceRevision.bucket)
            .file(sourceRevision.objectName, { generation: sourceRevision.generation });
        } catch {
          throw storageUnavailable();
        }
        cancellation.throwIfCancelled();

        let metadata;
        try {
          [metadata] = await cancellation.race(
            Promise.resolve().then(() => file.getMetadata()),
          );
        } catch (error) {
          if (error instanceof ProcessingError) throw error;
          throw storageUnavailable();
        }
        cancellation.throwIfCancelled();
        assertMetadata(metadata, sourceRevision, expectedFacts);
        cancellation.throwIfCancelled();

        directory = await mkdtemp(join(tempRoot, MATERIAL_DIRECTORY_PREFIX));
        cancellation.throwIfCancelled();
        await chmod(directory, 0o700);
        cancellation.throwIfCancelled();
        const path = join(directory, MATERIAL_FILE_NAME);
        cancellation.throwIfCancelled();
        destinationStream = createWriteStream(path, { flags: 'wx', mode: 0o600 });
        cancellation.throwIfCancelled();
        sourceStream = file.createReadStream({ validation: 'crc32c', decompress: false });

        const hash = createHash('sha256');
        const bounded = createBoundedHashTransform({
          expectedSize: expectedFacts.sizeBytes,
          byteLimit,
          hash,
        });
        await pipeline(sourceStream, bounded.stream, destinationStream, {
          signal: cancellation.signal,
        });

        let cleanupPromise = null;
        const cleanup = () => {
          cleanupPromise ??= removeMaterial(directory);
          return cleanupPromise;
        };
        return Object.freeze({
          path,
          sizeBytes: bounded.getSize(),
          inputHash: hash.digest('hex'),
          cleanup,
        });
      } catch (error) {
        try {
          sourceStream?.destroy();
          destinationStream?.destroy();
        } catch {
          // Stream destruction is best-effort; the stable failure below is authoritative.
        }
        let cleanupError;
        try {
          await removeMaterial(directory);
        } catch (errorDuringCleanup) {
          cleanupError = errorDuringCleanup;
        }
        throw cleanupError ?? stableFailure(
          error,
          cancellation.isCancelled(),
        );
      } finally {
        cancellation.dispose();
      }
    },
  });
}
