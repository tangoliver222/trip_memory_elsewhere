import test from 'node:test';
import assert from 'node:assert/strict';
import { getSceneDefinition } from '../../src/visual/scene-definitions.js';
import {
  createGlobeTargets,
  createMultiCityFieldTargets,
  createSemanticTarget,
} from '../../src/visual/particle-targets.js';

test('core routes use distinct semantic target generators', () => {
  const modes = ['world', 'city', 'fragment-field', 'timeline', 'map', 'relations', 'discovery', 'else', 'import'];
  const definitions = modes.map((mode) => getSceneDefinition(mode, { particleCount: 9800 }));
  assert.equal(new Set(definitions.map((definition) => definition.generator)).size, modes.length);
  definitions.forEach((definition) => {
    assert.ok(definition.activeCount > 0);
    assert.ok(definition.camera);
    assert.ok(definition.palette);
    assert.ok(definition.reducedMotion);
  });
});

test('tool routes fully disable the particle pool', () => {
  const definition = getSceneDefinition('quiet-tool', { particleCount: 9800 });
  assert.equal(definition.activeCount, 0);
  assert.equal(definition.generator, 'empty');
  assert.equal(definition.interaction, 'none');
});

test('globe targets are stable and concentrate visible points on land', () => {
  const first = createGlobeTargets(1200);
  const second = createGlobeTargets(1200);
  assert.deepEqual([...first.positions.slice(0, 90)], [...second.positions.slice(0, 90)]);
  assert.ok(first.metadata.landPoints > first.metadata.oceanPoints * 4);
  assert.ok(first.metadata.landPointRatio > 0.8);
  assert.equal(first.visibility.length, 1200);
  assert.equal(first.groups.length, 1200);
});

test('multi-city field exposes three separated depth bands', () => {
  const target = createMultiCityFieldTargets(900);
  assert.deepEqual(target.metadata.depthBands.length, 3);
  const [near, mid, deep] = target.metadata.depthBands;
  assert.ok(near > mid && mid > deep);
  assert.equal(new Set(target.groups).size, 3);
});

test('semantic targets share one bundle contract', () => {
  for (const mode of ['world', 'city', 'fragment-field', 'timeline', 'map', 'relations', 'discovery', 'else', 'import', 'quiet-tool']) {
    const target = createSemanticTarget(mode, 240, {});
    assert.equal(target.positions.length, 720, mode);
    assert.equal(target.visibility.length, 240, mode);
    assert.equal(target.groups.length, 240, mode);
  }
});
