import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRoutingCohorts,
} from '../../src/routing/cohorts.js';
import {
  makeExactDuplicateCandidate,
  makeNearDuplicateCandidate,
} from '../fixtures/processing.js';
import { makeRoutableFragment } from '../fixtures/routing.js';

const fragmentRef = (id) => ({ type: 'fragment', id });
const memberIds = (cohort) => cohort.memberRevisionRefs.map(({ fragmentId }) => fragmentId);

function nearCandidate(leftId, rightId, index = 0) {
  const pairIds = [leftId, rightId].sort();
  return makeNearDuplicateCandidate({
    id: `dup_near_${String(index).padStart(8, '0')}`,
    queryFragmentRef: fragmentRef(leftId),
    matchedFragmentRef: fragmentRef(rightId),
    pairRefs: pairIds.map(fragmentRef),
    pairKey: `pair_near_${String(index).padStart(8, '0')}`,
    distance: 1,
    rank: 1,
  });
}

function exactCandidate(canonicalId, candidateId, index = 0) {
  const pairIds = [canonicalId, candidateId].sort();
  return makeExactDuplicateCandidate({
    id: `dup_exact_${String(index).padStart(8, '0')}`,
    canonicalFragmentRef: fragmentRef(canonicalId),
    candidateFragmentRef: fragmentRef(candidateId),
    pairRefs: pairIds.map(fragmentRef),
  });
}

const build = (fragments, duplicateCandidates = []) => buildRoutingCohorts({
  fragments,
  duplicateCandidates,
  routerVersion: 'v1',
});

test('exact candidate produces one canonical SHA-256 cohort', () => {
  const inputHash = 'a'.repeat(64);
  const fragments = [
    makeRoutableFragment({
      id: 'frag_exact001', inputHash, sourceCreatedAt: null,
    }),
    makeRoutableFragment({
      id: 'frag_exact002', inputHash, sourceCreatedAt: null,
    }),
  ];

  const cohorts = build(fragments, [exactCandidate('frag_exact001', 'frag_exact002')]);

  assert.deepEqual(cohorts, [{
    type: 'exact_duplicate',
    memberRevisionRefs: [
      { fragmentId: 'frag_exact001', generation: '1740000000000001', inputHash },
      { fragmentId: 'frag_exact002', generation: '1740000000000001', inputHash },
    ],
    basisCodes: ['sha256-exact'],
    warningCodes: [],
  }]);
});

test('near grouping is input-order invariant and closes deterministic chains', () => {
  const fragments = ['frag_near0001', 'frag_near0002', 'frag_near0003'].map((id, index) => (
    makeRoutableFragment({
      id,
      inputHash: index.toString(16).padStart(64, '0'),
      sourceCreatedAt: null,
    })
  ));
  const candidates = [
    nearCandidate('frag_near0001', 'frag_near0002', 1),
    nearCandidate('frag_near0002', 'frag_near0003', 2),
  ];

  const forward = build(fragments, candidates);
  const reversed = build([...fragments].reverse(), [...candidates].reverse());

  assert.equal(JSON.stringify(reversed), JSON.stringify(forward));
  assert.equal(forward.length, 1);
  assert.equal(forward[0].type, 'near_duplicate');
  assert.deepEqual(memberIds(forward[0]), [
    'frag_near0001',
    'frag_near0002',
    'frag_near0003',
  ]);
  assert.deepEqual(forward[0].basisCodes, ['dhash-distance']);
});

test('a 201-member near chain is stably partitioned below the hard cap', () => {
  const fragments = Array.from({ length: 201 }, (_, index) => makeRoutableFragment({
    id: `frag_${String(index).padStart(8, '0')}`,
    inputHash: index.toString(16).padStart(64, '0'),
    sourceCreatedAt: null,
  }));
  const candidates = Array.from({ length: 200 }, (_, index) => nearCandidate(
    fragments[index].id,
    fragments[index + 1].id,
    index,
  ));

  const cohorts = build(fragments, candidates);
  const reverse = build([...fragments].reverse(), [...candidates].reverse());

  assert.equal(JSON.stringify(reverse), JSON.stringify(cohorts));
  assert.equal(cohorts.every((cohort) => cohort.type === 'near_duplicate'), true);
  assert.equal(cohorts.every((cohort) => cohort.memberRevisionRefs.length <= 200), true);
  assert.equal(cohorts.every((cohort) => (
    cohort.warningCodes.includes('routing/cohort-truncated')
  )), true);
  const flattened = cohorts.flatMap(memberIds).sort();
  assert.deepEqual(flattened, fragments.map(({ id }) => id).sort());
});

test('burst accepts inclusive adjacent and total span boundaries', () => {
  const start = Date.parse('2024-10-12T08:42:00.000Z');
  const fragments = Array.from({ length: 9 }, (_, index) => makeRoutableFragment({
    id: `frag_burst${String(index).padStart(4, '0')}`,
    inputHash: (index + 1).toString(16).padStart(64, '0'),
    capturedAt: new Date(start + Math.min(index * 2_000, 15_000)).toISOString(),
    sourceCreatedAt: null,
  }));

  const cohorts = build(fragments);
  const burst = cohorts.find(({ type }) => type === 'burst');

  assert.ok(burst);
  assert.deepEqual(memberIds(burst), fragments.map(({ id }) => id).sort());
  assert.deepEqual(burst.basisCodes, ['capture-time-window']);
});

test('burst rejects a 2001ms adjacent gap and a 15001ms total span', () => {
  const start = Date.parse('2024-10-12T08:42:00.000Z');
  const adjacentGap = [0, 2_001].map((offset, index) => makeRoutableFragment({
    id: `frag_gap0000${index}`,
    inputHash: (index + 20).toString(16).padStart(64, '0'),
    capturedAt: new Date(start + offset).toISOString(),
    sourceCreatedAt: null,
  }));
  const totalSpan = Array.from({ length: 9 }, (_, index) => makeRoutableFragment({
    id: `frag_span${String(index).padStart(4, '0')}`,
    inputHash: (index + 30).toString(16).padStart(64, '0'),
    capturedAt: new Date(start + Math.min(index * 2_000, 15_001)).toISOString(),
    sourceCreatedAt: null,
  }));

  assert.equal(build(adjacentGap).some(({ type }) => type === 'burst'), false);
  const spanCohorts = build(totalSpan).filter(({ type }) => type === 'burst');
  assert.equal(spanCohorts.some((cohort) => memberIds(cohort).includes('frag_span0008')), false);
});

test('same-time-place accepts 10 minutes 50 metre accuracy and 50 metre distance', () => {
  const deltaDegrees = (50 / 6_371_000) * (180 / Math.PI);
  const location = (lat) => ({
    lat,
    lng: 0,
    accuracyMeters: 50,
    source: 'camera_device',
  });
  const fragments = [
    makeRoutableFragment({
      id: 'frag_place001',
      inputHash: '1'.repeat(64),
      sourceCreatedAt: '2024-10-12T08:42:00.000Z',
      locationHint: location(0),
    }),
    makeRoutableFragment({
      id: 'frag_place002',
      inputHash: '2'.repeat(64),
      sourceCreatedAt: '2024-10-12T08:52:00.000Z',
      locationHint: location(deltaDegrees),
    }),
  ];

  const cohort = build(fragments).find(({ type }) => type === 'same_time_place');

  assert.ok(cohort);
  assert.deepEqual(memberIds(cohort), ['frag_place001', 'frag_place002']);
  assert.deepEqual(cohort.basisCodes, ['source-location-window']);
});

test('same-time-place requires source accuracy and never invents document sequence', () => {
  const geoFact = (id) => ({
    value: { lat: 13.7563, lng: 100.5018 },
    sourceType: 'gps',
    sourceRefs: [fragmentRef(id)],
    processor: {
      name: 'deterministic-media',
      version: 'v1',
      modelAlias: null,
      promptVersion: null,
    },
    confidence: 0.9,
    status: 'suggested',
    observedAt: '2026-07-16T00:00:00.000Z',
  });
  const fragments = ['frag_nogps001', 'frag_nogps002'].map((id, index) => (
    makeRoutableFragment({
      id,
      type: 'receipt',
      inputHash: (index + 40).toString(16).padStart(64, '0'),
      sourceCreatedAt: `2024-10-12T08:4${index}:00.000Z`,
      locationHint: null,
      facts: { geo: geoFact(id) },
    })
  ));

  const cohorts = build(fragments);

  assert.equal(cohorts.some(({ type }) => type === 'same_time_place'), false);
  assert.equal(cohorts.some(({ type }) => type === 'document_sequence'), false);
});

test('cohort builder rejects unsupported versions and malformed domain inputs', () => {
  assert.throws(() => buildRoutingCohorts({
    fragments: [],
    duplicateCandidates: [],
    routerVersion: 'v2',
  }), TypeError);
  assert.throws(() => buildRoutingCohorts({
    fragments: [{ id: 'not-a-fragment' }],
    duplicateCandidates: [],
    routerVersion: 'v1',
  }));
});
