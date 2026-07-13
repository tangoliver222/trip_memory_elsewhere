import test from 'node:test';
import assert from 'node:assert/strict';
import { renderRoute } from '../../src/pages/render-route.js';
import { createInitialState } from '../../src/store.js';

const state = createInitialState();
const paths = ['#/me', '#/me/writing', '#/me/writing/writing-city-reflection', '#/me/privacy', '#/me/preferences', '#/me/storage', '#/me/export'];

for (const path of paths) {
  test(`${path} is a complete quiet tool surface`, () => {
    const view = renderRoute(path, state);
    assert.match(view.html, /data-page-id=/);
    assert.equal(view.sceneMode, 'quiet-tool');
    assert.doesNotMatch(view.html, /onclick=|onchange=|Dashboard|默认表单/);
    assert.equal((view.html.match(/data-primary-action/g) || []).length, 1);
  });
}

test('preferences show the same fact in three truthful tones', () => {
  const html = renderRoute('#/me/preferences', state).html;
  assert.match(html, /事实优先/);
  assert.match(html, /平衡/);
  assert.match(html, /叙事/);
  assert.match(html, /17:42/);
  assert.doesNotMatch(html, /难忘|治愈|浪漫/);
});

test('export page names delete impact before destructive confirmation', () => {
  const html = renderRoute('#/me/export', state).html;
  assert.ok(html.indexOf('将影响') < html.indexOf('确认删除'));
  assert.match(html, /场景|连接|发现|我的书写|City Capsule/);
});
