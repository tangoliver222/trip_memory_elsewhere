import test from 'node:test';
import assert from 'node:assert/strict';
import { renderRoute } from '../../src/pages/render-route.js';
import { createInitialState } from '../../src/store.js';

const particleRoutes = [
  '#/world',
  '#/world/city/bangkok',
  '#/world/fragments',
  '#/discover',
  '#/discover/disc-ari-mornings',
  '#/world/city/bangkok/explore?view=time',
  '#/world/city/bangkok/explore?view=place',
  '#/world/city/bangkok/explore?view=connection',
  '#/world/cities',
  '#/world/inbox/receipt/batch-bangkok-backfill',
  '#/world/inbox',
  '#/world/city/bangkok/capsule',
  '#/world/scene/scene-river-evening',
  '#/world/place/place-common-grounds',
  '#/world/connection/rel-river-ticket-photo',
  '#/onboarding/first-connection',
];

for (const route of particleRoutes) {
  test(`${route} exposes current data and semantic particle anchors`, () => {
    const view = renderRoute(route, createInitialState({ route }));
    assert.equal(typeof view.scenePayload.itemCount, 'number');
    assert.ok(Array.isArray(view.scenePayload.items));
    assert.match(view.html, /data-particle-anchor/);
    assert.match(view.html, /data-particle-id=/);
  });
}

test('city route anchors every visible representative while total count drives particle density', () => {
  const route = '#/world/city/bangkok';
  const view = renderRoute(route, createInitialState({ route }));
  assert.equal(view.scenePayload.items.length, 9);
  assert.equal(view.scenePayload.itemCount, 63);
  assert.ok(view.scenePayload.items.every(({ id }) => view.html.includes(`data-particle-id="${id}"`)));
});

test('fragment field nodes expose the same ids supplied to its particle scene', () => {
  const route = '#/world/fragments';
  const view = renderRoute(route, createInitialState({ route }));
  assert.equal(view.scenePayload.items.length, view.scenePayload.itemCount);
  assert.ok(view.scenePayload.items.every(({ id }) => view.html.includes(`data-particle-id="${id}"`)));
});
