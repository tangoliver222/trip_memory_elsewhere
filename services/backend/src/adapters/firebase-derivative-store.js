import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { IsoDateTimeSchema } from '../domain/index.js';
import { runAbortableOperation } from './abortable-operation.js';
import { makeDerivativePath } from '../processing/identity.js';
import {
  retryableProcessingError,
  terminalProcessingError,
} from '../processing/errors.js';

const PROCESSOR_NAME = 'deterministic-media';
const PROCESSOR_VERSION = 'v1';
const CONTENT_TYPE = 'image/webp';
const INPUT_KEYS = Object.freeze([
  'bucket',
  'deadlineAt',
  'fragmentId',
  'inputHash',
  'ownerId',
  'signal',
  'thumbnail',
]);
const THUMBNAIL_KEYS = Object.freeze(['buffer', 'height', 'width']);
const CUSTOM_METADATA_KEYS = Object.freeze([
  'fragmentId',
  'height',
  'inputHash',
  'ownerId',
  'processorName',
  'processorVersion',
  'width',
]);

const invalidMedia = () => terminalProcessingError('processing/invalid-media');
const derivativeConflict = () => terminalProcessingError('processing/derivative-conflict');
const storageUnavailable = () => retryableProcessingError('processing/storage-unavailable');
const softTimeout = () => retryableProcessingError('processing/soft-timeout');

function hasExactKeys(input, expectedKeys) {
  return input
    && typeof input === 'object'
    && !Array.isArray(input)
    && Object.keys(input).sort().join('\0') === expectedKeys.join('\0');
}

function crc32cBase64(bytes) {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0x82f6_3b78 : 0);
    }
  }
  const encoded = Buffer.allocUnsafe(4);
  encoded.writeUInt32BE((crc ^ 0xffff_ffff) >>> 0);
  return encoded.toString('base64');
}

function normalizeInput(input, allowedBuckets) {
  if (!hasExactKeys(input, INPUT_KEYS)
    || !allowedBuckets.has(input.bucket)
    || !(input.signal instanceof AbortSignal)
    || !IsoDateTimeSchema.safeParse(input.deadlineAt).success
    || !hasExactKeys(input.thumbnail, THUMBNAIL_KEYS)
    || !Buffer.isBuffer(input.thumbnail.buffer)
    || input.thumbnail.buffer.byteLength === 0
    || !Number.isInteger(input.thumbnail.width)
    || input.thumbnail.width <= 0
    || input.thumbnail.width > 512
    || !Number.isInteger(input.thumbnail.height)
    || input.thumbnail.height <= 0
    || input.thumbnail.height > 512) {
    throw invalidMedia();
  }
  const deadlineMs = Date.parse(input.deadlineAt);
  if (input.signal.aborted || Date.now() >= deadlineMs) throw softTimeout();

  let path;
  try {
    path = makeDerivativePath({
      ownerId: input.ownerId,
      fragmentId: input.fragmentId,
      processorName: PROCESSOR_NAME,
      processorVersion: PROCESSOR_VERSION,
      inputHash: input.inputHash,
    });
  } catch {
    throw invalidMedia();
  }

  const buffer = Buffer.from(input.thumbnail.buffer);
  const customMetadata = Object.freeze({
    ownerId: input.ownerId,
    fragmentId: input.fragmentId,
    processorName: PROCESSOR_NAME,
    processorVersion: PROCESSOR_VERSION,
    inputHash: input.inputHash,
    width: String(input.thumbnail.width),
    height: String(input.thumbnail.height),
  });
  return Object.freeze({
    bucket: input.bucket,
    path,
    buffer,
    width: input.thumbnail.width,
    height: input.thumbnail.height,
    crc32c: crc32cBase64(buffer),
    customMetadata,
    sourceSignal: input.signal,
    deadlineMs,
  });
}

function normalizePositiveDecimal(value) {
  if (typeof value === 'string' && /^[1-9][0-9]*$/.test(value)) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  return null;
}

function normalizePositiveInteger(value) {
  if ((typeof value !== 'string' && typeof value !== 'number')
    || (typeof value === 'string' && !/^[1-9][0-9]*$/.test(value))) return null;
  const normalized = Number(value);
  return Number.isSafeInteger(normalized) && normalized > 0 ? normalized : null;
}

function exactCustomMetadata(actual, expected) {
  if (!hasExactKeys(actual, CUSTOM_METADATA_KEYS)) return false;
  return CUSTOM_METADATA_KEYS.every((key) => actual[key] === expected[key]);
}

function normalizeLiveFacts(metadata, expected) {
  const generation = normalizePositiveDecimal(metadata?.generation);
  const metageneration = normalizePositiveDecimal(metadata?.metageneration);
  const sizeBytes = normalizePositiveInteger(metadata?.size);
  if ((metadata?.bucket !== undefined && metadata.bucket !== expected.bucket)
    || metadata?.name !== expected.path
    || generation === null
    || metageneration === null
    || metadata?.contentType !== CONTENT_TYPE
    || sizeBytes !== expected.buffer.byteLength
    || metadata?.crc32c !== expected.crc32c
    || !exactCustomMetadata(metadata?.metadata, expected.customMetadata)) {
    throw derivativeConflict();
  }

  return Object.freeze({
    path: metadata.name,
    generation,
    metageneration,
    contentType: CONTENT_TYPE,
    sizeBytes,
    crc32c: metadata.crc32c,
    width: Number(metadata.metadata.width),
    height: Number(metadata.metadata.height),
  });
}

function createOperationScope(sourceSignal, deadlineMs) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  sourceSignal.addEventListener('abort', abort, { once: true });
  if (sourceSignal.aborted) abort();
  let timeout = null;
  const scheduleDeadline = () => {
    const remainingMs = deadlineMs - Date.now();
    if (remainingMs <= 0) {
      abort();
      return;
    }
    timeout = setTimeout(
      remainingMs > 2_147_483_647 ? scheduleDeadline : abort,
      Math.min(remainingMs, 2_147_483_647),
    );
    timeout.unref?.();
  };
  scheduleDeadline();
  return Object.freeze({
    signal: controller.signal,
    assertActive() {
      if (controller.signal.aborted || Date.now() >= deadlineMs) {
        controller.abort();
        throw softTimeout();
      }
    },
    close() {
      if (timeout !== null) clearTimeout(timeout);
      sourceSignal.removeEventListener('abort', abort);
    },
  });
}

function isAbort(error, signal, deadlineMs) {
  return signal.aborted || Date.now() >= deadlineMs || error?.name === 'AbortError';
}

async function readLiveFacts(file, expected, operation) {
  let response;
  try {
    operation.assertActive();
    response = await runAbortableOperation({
      signal: operation.signal,
      start: () => file.getMetadata(),
      cancel: () => undefined,
    });
    operation.assertActive();
  } catch (error) {
    if (isAbort(error, operation.signal, expected.deadlineMs)) throw softTimeout();
    // Cloud Storage reads are strongly consistent, so a coded 404 after either create or
    // precondition failure means the immutable object cannot be authoritatively reused.
    if (error?.code === 404 || error?.code === '404') throw derivativeConflict();
    throw storageUnavailable();
  }
  if (!Array.isArray(response) || response.length === 0) throw derivativeConflict();
  return normalizeLiveFacts(response[0], expected);
}

function isPreconditionFailure(error) {
  return error?.code === 412 || error?.code === '412';
}

export function createFirebaseDerivativeStore({ storage, allowedBuckets } = {}) {
  if (typeof storage?.bucket !== 'function') throw new TypeError('Firebase Storage is required');
  if (!Array.isArray(allowedBuckets)
    || allowedBuckets.length === 0
    || allowedBuckets.some((bucket) => typeof bucket !== 'string' || bucket.length === 0)) {
    throw new TypeError('allowedBuckets must be a non-empty string array');
  }
  const allowed = new Set(allowedBuckets);

  return Object.freeze({
    async putThumbnail(input) {
      const expected = normalizeInput(input, allowed);
      const operation = createOperationScope(expected.sourceSignal, expected.deadlineMs);
      let file;
      try {
        operation.assertActive();
        file = storage.bucket(expected.bucket).file(expected.path);
      } catch {
        operation.close();
        if (isAbort(null, operation.signal, expected.deadlineMs)) throw softTimeout();
        throw storageUnavailable();
      }
      try {
        try {
          operation.assertActive();
          const upload = file.createWriteStream({
            resumable: false,
            preconditionOpts: { ifGenerationMatch: 0 },
            validation: 'crc32c',
            metadata: {
              contentType: CONTENT_TYPE,
              metadata: expected.customMetadata,
            },
          });
          await pipeline(Readable.from([expected.buffer]), upload, {
            signal: operation.signal,
          });
          operation.assertActive();
        } catch (error) {
          if (isAbort(error, operation.signal, expected.deadlineMs)) throw softTimeout();
          if (!isPreconditionFailure(error)) throw storageUnavailable();
        }
        return await readLiveFacts(file, expected, operation);
      } finally {
        operation.close();
      }
    },
  });
}
