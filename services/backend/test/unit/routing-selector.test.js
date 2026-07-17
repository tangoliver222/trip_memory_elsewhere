import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveRepresentationForFragment,
  selectRoutingRepresentatives,
} from '../../src/routing/selector.js';
import { makeRoutableFragment } from '../fixtures/routing.js';

const fragmentRef = (id) => ({ type: 'fragment', id });
const revisionRef = (fragment) => ({
  fragmentId: fragment.id,
  generation: fragment.storage.generation,
  inputHash: fragment.hashes.sha256,
});
const feature = (overrides = {}) => ({
  mean: 0.5,
  variance: 0.1,
  entropyBits: 2,
  edgeEnergy: 0.2,
  exposure: 'normal',
  lowInformation: false,
  ...overrides,
});
const cohort = (type, fragments, id = `cohort_${type}`) => ({
  id,
  type,
  memberRevisionRefs: fragments.map(revisionRef).sort((a, b) => (
    a.fragmentId.localeCompare(b.fragmentId)
  )),
  basisCodes: ['test-basis'],
  warningCodes: [],
});

test('ranking follows thumbnail information exposure sharpness area and ID', () => {
  const fragments = [
    makeRoutableFragment({ id: 'frag_rank0001', thumbnailStatus: 'unsupported' }),
    makeRoutableFragment({ id: 'frag_rank0002' }),
    makeRoutableFragment({ id: 'frag_rank0003' }),
    makeRoutableFragment({ id: 'frag_rank0004' }),
  ];
  const features = {
    frag_rank0002: feature({ lowInformation: true, exposure: 'under' }),
    frag_rank0003: feature({ exposure: 'under', edgeEnergy: 0.9 }),
    frag_rank0004: feature({ edgeEnergy: 0.1 }),
  };

  const [selection] = selectRoutingRepresentatives({
    fragments,
    cohorts: [cohort('near_duplicate', fragments)],
    features,
  });

  assert.deepEqual(selection.representativeRefs, [fragmentRef('frag_rank0004')]);
});

test('higher edge energy then pixel area then fragment ID break ties', () => {
  const fragments = [
    makeRoutableFragment({ id: 'frag_tie00001', width: 100, height: 100 }),
    makeRoutableFragment({ id: 'frag_tie00002', width: 200, height: 200 }),
    makeRoutableFragment({ id: 'frag_tie00003', width: 300, height: 300 }),
    makeRoutableFragment({ id: 'frag_tie00004', width: 300, height: 300 }),
  ];
  const features = {
    frag_tie00001: feature({ edgeEnergy: 0.5 }),
    frag_tie00002: feature({ edgeEnergy: 0.6 }),
    frag_tie00003: feature({ edgeEnergy: 0.6 }),
    frag_tie00004: feature({ edgeEnergy: 0.6 }),
  };

  const [selection] = selectRoutingRepresentatives({
    fragments: [...fragments].reverse(),
    cohorts: [cohort('burst', fragments)],
    features,
  });

  assert.deepEqual(selection.representativeRefs, [fragmentRef('frag_tie00003')]);
});

test('near and burst select one for two to four and two for five or more', () => {
  for (const [type, count, expected] of [
    ['near_duplicate', 4, 1],
    ['near_duplicate', 5, 2],
    ['burst', 2, 1],
    ['burst', 6, 2],
  ]) {
    const fragments = Array.from({ length: count }, (_, index) => makeRoutableFragment({
      id: `frag_${type.slice(0, 4)}${String(index).padStart(5, '0')}`,
      inputHash: (index + 10).toString(16).padStart(64, '0'),
    }));
    const features = Object.fromEntries(fragments.map((fragment, index) => [
      fragment.id,
      feature({ edgeEnergy: index / 10 }),
    ]));

    const [selection] = selectRoutingRepresentatives({
      fragments,
      cohorts: [cohort(type, fragments)],
      features,
    });

    assert.equal(selection.representativeRefs.length, expected);
  }
});

test('exact canonical is the only representative regardless of visual rank', () => {
  const canonical = makeRoutableFragment({ id: 'frag_canon001' });
  const candidate = makeRoutableFragment({ id: 'frag_canon002' });
  const exact = {
    ...cohort('exact_duplicate', [canonical, candidate]),
    canonicalFragmentRef: fragmentRef(canonical.id),
  };

  const [selection] = selectRoutingRepresentatives({
    fragments: [canonical, candidate],
    cohorts: [exact],
    features: {
      [canonical.id]: feature({ lowInformation: true, exposure: 'under', edgeEnergy: 0 }),
      [candidate.id]: feature({ edgeEnergy: 1 }),
    },
  });

  assert.deepEqual(selection.representativeRefs, [fragmentRef(canonical.id)]);
});

test('same-time-place reduces photo semantics but preserves receipt OCR', () => {
  const photo = makeRoutableFragment({ id: 'frag_mixed001', type: 'photo' });
  const receipt = makeRoutableFragment({ id: 'frag_mixed002', type: 'receipt' });

  const [selection] = selectRoutingRepresentatives({
    fragments: [photo, receipt],
    cohorts: [cohort('same_time_place', [photo, receipt])],
    features: {
      [photo.id]: feature({ edgeEnergy: 0.8 }),
      [receipt.id]: feature({ edgeEnergy: 0.1 }),
    },
  });

  assert.deepEqual(selection.capabilityRepresentativeRefs.ocr, [
    fragmentRef(photo.id),
    fragmentRef(receipt.id),
  ]);
  assert.deepEqual(selection.capabilityRepresentativeRefs.embedding, [fragmentRef(photo.id)]);
  assert.deepEqual(selection.capabilityRepresentativeRefs.gemini, [fragmentRef(photo.id)]);
});

test('primary suppression priority is exact then near then burst while all cohorts remain', () => {
  const representative = makeRoutableFragment({ id: 'frag_primary01' });
  const alternate = makeRoutableFragment({ id: 'frag_primary02' });
  const supporting = makeRoutableFragment({ id: 'frag_primary03' });
  const cohorts = [
    {
      ...cohort('burst', [alternate, supporting], 'cohort_burst001'),
    },
    {
      ...cohort('exact_duplicate', [representative, supporting], 'cohort_exact001'),
      canonicalFragmentRef: fragmentRef(representative.id),
    },
  ];
  const selections = selectRoutingRepresentatives({
    fragments: [representative, alternate, supporting],
    cohorts,
    features: {
      [representative.id]: feature({ edgeEnergy: 0.1 }),
      [alternate.id]: feature({ edgeEnergy: 0.9 }),
      [supporting.id]: feature({ edgeEnergy: 0.8 }),
    },
  });

  const representation = deriveRepresentationForFragment({
    fragmentId: supporting.id,
    cohorts,
    selections,
  });

  assert.deepEqual(representation, {
    role: 'supporting',
    representativeRef: fragmentRef(representative.id),
    cohortRefs: [
      { type: 'routingCohort', id: 'cohort_burst001' },
      { type: 'routingCohort', id: 'cohort_exact001' },
    ],
    reasonCodes: ['exact-duplicate-supporting'],
  });
});

test('selector output is input-order invariant and never mutates inputs', () => {
  const fragments = [
    makeRoutableFragment({ id: 'frag_order001' }),
    makeRoutableFragment({ id: 'frag_order002' }),
  ];
  const cohorts = [cohort('near_duplicate', fragments)];
  const features = {
    frag_order001: feature({ edgeEnergy: 0.1 }),
    frag_order002: feature({ edgeEnergy: 0.2 }),
  };
  const snapshot = JSON.stringify({ fragments, cohorts, features });

  const forward = selectRoutingRepresentatives({ fragments, cohorts, features });
  const reverse = selectRoutingRepresentatives({
    fragments: [...fragments].reverse(),
    cohorts: [...cohorts].reverse(),
    features,
  });

  assert.equal(JSON.stringify(reverse), JSON.stringify(forward));
  assert.equal(JSON.stringify({ fragments, cohorts, features }), snapshot);
});
