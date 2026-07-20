import test from 'node:test';
import assert from 'node:assert/strict';
import { hydrateLiveCollections } from '../../src/data/live-hydrator.js';
import { createDevScenarioSnapshot } from '../../src/data/dev-scenarios.js';
import { renderRoute } from '../../src/pages/render-route.js';
import { createInitialState } from '../../src/store.js';

const routes = [
  '#/onboarding/first-import',
  '#/onboarding/processing',
  '#/onboarding/first-connection',
  '#/world/fragments',
  '#/world/inbox',
  '#/world/inbox/receipt/missing-batch',
  '#/discover',
  '#/discover/missing-discovery',
  '#/me',
  '#/me/storage',
  '#/me/export',
];

test('empty data renders every primary route without invented people, cities or totals', () => {
  hydrateLiveCollections(createDevScenarioSnapshot('empty'));
  const state = createInitialState({ runtime: { mode: 'live' } });
  const pages = routes.map((route) => ({ route, view: renderRoute(route, state) }));

  for (const { route, view } of pages) {
    assert.ok(view.html, `${route} renders HTML`);
    assert.doesNotMatch(view.html.replaceAll(/<[^>]*>/g, ' '), /172 个碎片|28 个原件|Bangkok|曼谷|Chao Phraya|Common Grounds/);
  }
  assert.match(pages.find(({ route }) => route === '#/discover').view.html, /还没有形成发现/);
  assert.match(pages.find(({ route }) => route === '#/world/inbox').view.html, /没有待判断项/);
  assert.match(pages.find(({ route }) => route === '#/me').view.html, /0 座城市 · 0 个碎片 · 0 个代表发现/);
  assert.match(pages.find(({ route }) => route === '#/me/storage').view.html, />0<\/span><small>索引碎片/);
});

test('dense data copy follows the current catalog instead of baseline fixture totals', () => {
  hydrateLiveCollections(createDevScenarioSnapshot('dense'));
  const state = createInitialState({ runtime: { mode: 'live' } });
  const me = renderRoute('#/me', state).html;
  const storage = renderRoute('#/me/storage', state).html;
  const discover = renderRoute('#/discover', state);

  assert.match(me, /4 座城市 · 72 个碎片 · 4 个代表发现/);
  assert.match(storage, />72<\/span><small>索引碎片/);
  assert.equal(discover.scenePayload.itemCount, 3);
  assert.match(discover.html, /Bangkok 的重复到访/);
});

test('unknown receipt and discovery ids never fall back to another object', () => {
  hydrateLiveCollections(createDevScenarioSnapshot('dense'));
  const state = createInitialState({ runtime: { mode: 'live' } });
  assert.doesNotMatch(renderRoute('#/world/inbox/receipt/missing-batch', state).html, /72 个原件已保存/);
  assert.doesNotMatch(renderRoute('#/discover/missing-discovery', state).html, /Bangkok 的重复到访/);
});
