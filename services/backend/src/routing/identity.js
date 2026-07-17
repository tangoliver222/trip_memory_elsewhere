import { createHash } from 'node:crypto';

const ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const PATH_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const GENERATION_PATTERN = /^[1-9][0-9]*$/;
const REASON_CODE_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;

const CAPABILITIES = new Set(['ocr', 'places', 'embedding', 'gemini']);
const COHORT_TYPES = new Set([
  'exact_duplicate',
  'near_duplicate',
  'burst',
  'same_time_place',
  'document_sequence',
]);
const ESCALATION_OUTCOMES = new Set(['unsupported', 'insufficient_input']);
const LEDGER_SCOPES = new Set(['user_day', 'batch', 'route', 'capability']);

function requireObject(input, name) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError(`${name} must be an object`);
  }
  return input;
}

function requireString(value, name, pattern) {
  if (typeof value !== 'string'
    || !value
    || value !== value.trim()
    || (pattern && !pattern.test(value))) {
    throw new TypeError(`${name} is invalid`);
  }
  return value;
}

const requireId = (value, name) => requireString(value, name, ID_PATTERN);
const requirePathSegment = (value, name) => requireString(value, name, PATH_SEGMENT_PATTERN);
const requireHash = (value, name) => requireString(value, name, SHA256_PATTERN);

function requirePositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${name} is invalid`);
  }
  return value;
}

function requireEnum(value, name, allowed) {
  if (!allowed.has(value)) {
    throw new TypeError(`${name} is invalid`);
  }
  return value;
}

function requireUtcDate(value, name) {
  requireString(value, name, /^\d{4}-\d{2}-\d{2}$/);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new TypeError(`${name} is invalid`);
  }
  return value;
}

function encodeField(hash, name, value) {
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

function digestId(prefix, fields) {
  const hash = createHash('sha256');
  for (const [name, value] of fields) {
    encodeField(hash, name, value);
  }
  return `${prefix}_${hash.digest('hex').slice(0, 32)}`;
}

function requireCapability(value, name = 'capability') {
  return requireEnum(value, name, CAPABILITIES);
}

function normalizeMemberRevisionRef(input, index) {
  const member = requireObject(input, `memberRevisionRefs[${index}]`);
  return Object.freeze({
    fragmentId: requireId(member.fragmentId, `memberRevisionRefs[${index}].fragmentId`),
    bucket: requireString(member.bucket, `memberRevisionRefs[${index}].bucket`),
    objectName: requireString(member.objectName, `memberRevisionRefs[${index}].objectName`),
    generation: requireString(
      member.generation,
      `memberRevisionRefs[${index}].generation`,
      GENERATION_PATTERN,
    ),
    inputHash: requireHash(member.inputHash, `memberRevisionRefs[${index}].inputHash`),
  });
}

function memberSortKey(member) {
  return [
    member.fragmentId,
    member.bucket,
    member.objectName,
    member.generation,
    member.inputHash,
  ].map((value) => `${Buffer.byteLength(value, 'utf8')}:${value}`).join('|');
}

function normalizeReasonCodes(reasonCodes) {
  if (!Array.isArray(reasonCodes) || reasonCodes.length < 1 || reasonCodes.length > 32) {
    throw new TypeError('reasonCodes is invalid');
  }
  const normalized = reasonCodes.map((reasonCode, index) => (
    requireString(reasonCode, `reasonCodes[${index}]`, REASON_CODE_PATTERN)
  ));
  if (new Set(normalized).size !== normalized.length) {
    throw new TypeError('reasonCodes must be unique');
  }
  return normalized.sort();
}

export function makeRoutingHeadId(input) {
  requireObject(input, 'input');
  return digestId('rhead', [
    ['ownerId', requireId(input.ownerId, 'ownerId')],
    ['fragmentId', requireId(input.fragmentId, 'fragmentId')],
    ['routerName', requirePathSegment(input.routerName, 'routerName')],
  ]);
}

export function makeRoutePlanId(input) {
  requireObject(input, 'input');
  return digestId('route', [
    ['ownerId', requireId(input.ownerId, 'ownerId')],
    ['fragmentId', requireId(input.fragmentId, 'fragmentId')],
    ['routerName', requirePathSegment(input.routerName, 'routerName')],
    ['revision', requirePositiveInteger(input.revision, 'revision')],
  ]);
}

export function makeRoutingCohortId(input) {
  requireObject(input, 'input');
  if (!Array.isArray(input.memberRevisionRefs)
    || input.memberRevisionRefs.length < 2
    || input.memberRevisionRefs.length > 200) {
    throw new TypeError('memberRevisionRefs is invalid');
  }
  const members = input.memberRevisionRefs
    .map(normalizeMemberRevisionRef)
    .sort((left, right) => memberSortKey(left).localeCompare(memberSortKey(right)));
  if (new Set(members.map((member) => member.fragmentId)).size !== members.length) {
    throw new TypeError('memberRevisionRefs must contain distinct fragments');
  }
  const fields = [
    ['ownerId', requireId(input.ownerId, 'ownerId')],
    ['type', requireEnum(input.type, 'type', COHORT_TYPES)],
    ['revision', requirePositiveInteger(input.revision, 'revision')],
  ];
  for (const [index, member] of members.entries()) {
    for (const [name, value] of Object.entries(member)) {
      fields.push([`memberRevisionRefs[${index}].${name}`, value]);
    }
  }
  return digestId('cohort', fields);
}

export function makeBudgetLedgerId(scope) {
  requireObject(scope, 'scope');
  const type = requireEnum(scope.type, 'scope.type', LEDGER_SCOPES);
  let key;
  if (type === 'user_day') {
    key = requireUtcDate(scope.key, 'scope.key');
  } else if (type === 'capability') {
    key = requireCapability(scope.key, 'scope.key');
  } else {
    key = requireId(scope.key, 'scope.key');
  }
  return digestId('ledger', [
    ['ownerId', requireId(scope.ownerId, 'scope.ownerId')],
    ['type', type],
    ['key', key],
  ]);
}

export function makeBudgetReservationId(input) {
  requireObject(input, 'input');
  return digestId('reserve', [
    ['routePlanId', requireId(input.routePlanId, 'routePlanId')],
    ['capability', requireCapability(input.capability)],
  ]);
}

export function makeCapabilityExecutionId(input) {
  requireObject(input, 'input');
  return digestId('execute', [
    ['routePlanId', requireId(input.routePlanId, 'routePlanId')],
    ['capability', requireCapability(input.capability)],
    ['idempotencyKey', requireId(input.idempotencyKey, 'idempotencyKey')],
  ]);
}

export function makeEscalationRequestId(input) {
  requireObject(input, 'input');
  const fields = [
    ['fromRoutePlanId', requireId(input.fromRoutePlanId, 'fromRoutePlanId')],
    ['fromCapability', requireCapability(input.fromCapability, 'fromCapability')],
    ['outcome', requireEnum(input.outcome, 'outcome', ESCALATION_OUTCOMES)],
    ['requestedCapability', requireCapability(input.requestedCapability, 'requestedCapability')],
  ];
  for (const [index, reasonCode] of normalizeReasonCodes(input.reasonCodes).entries()) {
    fields.push([`reasonCodes[${index}]`, reasonCode]);
  }
  return digestId('escalate', fields);
}
