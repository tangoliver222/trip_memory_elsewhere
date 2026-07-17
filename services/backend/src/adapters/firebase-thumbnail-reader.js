const HARD_MAX_BYTES = 2_097_152;
const CONTENT_TYPE = 'image/webp';
const GENERATION_PATTERN = /^[1-9][0-9]*$/;

function thumbnailError(code = 'routing/thumbnail-unavailable') {
  const error = new Error('Routing thumbnail is unavailable');
  error.name = 'RoutingThumbnailError';
  error.code = code;
  return error;
}

function normalizePositiveInteger(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value !== 'string' || !GENERATION_PATTERN.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function normalizeFragment(fragment, allowedBuckets, byteLimit) {
  const bucket = fragment?.storage?.bucket;
  const thumbnail = fragment?.derivatives?.thumbnail;
  if (!allowedBuckets.has(bucket)
    || !thumbnail
    || typeof thumbnail.path !== 'string'
    || thumbnail.path.length === 0
    || typeof thumbnail.generation !== 'string'
    || !GENERATION_PATTERN.test(thumbnail.generation)
    || thumbnail.contentType !== CONTENT_TYPE
    || !Number.isSafeInteger(thumbnail.sizeBytes)
    || thumbnail.sizeBytes < 1
    || thumbnail.sizeBytes > byteLimit) {
    throw thumbnailError();
  }
  return Object.freeze({
    bucket,
    path: thumbnail.path,
    generation: thumbnail.generation,
    sizeBytes: thumbnail.sizeBytes,
  });
}

function validateMetadata(response, expected, byteLimit) {
  if (!Array.isArray(response) || response.length < 1) throw thumbnailError();
  const metadata = response[0];
  const sizeBytes = normalizePositiveInteger(metadata?.size);
  if ((metadata?.bucket !== undefined && metadata.bucket !== expected.bucket)
    || (metadata?.name !== undefined && metadata.name !== expected.path)
    || String(metadata?.generation) !== expected.generation
    || metadata?.contentType !== CONTENT_TYPE
    || sizeBytes === null
    || sizeBytes !== expected.sizeBytes
    || sizeBytes > byteLimit) {
    throw thumbnailError();
  }
  return sizeBytes;
}

async function collectStream(stream, expectedSize, signal) {
  const chunks = [];
  let sizeBytes = 0;
  const abort = () => stream.destroy(thumbnailError('routing/thumbnail-aborted'));
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  try {
    for await (const chunk of stream) {
      if (signal.aborted) throw thumbnailError('routing/thumbnail-aborted');
      const bytes = Buffer.from(chunk);
      sizeBytes += bytes.byteLength;
      if (sizeBytes > expectedSize) {
        stream.destroy();
        throw thumbnailError();
      }
      chunks.push(bytes);
    }
  } catch {
    throw thumbnailError(signal.aborted
      ? 'routing/thumbnail-aborted'
      : 'routing/thumbnail-unavailable');
  } finally {
    signal.removeEventListener('abort', abort);
  }
  if (sizeBytes !== expectedSize) throw thumbnailError();
  return Buffer.concat(chunks, sizeBytes);
}

export function createFirebaseThumbnailReader({
  storage,
  allowedBuckets,
  maxBytes = HARD_MAX_BYTES,
} = {}) {
  if (typeof storage?.bucket !== 'function') throw new TypeError('Firebase Storage is required');
  if (!Array.isArray(allowedBuckets)
    || allowedBuckets.length < 1
    || allowedBuckets.some((bucket) => typeof bucket !== 'string' || bucket.length === 0)) {
    throw new TypeError('allowedBuckets must be a non-empty string array');
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > HARD_MAX_BYTES) {
    throw new TypeError('maxBytes must be a positive integer no greater than 2 MiB');
  }
  const allowed = new Set(allowedBuckets);

  return Object.freeze({
    async read(fragment, { signal } = {}) {
      if (!(signal instanceof AbortSignal)) throw new TypeError('signal must be an AbortSignal');
      if (signal.aborted) throw thumbnailError('routing/thumbnail-aborted');
      const expected = normalizeFragment(fragment, allowed, maxBytes);
      let file;
      try {
        file = storage.bucket(expected.bucket).file(expected.path, {
          generation: expected.generation,
        });
      } catch {
        throw thumbnailError();
      }

      let metadata;
      try {
        metadata = await file.getMetadata();
      } catch {
        throw thumbnailError(signal.aborted
          ? 'routing/thumbnail-aborted'
          : 'routing/thumbnail-unavailable');
      }
      if (signal.aborted) throw thumbnailError('routing/thumbnail-aborted');
      const expectedSize = validateMetadata(metadata, expected, maxBytes);

      let stream;
      try {
        stream = file.createReadStream({ validation: 'crc32c', decompress: false });
      } catch {
        throw thumbnailError();
      }
      return collectStream(stream, expectedSize, signal);
    },
  });
}
