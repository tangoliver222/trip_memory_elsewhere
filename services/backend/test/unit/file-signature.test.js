import test from 'node:test';
import assert from 'node:assert/strict';
import { detectBinaryFormat } from '../../src/ingestion/file-signature.js';

const ascii = (value) => new TextEncoder().encode(value);
const box = (brand) => new Uint8Array([
  0, 0, 0, 24,
  ...ascii('ftyp'),
  ...ascii(brand),
  0, 0, 0, 0,
]);

test('detects only supported binary signatures', () => {
  const cases = [
    [new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), 'jpeg'],
    [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'png'],
    [new Uint8Array([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP')]), 'webp'],
    [ascii('%PDF-1.7'), 'pdf'],
    [box('heic'), 'heic'],
    [box('mif1'), 'heif'],
  ];

  for (const [bytes, expected] of cases) {
    assert.equal(detectBinaryFormat(bytes), expected);
  }
});

test('rejects random, truncated and unsupported container signatures', () => {
  for (const bytes of [
    new Uint8Array([1, 2, 3, 4, 5]),
    new Uint8Array([0x89, 0x50, 0x4e]),
    ascii('RIFF0000NOPE'),
    ascii('%PD'),
    box('avif'),
  ]) {
    assert.equal(detectBinaryFormat(bytes), null);
  }
});
