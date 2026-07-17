import { createHash } from 'node:crypto';

const ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const GENERATION_PATTERN = /^[1-9][0-9]*$/;
const LABEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const CAPABILITIES = new Set(['ocr', 'places', 'embedding', 'gemini']);
const INPUT_FIELDS = [
  'capability',
  'fragmentId',
  'ownerId',
  'provider',
  'providerVersion',
  'routePlanRevision',
  'sourceRevision',
];
const SOURCE_FIELDS = ['bucket', 'generation', 'inputHash', 'objectName'];

function invalid(name) {
  throw new TypeError(`${name} is invalid`);
}

function strictObject(value, name, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(name);
  const keys = Object.keys(value).sort();
  if (keys.length !== fields.length
    || keys.some((key, index) => key !== fields[index])) invalid(name);
  return value;
}

function string(value, name, pattern = null) {
  if (typeof value !== 'string'
    || value.length === 0
    || value !== value.trim()
    || (pattern !== null && !pattern.test(value))) invalid(name);
  return value;
}

function id(value, name) {
  return string(value, name, ID_PATTERN);
}

function encode(hash, name, value) {
  const nameBytes = Buffer.from(name, 'utf8');
  const valueBytes = Buffer.from(String(value), 'utf8');
  const lengths = Buffer.allocUnsafe(8);
  lengths.writeUInt32BE(nameBytes.length, 0);
  lengths.writeUInt32BE(valueBytes.length, 4);
  hash.update(lengths.subarray(0, 4));
  hash.update(nameBytes);
  hash.update(lengths.subarray(4));
  hash.update(valueBytes);
}

function digest(prefix, fields) {
  const hash = createHash('sha256');
  encode(hash, 'namespace', prefix);
  for (const [name, value] of fields) encode(hash, name, value);
  return `${prefix}_${hash.digest('hex').slice(0, 32)}`;
}

export function makeCapabilityIdentity(input) {
  strictObject(input, 'input', INPUT_FIELDS);
  const source = strictObject(input.sourceRevision, 'sourceRevision', SOURCE_FIELDS);
  if (!CAPABILITIES.has(input.capability)) invalid('capability');
  if (!Number.isSafeInteger(input.routePlanRevision)
    || input.routePlanRevision < 1
    || input.routePlanRevision > 5) invalid('routePlanRevision');

  const fields = [
    ['ownerId', id(input.ownerId, 'ownerId')],
    ['fragmentId', id(input.fragmentId, 'fragmentId')],
    ['source.bucket', string(source.bucket, 'sourceRevision.bucket')],
    ['source.objectName', string(source.objectName, 'sourceRevision.objectName')],
    ['source.generation', string(
      source.generation, 'sourceRevision.generation', GENERATION_PATTERN,
    )],
    ['source.inputHash', string(source.inputHash, 'sourceRevision.inputHash', HASH_PATTERN)],
    ['routePlanRevision', input.routePlanRevision],
    ['capability', input.capability],
    ['provider', string(input.provider, 'provider', LABEL_PATTERN)],
    ['providerVersion', string(input.providerVersion, 'providerVersion', LABEL_PATTERN)],
  ];

  return Object.freeze({
    idempotencyKey: digest('capidem', fields),
    executionId: digest('execute', fields),
    taskName: `ocr-${digest('task', fields).slice(5)}`,
    resultId: digest('capresult', fields),
    clientRequestId: digest('ocrrequest', fields),
  });
}
