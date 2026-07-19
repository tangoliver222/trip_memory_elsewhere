import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { CapabilityArtifactRefSchema, IdSchema } from '../domain/index.js';
import { CapabilityError, retryableCapabilityError } from '../capabilities/errors.js';

const INPUT_KEYS = ['artifactRef', 'executionId', 'ownerId'];
const METADATA_KEYS = ['executionId', 'kind', 'ownerId', 'sha256'];
const MAX_NORMALIZED_BYTES = 1024 * 1024;

function conflict() {
  return new CapabilityError('capability/artifact-conflict', {
    retryable: false,
    billingUncertain: true,
  });
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function normalizeInput(input, allowedBuckets) {
  if (!input
    || typeof input !== 'object'
    || Array.isArray(input)
    || Object.keys(input).sort().join('\0') !== INPUT_KEYS.join('\0')
    || !IdSchema.safeParse(input.ownerId).success
    || !IdSchema.safeParse(input.executionId).success) {
    throw new TypeError('Capability artifact read input is invalid');
  }
  const parsed = CapabilityArtifactRefSchema.safeParse(input.artifactRef);
  if (!parsed.success
    || parsed.data.kind !== 'normalized'
    || !allowedBuckets.has(parsed.data.bucket)
    || parsed.data.objectName !== `users/${input.ownerId}/capability-results/${input.executionId}/normalized.json.gz`) {
    throw conflict();
  }
  return Object.freeze({
    ownerId: input.ownerId,
    executionId: input.executionId,
    artifactRef: parsed.data,
  });
}

function exactMetadata(actual, expected) {
  return actual
    && typeof actual === 'object'
    && !Array.isArray(actual)
    && Object.keys(actual).sort().join('\0') === METADATA_KEYS.join('\0')
    && METADATA_KEYS.every((key) => actual[key] === expected[key]);
}

function validateMetadata(metadata, input) {
  const { artifactRef } = input;
  const expectedMetadata = {
    executionId: input.executionId,
    kind: 'normalized',
    ownerId: input.ownerId,
    sha256: artifactRef.sha256,
  };
  const sizeBytes = Number(metadata?.size);
  if (metadata?.bucket !== artifactRef.bucket
    || metadata?.name !== artifactRef.objectName
    || String(metadata?.generation) !== artifactRef.generation
    || metadata?.contentType !== artifactRef.contentType
    || !Number.isSafeInteger(sizeBytes)
    || sizeBytes !== artifactRef.sizeBytes
    || !exactMetadata(metadata?.metadata, expectedMetadata)) {
    throw conflict();
  }
}

function parseArtifact(bytes) {
  let json;
  try {
    json = gunzipSync(bytes, { maxOutputLength: MAX_NORMALIZED_BYTES }).toString('utf8');
    const value = JSON.parse(json);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('shape');
    return deepFreeze(value);
  } catch {
    throw conflict();
  }
}

export function createFirebaseCapabilityArtifactReader({ storage, allowedBuckets } = {}) {
  if (typeof storage?.bucket !== 'function') throw new TypeError('Firebase Storage is required');
  if (!Array.isArray(allowedBuckets)
    || allowedBuckets.length === 0
    || allowedBuckets.some((bucket) => typeof bucket !== 'string' || bucket.length === 0)) {
    throw new TypeError('allowedBuckets must be a non-empty string array');
  }
  const allowed = new Set(allowedBuckets);

  return Object.freeze({
    async readNormalizedArtifact(inputValue) {
      const input = normalizeInput(inputValue, allowed);
      let file;
      try {
        file = storage.bucket(input.artifactRef.bucket).file(
          input.artifactRef.objectName,
          { generation: input.artifactRef.generation },
        );
      } catch {
        throw retryableCapabilityError('capability/repository-unavailable');
      }

      let metadata;
      try {
        [metadata] = await file.getMetadata();
      } catch {
        throw retryableCapabilityError('capability/repository-unavailable');
      }
      validateMetadata(metadata, input);

      let bytes;
      try {
        [bytes] = await file.download({ validation: 'crc32c', decompress: false });
      } catch {
        throw retryableCapabilityError('capability/repository-unavailable');
      }
      if (!Buffer.isBuffer(bytes)
        || bytes.byteLength !== input.artifactRef.sizeBytes
        || createHash('sha256').update(bytes).digest('hex') !== input.artifactRef.sha256) {
        throw conflict();
      }
      return parseArtifact(bytes);
    },
  });
}
