import test from 'node:test';
import assert from 'node:assert/strict';
import { createVisualReadyController } from '../../src/visual/visual-ready.js';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

function createHarness() {
  const fontGate = deferred();
  const imageGate = deferred();
  const windowObject = {};
  const documentObject = {
    fonts: { ready: fontGate.promise },
    documentElement: { dataset: {} },
  };
  const root = {
    querySelectorAll(selector) {
      assert.equal(selector, 'img');
      return [{ complete: false, decode: () => imageGate.promise }];
    },
  };
  return { fontGate, imageGate, windowObject, documentObject, root };
}

test('begin marks both visual ready signals false', () => {
  const harness = createHarness();
  const controller = createVisualReadyController({
    window: harness.windowObject,
    document: harness.documentObject,
  });

  const token = controller.begin('#/world');

  assert.equal(harness.windowObject.__ELSEWHERE_VISUAL_READY__, false);
  assert.equal(harness.documentObject.documentElement.dataset.visualReady, 'false');
  assert.equal(controller.debug().routeKey, '#/world');
  assert.equal(token, 1);
});

test('settle waits for fonts, images and scene completion', async () => {
  const harness = createHarness();
  const controller = createVisualReadyController({
    window: harness.windowObject,
    document: harness.documentObject,
  });
  const sceneGate = deferred();
  const token = controller.begin('#/world');
  const result = controller.settle({ token, root: harness.root, scenePromise: sceneGate.promise });

  await Promise.resolve();
  assert.equal(harness.windowObject.__ELSEWHERE_VISUAL_READY__, false);
  harness.fontGate.resolve();
  harness.imageGate.resolve();
  await Promise.resolve();
  assert.equal(harness.windowObject.__ELSEWHERE_VISUAL_READY__, false);
  sceneGate.resolve();
  assert.equal(await result, true);
  assert.equal(harness.windowObject.__ELSEWHERE_VISUAL_READY__, true);
  assert.equal(harness.documentObject.documentElement.dataset.visualReady, 'true');
});

test('a stale route token cannot publish visual readiness', async () => {
  const harness = createHarness();
  const controller = createVisualReadyController({
    window: harness.windowObject,
    document: harness.documentObject,
  });
  const firstScene = deferred();
  const first = controller.begin('#/world');
  const staleResult = controller.settle({ token: first, root: harness.root, scenePromise: firstScene.promise });
  const second = controller.begin('#/world/fragments');
  harness.fontGate.resolve();
  harness.imageGate.resolve();
  firstScene.resolve();

  assert.equal(await staleResult, false);
  assert.equal(harness.windowObject.__ELSEWHERE_VISUAL_READY__, false);
  assert.equal(controller.debug().token, second);
});
