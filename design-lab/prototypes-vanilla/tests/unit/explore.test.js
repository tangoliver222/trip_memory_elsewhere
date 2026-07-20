import test from 'node:test';
import assert from 'node:assert/strict';
import { renderRoute } from '../../src/pages/render-route.js';
import { getAuthorityLink } from '../../src/pages/explore.js';
import { createInitialState } from '../../src/store.js';

const state = createInitialState();

test('explore views use different scene targets and authority links', () => {
  assert.equal(renderRoute('#/world/city/bangkok/explore?view=time', state).scenePayload.target, 'timeline');
  assert.equal(renderRoute('#/world/city/bangkok/explore?view=place', state).scenePayload.target, 'map');
  assert.equal(renderRoute('#/world/city/bangkok/explore?view=connection', state).scenePayload.target, 'relations');
  assert.equal(getAuthorityLink('connection', 'rel-river-ticket-photo'), '#/world/connection/rel-river-ticket-photo');
});

test('connection detail states evidence and gaps without confidence percentages', () => {
  const html = renderRoute('#/world/connection/rel-river-1022-suggestion', state).html;
  assert.match(html, /仍缺少/);
  assert.match(html, /截图文字包含 ferry/);
  assert.doesNotMatch(html, /%|物理闭合|因果/);
});

test('scene and place details remain evidence-first authority pages', () => {
  const moment = renderRoute('#/world/scene/scene-river-evening', state).html;
  const place = renderRoute('#/world/place/place-common-grounds', state).html;
  assert.ok(moment.indexOf('17:42') < moment.indexOf('河岸候船'));
  assert.match(moment, /查看原件/);
  assert.match(place, /三次确认到访/);
  assert.match(place, /12 OCT|12—19 OCT/);
});

test('Capsule is a photography-book sequence led by originals and authored words', () => {
  const html = renderRoute('#/world/city/bangkok/capsule', state).html;
  assert.match(html, /CHAPTER 01/);
  assert.match(html, /等雨停的早晨/);
  assert.match(html, /离开 Bangkok 以后/);
  assert.doesNotMatch(html, /Dashboard|统计面板/);
});

test('Explore scopes scenes, places and connections to the selected city', () => {
  const bangkokTime = renderRoute('#/world/city/bangkok/explore?view=time', state);
  const bangkokPlace = renderRoute('#/world/city/bangkok/explore?view=place', state);
  const bangkokConnection = renderRoute('#/world/city/bangkok/explore?view=connection', state);
  for (const view of [bangkokTime, bangkokPlace, bangkokConnection]) {
    assert.ok(view.scenePayload.items.every(({ id }) => view.html.includes(`data-particle-id="${id}"`)));
  }

  const tokyo = renderRoute('#/world/city/tokyo/explore?view=time', state);
  assert.equal(tokyo.scenePayload.itemCount, 0);
  assert.deepEqual(tokyo.scenePayload.items, []);
  assert.match(tokyo.html, /Tokyo 还没有可探索的时间结构/);
  assert.doesNotMatch(tokyo.html, /Ari|Common Grounds|河岸候船/);
});

test('unknown city routes do not fall back to Bangkok evidence', () => {
  const explore = renderRoute('#/world/city/missing/explore?view=place', state);
  const capsule = renderRoute('#/world/city/missing/capsule', state);

  assert.match(explore.html, /还没有形成这座城市/);
  assert.match(capsule.html, /还没有形成这座城市/);
  assert.doesNotMatch(`${explore.html}${capsule.html}`, /Common Grounds|Chao Phraya|bangkok-photo/);
});

test('Capsule never borrows Bangkok originals for a city without representative evidence', () => {
  const tokyo = renderRoute('#/world/city/tokyo/capsule', state);

  assert.equal(tokyo.scenePayload.itemCount, 0);
  assert.match(tokyo.html, /Tokyo 的 Capsule 尚未形成/);
  assert.doesNotMatch(tokyo.html, /bangkok-photo|Common Grounds|离开 Bangkok/);
});

test('invalid authority ids render truthful unavailable states instead of fixture fallbacks', () => {
  const html = [
    renderRoute('#/world/scene/missing', state).html,
    renderRoute('#/world/place/missing', state).html,
    renderRoute('#/world/connection/missing', state).html,
  ].join('\n');

  assert.equal((html.match(/对象尚未形成/g) || []).length, 3);
  assert.doesNotMatch(html, /河岸候船|Common Grounds|船票和河岸照片/);
});
