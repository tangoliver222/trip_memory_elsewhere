import test from 'node:test';
import assert from 'node:assert/strict';
import { ROUTES } from '../../src/page-manifest.js';
import { compileRoute, matchRoute } from '../../src/router.js';
import { renderRoute } from '../../src/pages/render-route.js';
import { createInitialState } from '../../src/store.js';

test('dynamic route captures id without generating an invalid regex', () => {
  const route = compileRoute('#/world/city/:id', 'world-city-home');
  assert.deepEqual(route.regex.exec('#/world/city/bangkok')?.slice(1), ['bangkok']);
});

test('every manifest route matches its page id and contract', () => {
  assert.equal(ROUTES.length, 26);
  for (const route of ROUTES.filter((item) => item.samplePath)) {
    const match = matchRoute(route.samplePath);
    assert.equal(match.pageId, route.pageId, route.samplePath);
    assert.equal(match.contract.pageId, route.pageId, route.samplePath);
  }
});

test('object sample routes resolve a real fixture object instead of an unavailable shell', () => {
  const objectPages = new Set([
    'world-city-home', 'world-receipt', 'world-capsule', 'world-scene-detail',
    'world-place-detail', 'world-connection-detail', 'discover-detail', 'me-writing-detail',
  ]);
  for (const route of ROUTES.filter(({ pageId, samplePath }) => samplePath && objectPages.has(pageId))) {
    const view = renderRoute(route.samplePath, createInitialState({ route: route.samplePath }));
    assert.doesNotMatch(view.html, /authority-page--empty/, route.samplePath);
  }
});

test('query parameters are decoded without changing the matched path', () => {
  const match = matchRoute('#/world/city/bangkok/explore?view=connection&label=Common%20Grounds');
  assert.equal(match.path, '#/world/city/bangkok/explore');
  assert.deepEqual(match.params, { id: 'bangkok' });
  assert.deepEqual(match.query, { view: 'connection', label: 'Common Grounds' });
});

test('unknown routes return a human-readable not-found contract', () => {
  const match = matchRoute('#/world/unknown/deep-link');
  assert.equal(match.pageId, 'not-found');
  assert.equal(match.contract.fallbackPath, '#/world');
});
