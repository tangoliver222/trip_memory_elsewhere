import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeDHash,
  hammingDistance64,
  splitDHashBands,
} from '../../src/processing/dhash.js';

test('encodes equal and descending rows with fixed 64-bit vectors', () => {
  assert.equal(encodeDHash(new Uint8Array(72).fill(7)), '0000000000000000');

  const descendingRows = Uint8Array.from(
    { length: 72 },
    (_, index) => 9 - (index % 9),
  );
  assert.equal(encodeDHash(descendingRows), 'ffffffffffffffff');

  const firstComparisonEqual = descendingRows.slice();
  firstComparisonEqual[1] = firstComparisonEqual[0];
  assert.equal(encodeDHash(firstComparisonEqual), '7fffffffffffffff');
});

test('splits a canonical dHash into eight position-prefixed byte bands', () => {
  assert.deepEqual(splitDHashBands('0f1ea203917c40ee'), [
    '0:0f', '1:1e', '2:a2', '3:03', '4:91', '5:7c', '6:40', '7:ee',
  ]);
});

test('computes bounded 64-bit XOR Hamming distance', () => {
  assert.equal(hammingDistance64('0000000000000000', '000000000000003f'), 6);
  assert.equal(hammingDistance64('ffffffffffffffff', '0000000000000000'), 64);
  assert.equal(hammingDistance64('0f1ea203917c40ee', '0f1ea203917c40ee'), 0);
});

test('rejects non-canonical dHash inputs', () => {
  assert.throws(() => encodeDHash(new Uint8Array(71)), TypeError);
  assert.throws(() => encodeDHash(Array(72).fill(0)), TypeError);
  assert.throws(() => splitDHashBands('0F1EA203917C40EE'), TypeError);
  assert.throws(() => hammingDistance64('000000000000000', '0000000000000000'), TypeError);
});
