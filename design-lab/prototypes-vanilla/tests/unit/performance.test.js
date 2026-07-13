import test from 'node:test';
import assert from 'node:assert/strict';
import { getPerformanceProfile } from '../../src/visual/performance-profile.js';

test('profiles enforce particle and DPR ceilings', () => {
  assert.deepEqual(getPerformanceProfile('low'), { particleCount: 3000, maxDpr: 1, antialias: false, fps: 30 });
  assert.ok(getPerformanceProfile('balanced').particleCount <= 10000);
  assert.ok(getPerformanceProfile('high').particleCount <= 10000);
  assert.ok(getPerformanceProfile('high').maxDpr <= 1.5);
});

test('reduced motion always uses the low bounded profile', () => {
  assert.equal(getPerformanceProfile('high', { reducedMotion: true }).particleCount, 3000);
  assert.equal(getPerformanceProfile('balanced', { reducedMotion: true }).fps, 30);
});
