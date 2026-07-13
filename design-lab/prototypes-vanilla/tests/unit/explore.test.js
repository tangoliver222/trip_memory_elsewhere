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
