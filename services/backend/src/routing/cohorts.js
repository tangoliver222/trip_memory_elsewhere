import { parseDuplicateCandidate } from '../domain/duplicate-candidate.js';
import { parseFragment } from '../domain/fragment.js';

const MAX_COHORT_MEMBERS = 200;
const BURST_ADJACENT_MS = 2_000;
const BURST_SPAN_MS = 15_000;
const PLACE_SPAN_MS = 10 * 60 * 1_000;
const PLACE_ACCURACY_METERS = 50;
const PLACE_DISTANCE_METERS = 50;
const EARTH_RADIUS_METERS = 6_371_000;

const TYPE_ORDER = new Map([
  ['exact_duplicate', 0],
  ['near_duplicate', 1],
  ['burst', 2],
  ['same_time_place', 3],
]);

const fragmentRef = (id) => Object.freeze({ type: 'fragment', id });

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function revisionRef(fragment) {
  return {
    fragmentId: fragment.id,
    generation: fragment.storage.generation,
    inputHash: fragment.hashes.sha256,
  };
}

function partitionMembers(members) {
  if (members.length <= MAX_COHORT_MEMBERS) return [members];
  const partitions = [];
  let offset = 0;
  while (members.length - offset > MAX_COHORT_MEMBERS) {
    const remaining = members.length - offset;
    const size = remaining === MAX_COHORT_MEMBERS + 1
      ? MAX_COHORT_MEMBERS - 1
      : MAX_COHORT_MEMBERS;
    partitions.push(members.slice(offset, offset + size));
    offset += size;
  }
  partitions.push(members.slice(offset));
  return partitions;
}

function partitionExactMembers(members, canonicalId) {
  if (members.length <= MAX_COHORT_MEMBERS) return [members];
  const supportingIds = members.filter((id) => id !== canonicalId);
  const partitions = [];
  for (let offset = 0; offset < supportingIds.length; offset += MAX_COHORT_MEMBERS - 1) {
    partitions.push([
      canonicalId,
      ...supportingIds.slice(offset, offset + MAX_COHORT_MEMBERS - 1),
    ].sort());
  }
  return partitions;
}

function buildComponents(edges) {
  const parent = new Map();
  const find = (id) => {
    const current = parent.get(id) ?? id;
    if (current === id) {
      parent.set(id, id);
      return id;
    }
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const unite = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    const [first, second] = [leftRoot, rightRoot].sort();
    parent.set(second, first);
  };
  for (const [left, right] of edges) unite(left, right);
  const components = new Map();
  for (const id of [...parent.keys()].sort()) {
    const root = find(id);
    const members = components.get(root) ?? [];
    members.push(id);
    components.set(root, members);
  }
  return [...components.values()].filter((members) => members.length >= 2);
}

function makeDraft({ type, memberIds, fragmentsById, basisCodes, warning, canonicalId }) {
  const draft = {
    type,
    memberRevisionRefs: memberIds
      .map((id) => revisionRef(fragmentsById.get(id)))
      .sort((left, right) => left.fragmentId.localeCompare(right.fragmentId)),
    ...(canonicalId === undefined ? {} : { canonicalFragmentRef: fragmentRef(canonicalId) }),
    basisCodes,
    warningCodes: warning ? ['routing/cohort-truncated'] : [],
  };
  return deepFreeze(draft);
}

function duplicateCohorts({ candidates, fragmentsById, kind }) {
  const accepted = candidates.filter((candidate) => {
    if (candidate.kind !== kind) return false;
    const ids = candidate.pairRefs.map(({ id }) => id);
    if (!ids.every((id) => fragmentsById.has(id))) return false;
    const fragments = ids.map((id) => fragmentsById.get(id));
    if (fragments.some((fragment) => fragment.ownerId !== candidate.ownerId)) return false;
    if (kind === 'exact') {
      return fragments[0].hashes.sha256 !== null
        && fragments[0].hashes.sha256 === fragments[1].hashes.sha256;
    }
    return fragments.every((fragment) => fragment.hashes.perceptualHash !== null);
  });
  const edges = accepted
    .map((candidate) => candidate.pairRefs.map(({ id }) => id))
    .sort((left, right) => left.join('\0').localeCompare(right.join('\0')));
  const components = buildComponents(edges);
  return components.flatMap((component) => {
    let canonicalId;
    if (kind === 'exact') {
      const componentSet = new Set(component);
      const canonicalIds = accepted
        .filter(({ pairRefs }) => pairRefs.every(({ id }) => componentSet.has(id)))
        .map(({ canonicalFragmentRef }) => canonicalFragmentRef.id);
      const candidateIds = new Set(accepted
        .filter(({ pairRefs }) => pairRefs.every(({ id }) => componentSet.has(id)))
        .map(({ candidateFragmentRef }) => candidateFragmentRef.id));
      canonicalId = [...new Set(canonicalIds)]
        .sort((left, right) => Number(candidateIds.has(left)) - Number(candidateIds.has(right))
          || left.localeCompare(right))[0];
    }
    const partitions = kind === 'exact'
      ? partitionExactMembers(component, canonicalId)
      : partitionMembers(component);
    return partitions.map((memberIds) => makeDraft({
      type: kind === 'exact' ? 'exact_duplicate' : 'near_duplicate',
      memberIds,
      fragmentsById,
      basisCodes: [kind === 'exact' ? 'sha256-exact' : 'dhash-distance'],
      warning: component.length > MAX_COHORT_MEMBERS,
      canonicalId: kind === 'exact' ? canonicalId : undefined,
    }));
  });
}

function reliableTime(fragment) {
  const fact = fragment.facts.capturedAt;
  const instant = fact?.value?.instant;
  if (['confirmed', 'corrected', 'suggested'].includes(fact?.status)
    && typeof instant === 'string'
    && /(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(instant)) {
    const timestamp = Date.parse(instant);
    if (Number.isFinite(timestamp)) return timestamp;
  }
  if (fragment.source.sourceCreatedAt !== null) {
    const timestamp = Date.parse(fragment.source.sourceCreatedAt);
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return null;
}

function windowGroups(entries, accepts) {
  const groups = [];
  let current = [];
  for (const entry of entries) {
    if (current.length === 0 || accepts(current, entry)) current.push(entry);
    else {
      if (current.length >= 2) groups.push(current);
      current = [entry];
    }
  }
  if (current.length >= 2) groups.push(current);
  return groups;
}

function entriesByBatch(entries) {
  const batches = new Map();
  for (const entry of entries) {
    const batch = batches.get(entry.fragment.batchId) ?? [];
    batch.push(entry);
    batches.set(entry.fragment.batchId, batch);
  }
  return [...batches.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, batch]) => batch);
}

function seedGroups(entries, accepts) {
  const groups = [];
  let remaining = [...entries];
  while (remaining.length > 0) {
    const seed = remaining[0];
    const group = [seed];
    const ungrouped = [];
    for (const entry of remaining.slice(1)) {
      if (accepts(seed, entry)) group.push(entry);
      else ungrouped.push(entry);
    }
    if (group.length >= 2) groups.push(group);
    remaining = ungrouped;
  }
  return groups;
}

function burstCohorts(fragments, fragmentsById) {
  const entries = fragments
    .filter((fragment) => fragment.type === 'photo')
    .map((fragment) => ({ fragment, timestamp: reliableTime(fragment) }))
    .filter(({ timestamp }) => timestamp !== null)
    .sort((left, right) => left.timestamp - right.timestamp
      || left.fragment.id.localeCompare(right.fragment.id));
  const groups = entriesByBatch(entries).flatMap((batch) => windowGroups(batch, (current, entry) => {
    const first = current[0];
    const previous = current.at(-1);
    return entry.timestamp - previous.timestamp <= BURST_ADJACENT_MS
      && entry.timestamp - first.timestamp <= BURST_SPAN_MS;
  }));
  return groups.flatMap((group) => partitionMembers(group.map(({ fragment }) => fragment.id))
    .map((memberIds) => makeDraft({
      type: 'burst',
      memberIds,
      fragmentsById,
      basisCodes: ['capture-time-window'],
      warning: group.length > MAX_COHORT_MEMBERS,
    })));
}

function haversineMeters(left, right) {
  const radians = (degrees) => degrees * (Math.PI / 180);
  const lat1 = radians(left.lat);
  const lat2 = radians(right.lat);
  const deltaLat = lat2 - lat1;
  const deltaLng = radians(right.lng - left.lng);
  const value = (Math.sin(deltaLat / 2) ** 2)
    + (Math.cos(lat1) * Math.cos(lat2) * (Math.sin(deltaLng / 2) ** 2));
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function sameTimePlaceCohorts(fragments, fragmentsById) {
  const entries = fragments.map((fragment) => ({
    fragment,
    timestamp: reliableTime(fragment),
    location: fragment.source.locationHint,
  })).filter(({ timestamp, location }) => timestamp !== null
    && location !== null
    && location.accuracyMeters <= PLACE_ACCURACY_METERS)
    .sort((left, right) => left.timestamp - right.timestamp
      || left.fragment.id.localeCompare(right.fragment.id));
  const groups = entriesByBatch(entries).flatMap((batch) => seedGroups(
    batch,
    (seed, entry) => entry.timestamp - seed.timestamp <= PLACE_SPAN_MS
      && haversineMeters(seed.location, entry.location) <= PLACE_DISTANCE_METERS + 1e-9,
  ));
  return groups.flatMap((group) => partitionMembers(group.map(({ fragment }) => fragment.id))
    .map((memberIds) => makeDraft({
      type: 'same_time_place',
      memberIds,
      fragmentsById,
      basisCodes: ['source-location-window'],
      warning: group.length > MAX_COHORT_MEMBERS,
    })));
}

export function buildRoutingCohorts({ fragments, duplicateCandidates, routerVersion } = {}) {
  if (routerVersion !== 'v1') throw new TypeError('routerVersion is unsupported');
  if (!Array.isArray(fragments) || !Array.isArray(duplicateCandidates)) {
    throw new TypeError('fragments and duplicateCandidates must be arrays');
  }
  const normalizedFragments = fragments.map(parseFragment);
  const fragmentsById = new Map();
  for (const fragment of normalizedFragments) {
    if (fragmentsById.has(fragment.id)) throw new TypeError('fragments must be unique');
    fragmentsById.set(fragment.id, fragment);
  }
  const normalizedCandidates = duplicateCandidates.map(parseDuplicateCandidate);
  const cohorts = [
    ...duplicateCohorts({
      candidates: normalizedCandidates,
      fragmentsById,
      kind: 'exact',
    }),
    ...duplicateCohorts({
      candidates: normalizedCandidates,
      fragmentsById,
      kind: 'near',
    }),
    ...burstCohorts(normalizedFragments, fragmentsById),
    ...sameTimePlaceCohorts(normalizedFragments, fragmentsById),
  ];
  cohorts.sort((left, right) => TYPE_ORDER.get(left.type) - TYPE_ORDER.get(right.type)
    || memberIdsKey(left).localeCompare(memberIdsKey(right)));
  return deepFreeze(cohorts);
}

function memberIdsKey(cohort) {
  return cohort.memberRevisionRefs.map(({ fragmentId }) => fragmentId).join('\0');
}
