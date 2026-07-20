import test from 'node:test';
import assert from 'node:assert/strict';
import { MemorySceneManager } from '../../src/visual/scene-manager.js';
import { layoutCityPinLabels } from '../../src/visual/scene-manager.js';
import { createFlowController } from '../../src/visual/flow-controller.js';
import { createSemanticTarget } from '../../src/visual/particle-targets.js';
import { createSpatialAnchorRegistry } from '../../src/visual/spatial-anchor-registry.js';

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

test('starting a new spatial flow kills every previously tracked flow', () => {
  const states = [];
  const controller = createFlowController({
    timelineFactory: ({ id }) => {
      const state = { id, killed: false };
      states.push(state);
      return { to() { return this; }, fromTo() { return this; }, add() { return this; }, kill() { state.killed = true; }, isActive() { return !state.killed; } };
    },
  });
  controller.worldIntro({}, {});
  controller.discoveryReveal({}, {});
  assert.equal(states[0].killed, true);
  assert.deepEqual(controller.debug(), { tracked: 1, active: 1 });
});

test('fixture fragment field retains the frozen multi-city depth layout', () => {
  const target = createSemanticTarget('fragment-field', 1_200);
  const mainEnd = Math.floor(1_200 * 0.82);
  const depths = [];
  for (let index = 0; index < mainEnd; index += 1) depths.push(target[index * 3 + 2]);
  assert.ok(Math.min(...depths) < -32, 'fixture field must retain distant Tokyo and Chiang Mai clusters');
  assert.ok(Math.max(...depths) > -12, 'fixture field must retain a near Bangkok cluster');
});

const createEventTarget = () => {
  const listeners = new Map();
  return {
    scrollTop: 0,
    scrollLeft: 0,
    addEventListener(name, handler) { listeners.set(name, handler); },
    removeEventListener(name) { listeners.delete(name); },
    emit(name) { listeners.get(name)?.(); },
  };
};

test('uniform DOM scroll translates particle space in the same frame without recompiling layout', () => {
  const transforms = [];
  const layouts = [];
  const scrollRoot = createEventTarget();
  let scrollTop = 0;
  const anchors = [
    { dataset: { particleId: 'a' }, getBoundingClientRect: () => ({ left: 20, top: 120 - scrollTop, width: 80, height: 60 }) },
    { dataset: { particleId: 'b' }, getBoundingClientRect: () => ({ left: 150, top: 360 - scrollTop, width: 90, height: 70 }) },
  ];
  const registry = createSpatialAnchorRegistry({
    environment: { requestAnimationFrame: (callback) => { callback(); return 1; }, cancelAnimationFrame() {} },
    onTransform: (value) => transforms.push(value),
    onLayout: (value) => layouts.push(value),
  });
  const stop = registry.bind({ elements: anchors, scrollRoot });

  scrollTop = 120;
  scrollRoot.scrollTop = 120;
  scrollRoot.emit('scroll');

  assert.equal(layouts.length, 1);
  assert.deepEqual(transforms.at(-1), { pixelX: 0, pixelY: -120, scale: 1, source: 'scroll' });
  stop();
});

test('non-uniform anchor movement recompiles layout exactly once', () => {
  const layouts = [];
  let secondLeft = 150;
  const anchors = [
    { dataset: { particleId: 'a' }, getBoundingClientRect: () => ({ left: 20, top: 120, width: 80, height: 60 }) },
    { dataset: { particleId: 'b' }, getBoundingClientRect: () => ({ left: secondLeft, top: 360, width: 90, height: 70 }) },
  ];
  const registry = createSpatialAnchorRegistry({
    environment: { requestAnimationFrame: (callback) => { callback(); return 1; }, cancelAnimationFrame() {} },
    onTransform() {},
    onLayout: (value) => layouts.push(value),
  });
  registry.bind({ elements: anchors, scrollRoot: createEventTarget() });

  secondLeft = 205;
  registry.flush('layout');

  assert.equal(layouts.length, 2);
  assert.equal(layouts.at(-1).anchors[1].viewportX, 250);
});

test('scene manager scroll binding moves the group without replaying a morph', () => {
  const morphCalls = [];
  const canvas = createCanvas();
  canvas.clientWidth = 390;
  canvas.clientHeight = 844;
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 390, height: 844 });
  const scrollRoot = createEventTarget();
  let scrollTop = 0;
  const anchorElement = {
    dataset: { particleId: 'cluster-a', particleWeight: '1' },
    getBoundingClientRect: () => ({ left: 80, top: 260 - scrollTop, width: 160, height: 120 }),
  };
  const manager = new MemorySceneManager({
    rendererFactory: createRendererFactory(),
    profile: 'low',
    flowController: {
      morph(...args) { morphCalls.push(args); },
      killAll() {},
      debug() { return { tracked: 0, active: 0 }; },
    },
    environment: {
      innerWidth: 390,
      innerHeight: 844,
      requestAnimationFrame(callback) { callback(); return 1; },
      cancelAnimationFrame() {},
    },
  });
  manager.mount(canvas);
  const stop = manager.bindPageSpace({
    elements: [anchorElement],
    scrollRoot,
    mode: 'cityCluster',
    payload: { itemCount: 1 },
  });
  const initialY = manager.group.position.y;

  scrollTop = 100;
  scrollRoot.scrollTop = 100;
  scrollRoot.emit('scroll');

  assert.notEqual(manager.group.position.y, initialY);
  assert.equal(morphCalls.length, 0);
  assert.equal(manager.debug().spatialTransform.pixelY, -100);
  stop();
  manager.dispose();
});

test('page scroll and field camera transforms compose instead of overwriting each other', () => {
  const canvas = createCanvas();
  canvas.clientWidth = 390;
  canvas.clientHeight = 844;
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 390, height: 844 });
  const scrollRoot = createEventTarget();
  let scrollTop = 0;
  const anchorElement = {
    dataset: { particleId: 'fragment-a', particleWeight: '1' },
    getBoundingClientRect: () => ({ left: 80, top: 260 - scrollTop, width: 160, height: 120 }),
  };
  const manager = new MemorySceneManager({
    rendererFactory: createRendererFactory(),
    profile: 'low',
    environment: {
      innerWidth: 390,
      innerHeight: 844,
      requestAnimationFrame(callback) { callback(); return 1; },
      cancelAnimationFrame() {},
    },
  });
  manager.mount(canvas);
  manager.bindPageSpace({ elements: [anchorElement], scrollRoot, mode: 'field', payload: { itemCount: 1 } });

  scrollTop = 80;
  scrollRoot.scrollTop = 80;
  scrollRoot.emit('scroll');
  manager.setSpatialTransform({ pixelX: 30, pixelY: 12, scale: 1.4, source: 'field-camera' });

  assert.deepEqual(manager.debug().spatialTransform, {
    pixelX: 30,
    pixelY: -68,
    scale: 1.4,
    source: 'composed',
  });
  manager.dispose();
});

test('projected city labels avoid collisions without city-name CSS exceptions', () => {
  const placements = layoutCityPinLabels([
    { id: 'tokyo', x: 302, y: 310, visible: true },
    { id: 'kyoto', x: 306, y: 315, visible: true },
    { id: 'osaka', x: 298, y: 321, visible: true },
  ], 390);
  const visible = placements.filter(({ labelVisible }) => labelVisible);

  assert.equal(visible.length, 3);
  for (let leftIndex = 0; leftIndex < visible.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < visible.length; rightIndex += 1) {
      const left = visible[leftIndex].rect;
      const right = visible[rightIndex].rect;
      const overlaps = left.left < right.right && left.right > right.left
        && left.top < right.bottom && left.bottom > right.top;
      assert.equal(overlaps, false);
    }
  }
});
