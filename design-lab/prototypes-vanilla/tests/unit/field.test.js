import test from 'node:test';
import assert from 'node:assert/strict';
import { createFieldController, createFieldLayout } from '../../src/controllers/field-controller.js';
import { createInitialState, createStore } from '../../src/store.js';

const viewport = {
  addEventListener() {},
  removeEventListener() {},
  querySelectorAll() { return []; },
  setPointerCapture() {},
};

test('Common Grounds search focuses relevant nodes and preserves reset state', () => {
  const initialCamera = { x: 24, y: -18, scale: 1.45, depth: 0.6 };
  const store = createStore(createInitialState({ field: { camera: initialCamera } }));
  const field = createFieldController({ viewport, store, sceneManager: { setMode() {} } });
  field.search('Common Grounds');
  assert.deepEqual(field.state.focusedIds, ['frag-ari-1012-photo', 'frag-ari-1016-receipt', 'frag-ari-1016-photo', 'frag-ari-1019-visit']);
  assert.ok(field.state.layout.every((node) => !field.state.focusedIds.includes(node.id) || Math.abs(node.x) < 180));
  field.search('');
  assert.deepEqual(field.state.camera, initialCamera);
  field.destroy();
});

test('field zoom clamps between 0.62 and 2.4 and snapshot is restorable', () => {
  const store = createStore(createInitialState());
  const field = createFieldController({ viewport, store, sceneManager: { setMode() {} } });
  field.zoomAt(100, 100, 20);
  assert.equal(field.state.camera.scale, 2.4);
  const snapshot = field.snapshot();
  field.zoomAt(100, 100, -20);
  assert.equal(field.state.camera.scale, 0.62);
  field.restore(snapshot);
  assert.deepEqual(field.state.camera, snapshot.camera);
  field.destroy();
});

test('field camera publishes the exact DOM transform to particle space', () => {
  const transforms = [];
  const store = createStore(createInitialState());
  const field = createFieldController({
    viewport,
    store,
    sceneManager: {
      setMode() {},
      setSpatialTransform(value) { transforms.push(value); },
    },
  });

  field.panBy(32, -18, { publish: false });
  assert.deepEqual(transforms.at(-1), {
    pixelX: 32,
    pixelY: -18,
    scale: 1,
    source: 'field-camera',
  });

  field.zoomAt(100, 80, 1, { publish: false });
  assert.equal(transforms.at(-1).source, 'field-camera');
  assert.equal(transforms.at(-1).scale, field.state.camera.scale);
  field.destroy();
});

test('compact field layout keeps a useful ring of originals inside a phone-scale spatial radius', () => {
  const layout = createFieldLayout('', { compact: true });
  assert.ok(layout.every((node) => Math.abs(node.x) <= 132));
  assert.ok(layout.every((node) => Math.abs(node.y) <= 150));
  assert.ok(new Set(layout.map((node) => node.z)).size > 2);
});
