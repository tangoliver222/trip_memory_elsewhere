import { hammingDistance64 } from './dhash.js';

const ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const DHASH_PATTERN = /^[a-f0-9]{16}$/;

function requireString(value, name, pattern) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new TypeError(`${name} is invalid`);
  }
  return value;
}

function requireInteger(value, name, { min, max } = {}) {
  if (!Number.isInteger(value)
    || (min !== undefined && value < min)
    || (max !== undefined && value > max)) {
    throw new TypeError(`${name} is invalid`);
  }
  return value;
}

function compareIds(a, b) {
  if (a.fragmentId < b.fragmentId) return -1;
  if (a.fragmentId > b.fragmentId) return 1;
  return 0;
}

export function selectNearDuplicates({
  queryFragmentId,
  queryHash,
  bandMatches,
  scanLimit = 200,
  threshold = 6,
  limit = 5,
} = {}) {
  requireString(queryFragmentId, 'queryFragmentId', ID_PATTERN);
  requireString(queryHash, 'queryHash', DHASH_PATTERN);
  if (!Array.isArray(bandMatches)) throw new TypeError('bandMatches must be an array');
  requireInteger(scanLimit, 'scanLimit', { min: 1 });
  requireInteger(threshold, 'threshold', { min: 0, max: 64 });
  requireInteger(limit, 'limit', { min: 1 });

  const uniqueMatches = new Map();
  for (const match of bandMatches) {
    if (!match || typeof match !== 'object' || Array.isArray(match)) {
      throw new TypeError('each band match must be an object');
    }
    const fragmentId = requireString(match.fragmentId, 'fragmentId', ID_PATTERN);
    const perceptualHash = requireString(match.perceptualHash, 'perceptualHash', DHASH_PATTERN);
    if (fragmentId === queryFragmentId) continue;

    const existing = uniqueMatches.get(fragmentId);
    if (existing && existing.perceptualHash !== perceptualHash) {
      throw new TypeError('duplicate fragment IDs must have one perceptualHash');
    }
    uniqueMatches.set(fragmentId, { fragmentId, perceptualHash });
  }

  const stableMatches = [...uniqueMatches.values()].sort(compareIds);
  const scannedMatches = stableMatches.slice(0, scanLimit);
  const acceptedMatches = scannedMatches
    .map((match) => ({
      ...match,
      distance: hammingDistance64(queryHash, match.perceptualHash),
    }))
    .filter(({ distance }) => distance <= threshold)
    .sort((a, b) => a.distance - b.distance || compareIds(a, b))
    .slice(0, limit)
    .map((match, index) => Object.freeze({ ...match, rank: index + 1 }));

  return Object.freeze({
    matches: Object.freeze(acceptedMatches),
    truncated: stableMatches.length > scanLimit,
  });
}
