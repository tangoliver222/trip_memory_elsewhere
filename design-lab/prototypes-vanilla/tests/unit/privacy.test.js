import test from 'node:test';
import assert from 'node:assert/strict';
import { getDeleteImpact, getShareModel } from '../../src/privacy/models.js';

test('share defaults hide all sensitive fields', () => {
  assert.deepEqual(getShareModel('journey-bangkok-2024-autumn').privacy, {
    hideAmount: true,
    hidePreciseAddress: true,
    hidePrivateNotes: true,
  });
});

test('deleting a city lists every affected authority object before confirmation', () => {
  const impact = getDeleteImpact('journey-bangkok-2024-autumn');
  assert.ok(impact.scenes.length);
  assert.ok(impact.connections.length);
  assert.ok(impact.discoveries.length);
  assert.ok(impact.userNotes.length);
  assert.equal(impact.capsule.included, true);
});

test('share model never exposes hidden amount, precise address or private notes', () => {
  const model = getShareModel('journey-bangkok-2024-autumn');
  const serialized = JSON.stringify(model.visibleContent);
  assert.doesNotMatch(serialized, /124\.00|13\.7791|等雨停的早晨/);
});
