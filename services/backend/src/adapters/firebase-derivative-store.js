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
  'fragmentId',
  'inputHash',
  'ownerId',
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

async function readLiveFacts(file, expected) {
  let response;
  try {
    response = await file.getMetadata();
  } catch (error) {
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
      let file;
      try {
        file = storage.bucket(expected.bucket).file(expected.path);
      } catch {
        throw storageUnavailable();
      }
      try {
        await file.save(expected.buffer, {
          resumable: false,
          preconditionOpts: { ifGenerationMatch: 0 },
          metadata: {
            contentType: CONTENT_TYPE,
            metadata: expected.customMetadata,
          },
        });
      } catch (error) {
        if (!isPreconditionFailure(error)) throw storageUnavailable();
      }
      return readLiveFacts(file, expected);
    },
  });
}
