import { SourceTypeSchema } from '../domain/index.js';
import {
  IngestionError,
  invalidOriginal,
  retryableIngestionError,
} from '../ingestion/errors.js';
import { detectBinaryFormat } from '../ingestion/file-signature.js';

const SIGNATURE_PREFIX_BYTES = 32;

const FORMAT_BY_CONTENT_TYPE = Object.freeze({
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
});

function normalizePolicy(policy) {
  if (!policy
    || !SourceTypeSchema.safeParse(policy.sourceType).success
    || !Array.isArray(policy.allowedContentTypes)
    || policy.allowedContentTypes.length === 0
    || policy.allowedContentTypes.some((value) => typeof value !== 'string' || !value)
    || !Number.isSafeInteger(policy.maxBytes)
    || policy.maxBytes <= 0) {
    throw invalidOriginal();
  }
  return policy;
}

function normalizeMetadata(metadata, generation, policy) {
  const sizeBytes = Number(metadata?.size);
  const actualGeneration = metadata?.generation === undefined
    ? null
    : String(metadata.generation);
  if (actualGeneration !== generation
    || !Number.isSafeInteger(sizeBytes)
    || sizeBytes <= 0
    || sizeBytes > policy.maxBytes
    || typeof metadata?.crc32c !== 'string'
    || !metadata.crc32c
    || typeof metadata?.contentType !== 'string'
    || !policy.allowedContentTypes.includes(metadata.contentType)
    || (metadata.md5Hash !== undefined
      && metadata.md5Hash !== null
      && (typeof metadata.md5Hash !== 'string' || !metadata.md5Hash))) {
    throw invalidOriginal();
  }
  return Object.freeze({
    generation: actualGeneration,
    contentType: metadata.contentType,
    sizeBytes,
    crc32c: metadata.crc32c,
    md5Hash: metadata.md5Hash ?? null,
  });
}

async function readPrefix(file) {
  const bytes = new Uint8Array(SIGNATURE_PREFIX_BYTES);
  let length = 0;
  const stream = file.createReadStream({
    start: 0,
    end: SIGNATURE_PREFIX_BYTES - 1,
    validation: false,
  });
  for await (const chunk of stream) {
    const source = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    const remaining = SIGNATURE_PREFIX_BYTES - length;
    const selected = source.subarray(0, remaining);
    bytes.set(selected, length);
    length += selected.length;
    if (length === SIGNATURE_PREFIX_BYTES) break;
  }
  return bytes.subarray(0, length);
}

async function validateUtf8(file) {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const stream = file.createReadStream({ validation: false });
  for await (const chunk of stream) {
    try {
      decoder.decode(chunk, { stream: true });
    } catch {
      throw invalidOriginal();
    }
  }
  try {
    decoder.decode();
  } catch {
    throw invalidOriginal();
  }
}

function assertSourceCompatibility(sourceType, detectedFormat) {
  if (sourceType === 'text') {
    if (detectedFormat !== 'utf8-text') throw invalidOriginal();
    return;
  }
  if (['photo', 'screenshot'].includes(sourceType) && detectedFormat === 'pdf') {
    throw invalidOriginal();
  }
}

export function createFirebaseObjectInspector({ storage, allowedBuckets }) {
  if (typeof storage?.bucket !== 'function') throw new TypeError('Firebase Storage is required');
  if (!Array.isArray(allowedBuckets)
    || allowedBuckets.length === 0
    || allowedBuckets.some((bucket) => typeof bucket !== 'string' || !bucket)) {
    throw new TypeError('allowedBuckets must be a non-empty string array');
  }
  const allowed = new Set(allowedBuckets);

  return Object.freeze({
    async inspectOriginal({ bucket, objectName, generation, expectedPolicy } = {}) {
      if (!allowed.has(bucket)
        || typeof objectName !== 'string'
        || !objectName
        || typeof generation !== 'string'
        || !generation) {
        throw invalidOriginal();
      }
      const policy = normalizePolicy(expectedPolicy);
      const file = storage.bucket(bucket).file(objectName, { generation });

      let metadata;
      try {
        [metadata] = await file.getMetadata();
      } catch {
        throw retryableIngestionError();
      }
      const storageFacts = normalizeMetadata(metadata, generation, policy);

      let detectedFormat;
      try {
        if (storageFacts.contentType === 'text/plain') {
          await validateUtf8(file);
          detectedFormat = 'utf8-text';
        } else {
          detectedFormat = detectBinaryFormat(await readPrefix(file));
          if (!detectedFormat
            || FORMAT_BY_CONTENT_TYPE[storageFacts.contentType] !== detectedFormat) {
            throw invalidOriginal();
          }
        }
      } catch (error) {
        if (error instanceof IngestionError) throw error;
        throw retryableIngestionError();
      }

      assertSourceCompatibility(policy.sourceType, detectedFormat);
      return Object.freeze({ detectedFormat, storageFacts });
    },
  });
}
