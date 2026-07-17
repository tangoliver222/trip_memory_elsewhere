import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveRoutingFeatures } from '../../src/routing/features.js';

const closeTo = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not close to ${expected}`);
};

test('uniform black and white produce exact low-information features', () => {
  assert.deepEqual(deriveRoutingFeatures({
    pixels: new Uint8Array(64).fill(0),
    width: 8,
    height: 8,
  }), {
    mean: 0,
    variance: 0,
    entropyBits: 0,
    edgeEnergy: 0,
    exposure: 'under',
    lowInformation: true,
  });
  assert.deepEqual(deriveRoutingFeatures({
    pixels: new Uint8Array(64).fill(255),
    width: 8,
    height: 8,
  }), {
    mean: 1,
    variance: 0,
    entropyBits: 0,
    edgeEnergy: 0,
    exposure: 'over',
    lowInformation: true,
  });
});

test('checkerboard and gradient statistics use normalized pixels and neighbor pairs', () => {
  const checkerboard = deriveRoutingFeatures({
    pixels: Uint8Array.from([0, 255, 255, 0]),
    width: 2,
    height: 2,
  });
  closeTo(checkerboard.mean, 0.5);
  closeTo(checkerboard.variance, 0.25);
  closeTo(checkerboard.entropyBits, 1);
  closeTo(checkerboard.edgeEnergy, 1);
  assert.equal(checkerboard.exposure, 'normal');
  assert.equal(checkerboard.lowInformation, false);

  const gradient = deriveRoutingFeatures({
    pixels: Uint8Array.from([0, 85, 170, 255]),
    width: 4,
    height: 1,
  });
  closeTo(gradient.mean, 0.5);
  closeTo(gradient.variance, 5 / 36);
  closeTo(gradient.entropyBits, 2);
  closeTo(gradient.edgeEnergy, 1 / 3);
  assert.equal(gradient.exposure, 'normal');
  assert.equal(gradient.lowInformation, false);
});

test('the inclusive mean threshold and one-pixel edge denominator are stable', () => {
  const boundary = deriveRoutingFeatures({
    pixels: Uint8Array.from([5, 5, 5, 5, 5, 5, 5, 5, 5, 6]),
    width: 10,
    height: 1,
  });
  closeTo(boundary.mean, 0.02);
  assert.ok(boundary.variance <= 0.0004);
  assert.ok(boundary.entropyBits <= 0.5);
  assert.equal(boundary.exposure, 'under');
  assert.equal(boundary.lowInformation, true);

  assert.deepEqual(deriveRoutingFeatures({
    pixels: Uint8Array.of(127),
    width: 1,
    height: 1,
  }), {
    mean: 127 / 255,
    variance: 0,
    entropyBits: 0,
    edgeEnergy: 0,
    exposure: 'normal',
    lowInformation: false,
  });
});

test('routing feature input is a complete positive Uint8 grayscale plane', () => {
  assert.throws(() => deriveRoutingFeatures({
    pixels: [0, 255],
    width: 2,
    height: 1,
  }), TypeError);
  assert.throws(() => deriveRoutingFeatures({
    pixels: Uint8Array.of(0),
    width: 0,
    height: 1,
  }), TypeError);
  assert.throws(() => deriveRoutingFeatures({
    pixels: Uint8Array.of(0),
    width: 1,
    height: 0,
  }), TypeError);
  assert.throws(() => deriveRoutingFeatures({
    pixels: Uint8Array.of(0),
    width: 2,
    height: 1,
  }), TypeError);
  assert.throws(() => deriveRoutingFeatures({
    pixels: [-1, 256],
    width: 2,
    height: 1,
  }), TypeError);
});
