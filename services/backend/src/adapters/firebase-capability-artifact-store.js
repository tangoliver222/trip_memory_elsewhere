import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { z } from 'zod';
import { CapabilityArtifactRefSchema, IdSchema } from '../domain/index.js';
import { CapabilityError, retryableCapabilityError } from '../capabilities/errors.js';

const CONTENT_TYPE = 'application/gzip';
const INPUT_KEYS = ['bucket', 'executionId', 'ownerId', 'value'];
const METADATA_KEYS = ['executionId', 'kind', 'ownerId', 'sha256'];

function artifactConflict() {
  return new CapabilityError('capability/artifact-conflict', {
    retryable: false,
    billingUncertain: true,
  });
}

function deepSort(value) {
  if (Array.isArray(value)) return value.map(deepSort);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, deepSort(value[key])]));
}

function normalizeInput(input, allowed) {
  if (!input
    || typeof input !== 'object'
    || Array.isArray(input)
    || Object.keys(input).sort().join('\0') !== INPUT_KEYS.join('\0')
    || !allowed.has(input.bucket)
    || !IdSchema.safeParse(input.ownerId).success
    || !IdSchema.safeParse(input.executionId).success
    || !z.json().safeParse(input.value).success) {
    throw new TypeError('Capability artifact input is invalid');
  }
  const json = JSON.stringify(deepSort(input.value));
  const bytes = gzipSync(Buffer.from(json, 'utf8'), { level: 9, mtime: 0 });
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return { ...input, bytes, sha256 };
}

function customMetadata(input, kind) {
  return {
    executionId: input.executionId,
    kind,
    ownerId: input.ownerId,
    sha256: input.sha256,
  };
}

function exactMetadata(actual, expected) {
  return actual
    && typeof actual === 'object'
    && !Array.isArray(actual)
    && Object.keys(actual).sort().join('\0') === METADATA_KEYS.join('\0')
    && METADATA_KEYS.every((key) => actual[key] === expected[key]);
}

function positiveDecimal(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  return typeof value === 'string' && /^[1-9][0-9]*$/.test(value) ? value : null;
}

async function persist({ storage, input, kind }) {
  const objectName = `users/${input.ownerId}/capability-results/${input.executionId}/${kind}.json.gz`;
  let file;
  try {
    file = storage.bucket(input.bucket).file(objectName);
  } catch {
    throw retryableCapabilityError('capability/repository-unavailable');
  }
  const metadata = customMetadata(input, kind);
  let reused = false;
  try {
    await file.save(input.bytes, {
      resumable: false,
      preconditionOpts: { ifGenerationMatch: 0 },
      validation: 'crc32c',
      metadata: { contentType: CONTENT_TYPE, metadata },
    });
  } catch (error) {
    if (error?.code !== 412 && error?.code !== '412') {
      throw retryableCapabilityError('capability/repository-unavailable');
    }
    reused = true;
  }

  let live;
  try {
    const response = await file.getMetadata();
    live = Array.isArray(response) ? response[0] : null;
  } catch {
    throw retryableCapabilityError('capability/repository-unavailable');
  }
  const generation = positiveDecimal(live?.generation);
  const sizeBytes = Number(live?.size);
  if ((live.bucket !== undefined && live.bucket !== input.bucket)
    || live?.name !== objectName
    || generation === null
    || live?.contentType !== CONTENT_TYPE
    || !Number.isSafeInteger(sizeBytes)
    || sizeBytes !== input.bytes.byteLength
    || !exactMetadata(live?.metadata, metadata)) {
    throw artifactConflict();
  }
  if (reused) {
    let existing;
    try {
      const response = await file.download({ validation: 'crc32c' });
      existing = Array.isArray(response) ? response[0] : null;
    } catch {
      throw artifactConflict();
    }
    if (!Buffer.isBuffer(existing) || !existing.equals(input.bytes)) throw artifactConflict();
  }
  return Object.freeze(CapabilityArtifactRefSchema.parse({
    kind,
    bucket: input.bucket,
    objectName,
    generation,
    contentType: CONTENT_TYPE,
    sizeBytes,
    sha256: input.sha256,
  }));
}

export function createFirebaseCapabilityArtifactStore({ storage, allowedBuckets } = {}) {
  if (typeof storage?.bucket !== 'function') throw new TypeError('Firebase Storage is required');
  if (!Array.isArray(allowedBuckets)
    || allowedBuckets.length === 0
    || allowedBuckets.some((bucket) => typeof bucket !== 'string' || bucket.length === 0)) {
    throw new TypeError('allowedBuckets must be a non-empty string array');
  }
  const allowed = new Set(allowedBuckets);
  const put = (kind, input) => persist({
    storage,
    input: normalizeInput(input, allowed),
    kind,
  });
  return Object.freeze({
    async putProviderArtifact(input) { return put('provider', input); },
    async putNormalizedArtifact(input) { return put('normalized', input); },
  });
}
