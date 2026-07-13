import test from 'node:test';
import assert from 'node:assert/strict';
import { MemorySceneManager } from '../../src/visual/scene-manager.js';
import { createFlowController } from '../../src/visual/flow-controller.js';

const createCanvas = () => ({
  clientWidth: 1280,
  clientHeight: 720,
  addEventListener() {},
  removeEventListener() {},
});

const createRendererFactory = () => {
  const calls = [];
  const factory = (...args) => {
    calls.push(args);
    return {
      setPixelRatio() {},
      setSize() {},
      setAnimationLoop() {},
      render() {},
      dispose() {},
    };
  };
  factory.calls = calls;
  return factory;
};

test('scene manager creates one renderer and changes mode without remounting', () => {
  const rendererFactory = createRendererFactory();
  const manager = new MemorySceneManager({ rendererFactory, profile: 'low' });
  const canvas = createCanvas();
  manager.mount(canvas);
  manager.setMode('world', {});
  manager.setMode('city', {});
  manager.mount(canvas);
  assert.equal(rendererFactory.calls.length, 1);
  assert.equal(manager.debug().rendererCount, 1);
  manager.dispose();
});

test('signature transitions reuse one particle pool and expose distinct target phases', () => {
  const rendererFactory = createRendererFactory();
  const manager = new MemorySceneManager({ rendererFactory, profile: 'low' });
  manager.mount(createCanvas());
  const pool = manager.debug().particlePoolId;
  manager.setMode('world-intro', { firstVisit: true });
  manager.setMode('city', { cityId: 'city-bangkok-2024-autumn', transition: 'globeToCity' });
  assert.equal(rendererFactory.calls.length, 1);
  assert.equal(manager.debug().particlePoolId, pool);
  assert.deepEqual(manager.debug().phases, ['deep-scatter', 'globe', 'city-burst', 'city-field']);
  manager.dispose();
});

test('one damped spatial controller enables rotation and zoom only in the world views', () => {
  const controls = { enabled: false, enableDamping: false, enablePan: true, update() {}, dispose() {} };
  const manager = new MemorySceneManager({
    rendererFactory: createRendererFactory(),
    controlsFactory: () => controls,
    profile: 'low',
  });
  const canvas = createCanvas();
  canvas.parentElement = {};
  manager.mount(canvas);
  manager.setMode('world', {});
  assert.equal(controls.enabled, true);
  assert.equal(controls.enableDamping, true);
  assert.equal(controls.enablePan, false);
  manager.setMode('fragment-field', {});
  assert.equal(controls.enabled, false);
  manager.dispose();
});

test('flow controller exposes every signature state and kills prior timelines', () => {
  const calls = [];
  const controller = createFlowController({
    timelineFactory: (options) => {
      calls.push(options?.id);
      return { to() { return this; }, fromTo() { return this; }, add() { return this; }, kill() { calls.push('kill'); } };
    },
  });
  controller.worldIntro({}, {});
  controller.globeToCity({}, {});
  controller.discoveryReveal({}, {});
  controller.lensExtract({}, {});
  controller.elseState({}, { state: 'conflict' });
  controller.killAll();
  assert.deepEqual(calls.filter((value) => value !== 'kill'), ['world-intro', 'globe-to-city', 'discovery-reveal', 'lens-extract', 'else-conflict']);
  assert.equal(calls.filter((value) => value === 'kill').length, 5);
});
