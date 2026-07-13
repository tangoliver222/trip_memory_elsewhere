import test from 'node:test';
import assert from 'node:assert/strict';
import { renderRoute } from '../../src/pages/render-route.js';
import { getDiscoveryComposition } from '../../src/pages/discover.js';
import { createInitialState } from '../../src/store.js';

const state = createInitialState();

test('discovery detail emits evidence before its title', () => {
  const html = renderRoute('#/discover/disc-ari-mornings', state).html;
  assert.ok(html.indexOf('data-discovery-evidence') < html.indexOf('三个早晨都从 Ari 开始'));
  assert.ok(html.indexOf('12 OCT') < html.indexOf('Common Grounds'));
  assert.match(html, /关系正在成立/);
});

test('relation types map to visibly distinct discovery compositions', () => {
  assert.equal(getDiscoveryComposition('repeated_place'), 'repeat');
  assert.equal(getDiscoveryComposition('cross_media_visit'), 'cross-media');
  assert.equal(getDiscoveryComposition('open_thread'), 'unresolved');
  assert.equal(renderRoute('#/discover/disc-river-evidence', state).scenePayload.composition, 'cross-media');
});

test('Discover home leads with one featured relationship rather than a feed', () => {
  const html = renderRoute('#/discover', state).html;
  assert.equal((html.match(/class="discovery-feature/g) || []).length, 1);
  assert.match(html, /少量值得重新看的联系/);
  assert.doesNotMatch(html, /无限滚动|Dashboard/);
});
