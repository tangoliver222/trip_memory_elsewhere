import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnchorRegistry } from '../../src/visual/anchor-registry.js';

const element = ({ id, kind = 'fragment', left, top, width, height, depth = -8 }) => ({
  dataset: {
    particleAnchor: id,
    particleKind: kind,
    particleDepth: String(depth),
    ...(kind === 'fragment' ? { fragmentId: id } : {}),
  },
  getBoundingClientRect: () => ({ left, top, width, height, right: left + width, bottom: top + height }),
});

test('anchor registry converts DOM centers into NDC and projected world coordinates', () => {
  const nodes = [
    element({ id: 'frag-a', left: 39, top: 84, width: 78, height: 168, depth: -12 }),
    element({ id: 'place-b', kind: 'place', left: 273, top: 506, width: 78, height: 84, depth: -24 }),
  ];
  const root = { querySelectorAll: () => nodes };
  const registry = createAnchorRegistry({
    projector: ({ ndc, depth }) => ({ x: ndc.x * 10, y: ndc.y * 10, z: depth }),
  });

  const anchors = registry.measure(root, null, { width: 390, height: 844, left: 0, top: 0 });

  assert.equal(anchors.size, 2);
  assert.deepEqual(anchors.get('frag-a').ndc, { x: -0.6, y: 0.6018957345971564 });
  assert.deepEqual(anchors.get('frag-a').world, { x: -6, y: 6.018957345971564, z: -12 });
  assert.equal(anchors.get('place-b').kind, 'place');
});

test('remeasuring replaces stale coordinates instead of accumulating anchors', () => {
  let left = 20;
  const node = {
    dataset: { particleAnchor: 'frag-a', fragmentId: 'frag-a' },
    getBoundingClientRect: () => ({ left, top: 20, width: 40, height: 40, right: left + 40, bottom: 60 }),
  };
  const root = { querySelectorAll: () => [node] };
  const registry = createAnchorRegistry({ projector: ({ ndc, depth }) => ({ ...ndc, z: depth }) });
  const first = registry.measure(root, null, { width: 200, height: 200, left: 0, top: 0 });
  left = 120;
  const second = registry.measure(root, null, { width: 200, height: 200, left: 0, top: 0 });

  assert.equal(first.get('frag-a').ndc.x, -0.6);
  assert.ok(Math.abs(second.get('frag-a').ndc.x - 0.4) < Number.EPSILON);
  assert.equal(second.size, 1);
});
