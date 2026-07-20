import test from 'node:test';
import assert from 'node:assert/strict';
import { compileParticleScene } from '../../src/visual/particle-scene-compiler.js';

const anchor = (id, x = 0, y = 0, weight = 1) => ({ id, x, y, z: -2, weight });

test('empty data compiles a sparse initializing seed without semantic anchors', () => {
  const scene = compileParticleScene('cityCluster', 300, {
    itemCount: 0,
    anchors: [],
  });

  assert.equal(scene.state, 'initializing');
  assert.equal(scene.anchorCount, 0);
  assert.ok(scene.activeCount > 0);
  assert.ok(scene.activeCount < 60);
  assert.equal(scene.positions.length, 900);
  assert.equal(scene.visibility.length, 300);
  assert.equal(scene.visibility.reduce((sum, value) => sum + Number(value > 0), 0), scene.activeCount);

  const productionPool = compileParticleScene('cityCluster', 10_000, { itemCount: 0, anchors: [] });
  assert.ok(productionPool.activeCount <= 96);
});

test('visible particle density increases monotonically with current item count', () => {
  const small = compileParticleScene('cityCluster', 300, {
    itemCount: 3,
    anchors: [anchor('ari')],
  });
  const current = compileParticleScene('cityCluster', 300, {
    itemCount: 36,
    anchors: [anchor('ari')],
  });
  const large = compileParticleScene('cityCluster', 300, {
    itemCount: 120,
    anchors: [anchor('ari')],
  });

  assert.ok(small.activeCount > 60);
  assert.ok(current.activeCount > small.activeCount);
  assert.ok(large.activeCount > current.activeCount);
  assert.notEqual(small.dataSignature, current.dataSignature);
  assert.notEqual(current.dataSignature, large.dataSignature);
});

test('scene signature and geometry follow current anchors rather than fixture identities', () => {
  const first = compileParticleScene('discovery', 300, {
    itemCount: 2,
    anchors: [anchor('source-a', -3, 1), anchor('source-b', 3, 1)],
    relations: [{ from: 'source-a', to: 'source-b', status: 'confirmed' }],
  });
  const moved = compileParticleScene('discovery', 300, {
    itemCount: 2,
    anchors: [anchor('source-a', -5, -2), anchor('source-b', 2, 4)],
    relations: [{ from: 'source-a', to: 'source-b', status: 'confirmed' }],
  });

  assert.equal(first.anchorCount, 2);
  assert.notEqual(first.dataSignature, moved.dataSignature);
  assert.notDeepEqual([...first.positions], [...moved.positions]);
});

test('same cluster ratios with different totals still produce different visible density', () => {
  const small = compileParticleScene('multiCityField', 300, {
    itemCount: 3,
    clusters: [{ slug: 'bangkok', weight: 3 }],
  });
  const large = compileParticleScene('multiCityField', 300, {
    itemCount: 90,
    clusters: [{ slug: 'bangkok', weight: 90 }],
  });

  assert.ok(large.activeCount > small.activeCount);
  assert.notEqual(large.dataSignature, small.dataSignature);
});

const averageX = (positions) => {
  let sum = 0;
  for (let index = 0; index < positions.length; index += 3) sum += positions[index];
  return sum / (positions.length / 3);
};

for (const mode of ['multiCityField', 'timeline', 'placeMap', 'else', 'lens']) {
  test(`${mode} geometry follows rendered DOM anchors`, () => {
    const left = compileParticleScene(mode, 300, {
      itemCount: 2,
      anchors: [anchor('a', -9, -2), anchor('b', -5, 3)],
    });
    const right = compileParticleScene(mode, 300, {
      itemCount: 2,
      anchors: [anchor('a', 5, -2), anchor('b', 9, 3)],
    });

    assert.ok(averageX(right.positions) - averageX(left.positions) > 6);
  });
}
