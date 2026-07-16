import { IdSchema } from '../domain/index.js';
import { IngestionError } from './errors.js';

const FINALIZED_TYPE = 'google.cloud.storage.object.v1.finalized';

const invalidEvent = () => new IngestionError(
  'ingestion/invalid-event',
  { permanent: true },
);

function singleHeader(headers, name, { optional = false } = {}) {
  const value = headers?.[name];
  if (value === undefined && optional) return null;
  if (typeof value !== 'string'
    || !value
    || value !== value.trim()
    || value.includes(',')) {
    throw invalidEvent();
  }
  return value;
}

export function parseStorageFinalizedEvent({ headers, body, allowedBuckets } = {}) {
  if (!Array.isArray(allowedBuckets)
    || allowedBuckets.length === 0
    || allowedBuckets.some((value) => typeof value !== 'string' || !value)) {
    throw new TypeError('allowedBuckets must be a non-empty string array');
  }
  const eventId = singleHeader(headers, 'ce-id');
  const type = singleHeader(headers, 'ce-type');
  const source = singleHeader(headers, 'ce-source');
  const envelopeGeneration = singleHeader(headers, 'ce-generation', { optional: true });
  if (type !== FINALIZED_TYPE || !body || typeof body !== 'object' || Array.isArray(body)) {
    throw invalidEvent();
  }

  const { bucket, name: objectName, generation } = body;
  if (typeof bucket !== 'string'
    || !allowedBuckets.includes(bucket)
    || source !== `//storage.googleapis.com/projects/_/buckets/${bucket}`
    || typeof objectName !== 'string'
    || typeof generation !== 'string'
    || !generation
    || (envelopeGeneration !== null && envelopeGeneration !== generation)) {
    throw invalidEvent();
  }

  const parts = objectName.split('/');
  if (parts.length !== 5 || parts[0] !== 'users' || parts[2] !== 'originals') {
    throw invalidEvent();
  }
  const [, uid, , batchId, fragmentId] = parts;
  if (![uid, batchId, fragmentId].every((value) => IdSchema.safeParse(value).success)) {
    throw invalidEvent();
  }

  return Object.freeze({
    eventId,
    bucket,
    objectName,
    generation,
    uid,
    batchId,
    fragmentId,
  });
}
