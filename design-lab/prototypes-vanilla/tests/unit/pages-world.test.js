import test from 'node:test';
import assert from 'node:assert/strict';
import { renderRoute } from '../../src/pages/render-route.js';
import { createInitialState } from '../../src/store.js';
import { indexes } from '../../src/fixtures/indexes.js';

const paths = [
  '#/onboarding',
  '#/onboarding/permissions',
  '#/onboarding/first-import',
  '#/onboarding/processing',
  '#/onboarding/first-connection',
  '#/world',
  '#/world/cities',
  '#/world/city/bangkok',
];
const state = createInitialState();

for (const path of paths) {
  test(`${path} renders one main action and no internal id leaked as copy`, () => {
    const view = renderRoute(path, state);
    assert.equal((view.html.match(/data-primary-action/g) || []).length, 1);
    // 内部 id 只允许出现在 data-* 属性里（统一 Fragment Lens 入口），不允许成为可见文案
    const visibleText = view.html.replaceAll(/<[^>]*>/g, ' ');
    assert.doesNotMatch(visibleText, /frag-|rel-|scene-/);
    assert.match(view.html, /data-page-id=/);
  });
}

test('city home opens fragments through the unified Fragment Lens only', () => {
  const html = renderRoute('#/world/city/bangkok', state).html;
  const lensOpeners = html.match(/data-action="open-lens"/g) || [];
  assert.ok(lensOpeners.length >= 6, 'city clusters expose their originals through open-lens');
  assert.doesNotMatch(html, /data-action="open-original"/);
});

test('world and cities share the world scene and real coordinates', () => {
  assert.equal(renderRoute('#/world', state).sceneMode, 'world');
  assert.equal(renderRoute('#/world/cities', state).sceneMode, 'world');
  assert.deepEqual(indexes.citiesById['city-bangkok-2024-autumn'].coordinates, { lat: 13.7563, lng: 100.5018 });
});

test('city world exposes Capsule and Explore before supporting details', () => {
  const html = renderRoute('#/world/city/bangkok', state).html;
  assert.ok(html.indexOf('City Capsule') < html.indexOf('63 个碎片'));
  assert.ok(html.indexOf('三个视角探索') < html.indexOf('63 个碎片'));
  assert.match(html, /照片、小票、菜单与地图/);
});
