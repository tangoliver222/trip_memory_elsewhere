import { createSemanticTarget } from './particle-targets.js';

const DATA_DENSITY_LIMIT = 120;

const seeded = (index, salt = 1) => {
  const value = Math.sin((index + 1) * (12.9898 + salt * 7.233)) * 43758.5453;
  return value - Math.floor(value);
};

const write = (array, index, x, y, z) => {
  const offset = index * 3;
  array[offset] = x;
  array[offset + 1] = y;
  array[offset + 2] = z;
};

function initializingSeed(poolSize) {
  const positions = new Float32Array(poolSize * 3);
  for (let index = 0; index < poolSize; index += 1) {
    const turn = seeded(index, 201) * Math.PI * 4;
    const radius = 1.4 + seeded(index, 202) * 4.2;
    write(
      positions,
      index,
      Math.cos(turn) * radius,
      Math.sin(turn) * radius * 0.46,
      -14 - seeded(index, 203) * 28,
    );
  }
  return positions;
}

function inferredItemCount(payload) {
  if (Number.isFinite(payload.itemCount)) return Math.max(0, Number(payload.itemCount));
  if (Number.isFinite(payload.sourceCount)) return Math.max(0, Number(payload.sourceCount));
  if (Array.isArray(payload.items)) return payload.items.length;
  if (Array.isArray(payload.fragments)) return payload.fragments.length;
  if (Array.isArray(payload.clusters)) {
    return payload.clusters.reduce((sum, cluster) => sum + Math.max(0, Number(cluster.weight) || 0), 0);
  }
  if (Array.isArray(payload.cities)) {
    return payload.cities.reduce((sum, city) => sum + Math.max(0, Number(city.weight ?? city.fragmentCount) || 0), 0);
  }
  if (Array.isArray(payload.anchors) && payload.anchors.length > 0) return payload.anchors.length;
  return null;
}

function activeCountFor(poolSize, itemCount, state) {
  if (state === 'initializing') return Math.max(1, Math.floor(poolSize * 0.08));
  if (itemCount == null) return poolSize;
  const base = poolSize * 0.2;
  const saturation = Math.sqrt(Math.min(DATA_DENSITY_LIMIT, itemCount) / DATA_DENSITY_LIMIT);
  return Math.min(poolSize, Math.max(1, Math.round(base + poolSize * 0.78 * saturation)));
}

function visibilityFor(poolSize, activeCount) {
  const visibility = new Float32Array(poolSize);
  for (let index = 0; index < poolSize; index += 1) {
    const previous = Math.floor((index * activeCount) / poolSize);
    const next = Math.floor(((index + 1) * activeCount) / poolSize);
    visibility[index] = next > previous ? 1 : 0;
  }
  return visibility;
}

function normalizeForSignature(value) {
  if (Array.isArray(value)) return value.map(normalizeForSignature);
  if (!value || typeof value !== 'object') {
    return typeof value === 'number' ? Math.round(value * 100) / 100 : value;
  }
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalizeForSignature(value[key])]));
}

function signatureFor(mode, itemCount, payload) {
  const facts = {
    mode,
    itemCount,
    revision: payload.dataRevision ?? null,
    anchors: (payload.anchors || []).map(({ id, x, y, z, weight, role }) => ({ id, x, y, z, weight, role })),
    cities: (payload.cities || []).map(({ id, slug, weight, fragmentCount, lat, lng }) => ({ id, slug, weight, fragmentCount, lat, lng })),
    clusters: (payload.clusters || []).map(({ id, slug, weight }) => ({ id, slug, weight })),
    relations: (payload.relations || []).map(({ id, from, to, status }) => ({ id, from, to, status })),
    items: (payload.items || []).map(({ id, role, clusterId, status }) => ({ id, role, clusterId, status })),
  };
  return JSON.stringify(normalizeForSignature(facts));
}

export function compileParticleScene(mode, poolSize, payload = {}) {
  if (!Number.isInteger(poolSize) || poolSize <= 0) {
    throw new TypeError('Particle pool size must be a positive integer.');
  }
  const itemCount = inferredItemCount(payload);
  const anchorCount = Array.isArray(payload.anchors) ? payload.anchors.length : 0;
  const state = itemCount === 0 && anchorCount === 0 ? 'initializing' : 'populated';
  const activeCount = activeCountFor(poolSize, itemCount, state);
  return Object.freeze({
    positions: state === 'initializing'
      ? initializingSeed(poolSize)
      : createSemanticTarget(mode, poolSize, payload),
    visibility: visibilityFor(poolSize, activeCount),
    activeCount,
    dataSignature: signatureFor(mode, itemCount, payload),
    anchorCount,
    state,
  });
}
