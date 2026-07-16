import test from 'node:test';
import assert from 'node:assert/strict';
import { selectNearDuplicates } from '../../src/processing/near-duplicates.js';

const ZERO_HASH = '0000000000000000';
const FAR_HASH = 'ffffffffffffffff';

function makeBandMatches() {
  const hashesById = new Map([
    ['frag_00000001', '0000000000000007'],
    ['frag_00000002', ZERO_HASH],
    ['frag_00000003', '0000000000000001'],
    ['frag_00000004', '0000000000000001'],
    ['frag_00000005', '0000000000000003'],
    ['frag_00000006', '000000000000000f'],
    ['frag_00000201', ZERO_HASH],
  ]);
  const unique = Array.from({ length: 205 }, (_, index) => {
    const fragmentId = `frag_${String(index + 1).padStart(8, '0')}`;
    return { fragmentId, perceptualHash: hashesById.get(fragmentId) ?? FAR_HASH };
  });
  const shuffled = [...unique.filter((_, index) => index % 2 === 1).reverse(),
    ...unique.filter((_, index) => index % 2 === 0).reverse()];

  return [
    ...shuffled,
    { fragmentId: 'frag_00000002', perceptualHash: ZERO_HASH },
    { fragmentId: 'frag_00000003', perceptualHash: '0000000000000001' },
    { fragmentId: 'frag_query000', perceptualHash: ZERO_HASH },
  ];
}

test('deduplicates and stable-scans before distance then ranks by distance and ID', () => {
  const bandMatches = makeBandMatches();
  const original = structuredClone(bandMatches);

  const result = selectNearDuplicates({
    queryFragmentId: 'frag_query000',
    queryHash: ZERO_HASH,
    bandMatches,
  });

  assert.deepEqual(result, {
    matches: [
      { fragmentId: 'frag_00000002', perceptualHash: ZERO_HASH, distance: 0, rank: 1 },
      { fragmentId: 'frag_00000003', perceptualHash: '0000000000000001', distance: 1, rank: 2 },
      { fragmentId: 'frag_00000004', perceptualHash: '0000000000000001', distance: 1, rank: 3 },
      { fragmentId: 'frag_00000005', perceptualHash: '0000000000000003', distance: 2, rank: 4 },
      { fragmentId: 'frag_00000001', perceptualHash: '0000000000000007', distance: 3, rank: 5 },
    ],
    truncated: true,
  });
  assert.equal(result.matches.some(({ fragmentId }) => fragmentId === 'frag_00000201'), false);
  assert.deepEqual(bandMatches, original);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.matches), true);
  assert.equal(result.matches.every(Object.isFrozen), true);
});

test('natural band-hit order cannot affect the deterministic result', () => {
  const bandMatches = makeBandMatches();
  const input = {
    queryFragmentId: 'frag_query000',
    queryHash: ZERO_HASH,
  };

  assert.deepEqual(
    selectNearDuplicates({ ...input, bandMatches }),
    selectNearDuplicates({ ...input, bandMatches: [...bandMatches].reverse() }),
  );
});

test('threshold scan and result limits are validated and applied', () => {
  const result = selectNearDuplicates({
    queryFragmentId: 'frag_query000',
    queryHash: ZERO_HASH,
    bandMatches: [
      { fragmentId: 'frag_00000001', perceptualHash: '0000000000000001' },
      { fragmentId: 'frag_00000002', perceptualHash: '0000000000000003' },
    ],
    scanLimit: 2,
    threshold: 1,
    limit: 1,
  });

  assert.deepEqual(result, {
    matches: [
      { fragmentId: 'frag_00000001', perceptualHash: '0000000000000001', distance: 1, rank: 1 },
    ],
    truncated: false,
  });
  assert.throws(() => selectNearDuplicates({
    queryFragmentId: 'frag_query000',
    queryHash: ZERO_HASH,
    bandMatches: [],
    scanLimit: 0,
  }), TypeError);
});
