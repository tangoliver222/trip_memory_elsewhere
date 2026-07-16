import { createHash } from 'node:crypto';

const ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const PATH_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function requireObject(input, name) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError(`${name} must be an object`);
  }
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

function hashTuple(values) {
  const hash = createHash('sha256');
  for (const value of values) {
    const encoded = Buffer.from(value, 'utf8');
    const length = Buffer.allocUnsafe(4);
    length.writeUInt32BE(encoded.length);
    hash.update(length);
    hash.update(encoded);
  }
  return hash.digest('hex');
}

export function makeProcessingTaskId(input) {
  requireObject(input, 'sourceRevisionInput');
  const values = [
    requireId(input.ownerId, 'ownerId'),
    requireId(input.fragmentId, 'fragmentId'),
    requirePathSegment(input.processorName, 'processorName'),
    requirePathSegment(input.processorVersion, 'processorVersion'),
    requireString(input.bucket, 'bucket'),
    requireString(input.objectName, 'objectName'),
    requireString(input.generation, 'generation'),
  ];
  if (input.inputHash !== undefined && input.inputHash !== null) {
    requireHash(input.inputHash, 'inputHash');
  }
  return `task_${hashTuple(values)}`;
}

export function makeExactCandidateId(input) {
  requireObject(input, 'input');
  const algorithmVersion = requirePathSegment(input.algorithmVersion, 'algorithmVersion');
  const canonicalFragmentId = requireId(input.canonicalFragmentId, 'canonicalFragmentId');
  const candidateFragmentId = requireId(input.candidateFragmentId, 'candidateFragmentId');
  if (canonicalFragmentId === candidateFragmentId) {
    throw new TypeError('candidate fragments must be distinct');
  }
  return `dup_${hashTuple([
    'exact',
    algorithmVersion,
    canonicalFragmentId,
    candidateFragmentId,
  ])}`;
}

export function makeNearCandidateId(input) {
  requireObject(input, 'input');
  const algorithmVersion = requirePathSegment(input.algorithmVersion, 'algorithmVersion');
  const queryFragmentId = requireId(input.queryFragmentId, 'queryFragmentId');
  const matchedFragmentId = requireId(input.matchedFragmentId, 'matchedFragmentId');
  if (queryFragmentId === matchedFragmentId) {
    throw new TypeError('candidate fragments must be distinct');
  }
  return `dup_${hashTuple([
    'near',
    algorithmVersion,
    queryFragmentId,
    matchedFragmentId,
  ])}`;
}

export function makePairKey(fragmentIds) {
  if (!Array.isArray(fragmentIds) || fragmentIds.length !== 2) {
    throw new TypeError('fragmentIds must contain exactly two IDs');
  }
  const sortedIds = fragmentIds.map((id, index) => requireId(id, `fragmentIds[${index}]`)).sort();
  if (sortedIds[0] === sortedIds[1]) {
    throw new TypeError('fragmentIds must be distinct');
  }
  return `pair_${hashTuple(sortedIds)}`;
}

export function makeDerivativePath(input) {
  requireObject(input, 'input');
  const ownerId = requireId(input.ownerId, 'ownerId');
  const fragmentId = requireId(input.fragmentId, 'fragmentId');
  const processorName = requirePathSegment(input.processorName, 'processorName');
  const processorVersion = requirePathSegment(input.processorVersion, 'processorVersion');
  const inputHash = requireHash(input.inputHash, 'inputHash');
  return `users/${ownerId}/derived/${fragmentId}/${processorName}/${processorVersion}/${inputHash}/thumbnail.webp`;
}
