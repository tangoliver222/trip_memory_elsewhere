import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderWorldHome, renderCityHome } from '../../src/pages/world.js';
import { renderFragmentField, renderInboxPage } from '../../src/pages/fragments.js';
import { renderDiscoveryDetail } from '../../src/pages/discover.js';
import { renderRoute } from '../../src/pages/render-route.js';
import { ROUTES } from '../../src/page-manifest.js';
import { renderFragmentLens } from '../../src/overlays/fragment-lens.js';
import { renderElseSheet } from '../../src/overlays/else-sheet.js';
import { renderElseOrb } from '../../src/components/app-shell.js';
import { getFragmentContext } from '../../src/selectors.js';
import { getSceneDefinition } from '../../src/visual/scene-definitions.js';
import { createInitialState } from '../../src/store.js';

const state = createInitialState({ route: '#/world' });
const count = (html, token) => html.split(token).length - 1;

test('the visual grammar contains no legacy gold palette or title blur', () => {
  const files = ['tokens.css', 'shell.css', 'pages.css', 'components.css'];
  const css = files.map((name) => readFileSync(new URL(`../../src/styles/${name}`, import.meta.url), 'utf8')).join('\n');
  assert.doesNotMatch(css, /#d8b16c|#f2cc83|rgba\(216\s*,\s*177\s*,\s*108|rgba\(242\s*,\s*204\s*,\s*131/i);
  assert.doesNotMatch(css, /\.world-title[^}]*filter\s*:\s*blur|\.discovery-title-reveal[^}]*filter\s*:\s*blur/is);
});

test('World is an S-grade spatial home with city anchors and four product entrances', () => {
  const html = renderWorldHome(state).html;
  assert.match(html, /data-visual-grade="S"/);
  assert.equal(count(html, 'data-world-entry'), 4);
  assert.equal(count(html, 'data-particle-kind="place"'), 3);
  ['#/world/city/bangkok', '#/world/import', '#/world/inbox', '#/world/fragments'].forEach((route) => assert.match(html, new RegExp(route)));
});

test('City World binds real originals and semantic clusters into the shared scene', () => {
  const html = renderCityHome('bangkok', state).html;
  assert.match(html, /data-visual-grade="S"/);
  assert.ok(count(html, 'data-particle-anchor') >= 4);
  assert.match(html, /data-particle-kind="fragment"/);
  assert.doesNotMatch(html, />照片原件</);
});

test('Fragment Field exposes real nodes across explicit near, mid and deep city groups', () => {
  const html = renderFragmentField(state).html;
  assert.match(html, /data-visual-grade="S"/);
  assert.equal(count(html, 'data-field-node'), count(html, 'data-particle-kind="fragment"'));
  assert.equal(count(html, 'data-city-depth-group'), 3);
  assert.doesNotMatch(html, /PENDING|占位卡/);
});

test('Discovery grows from anchored evidence into one anchored entity before revealing its title', () => {
  const html = renderDiscoveryDetail('disc-ari-mornings', state).html;
  assert.match(html, /data-visual-grade="S"/);
  assert.ok(count(html, 'data-particle-kind="fragment"') >= 3);
  assert.equal(count(html, 'data-particle-kind="entity"'), 1);
  assert.ok(html.indexOf('data-discovery-evidence') < html.indexOf('discovery-title-reveal'));
});

test('Inbox keeps both source records, evidence and all three decisions in one stable surface', () => {
  const html = renderInboxPage(state).html;
  assert.match(html, /data-visual-grade="S"/);
  assert.equal(count(html, 'data-particle-kind="fragment"'), 2);
  assert.ok(count(html, 'data-review-evidence') >= 3);
  assert.equal(count(html, 'data-review-choice'), 3);
});

test('every declared route carries its visual intensity contract into the rendered surface', () => {
  ROUTES.forEach((route) => {
    const view = renderRoute(route.samplePath, state);
    assert.match(view.html, new RegExp(`data-visual-grade="${route.intensity}"`), route.pageId);
  });
});

test('time, place and connection views expose different anchor semantics', () => {
  const time = renderRoute('#/world/city/bangkok/explore?view=time', state);
  const place = renderRoute('#/world/city/bangkok/explore?view=place', state);
  const connection = renderRoute('#/world/city/bangkok/explore?view=connection', state);
  assert.ok(count(time.html, 'data-particle-kind="scene"') >= 4);
  assert.ok(count(place.html, 'data-particle-kind="place"') >= 3);
  assert.ok(count(connection.html, 'data-particle-kind="connection"') >= 4);
  assert.deepEqual([time.scenePayload.target, place.scenePayload.target, connection.scenePayload.target], ['timeline', 'map', 'relations']);
});

test('Capsule and authority pages anchor originals, places and relationships to their scene geometry', () => {
  const capsule = renderRoute('#/world/city/bangkok/capsule', state).html;
  const moment = renderRoute('#/world/scene/scene-river-evening', state).html;
  const place = renderRoute('#/world/place/place-common-grounds', state).html;
  const connection = renderRoute('#/world/connection/rel-river-ticket-photo', state).html;
  assert.ok(count(capsule, 'data-particle-kind="fragment"') >= 4);
  assert.ok(count(moment, 'data-particle-kind="fragment"') >= 2);
  assert.ok(count(place, 'data-particle-kind="place"') >= 1);
  assert.ok(count(connection, 'data-particle-kind="fragment"') >= 2);
  assert.ok(count(connection, 'data-particle-kind="connection"') >= 1);
});

test('Lens and Else reuse extracted source anchors instead of opening disconnected floating UI', () => {
  const context = getFragmentContext('frag-river-1018-photo');
  const lens = renderFragmentLens(context);
  const elseState = createInitialState({
    route: '#/world/fragments',
    else: {
      open: true,
      state: 'found',
      query: '河岸是哪一天？',
      answer: {
        scope: { label: '全部碎片' },
        answer: '河岸照片来自 10 月 18 日。',
        sources: [{ fragmentId: 'frag-river-1018-photo', label: '河岸照片 · 18 OCT', kind: '照片' }],
        uncertainty: '票根原件尚未加入演示包。',
        nextAction: { href: '#/world/fragments', label: '查看原件' },
      },
    },
  });
  const sheet = renderElseSheet(elseState, elseState.route);
  const orb = renderElseOrb(elseState, { contract: { elseScope: 'world' } });
  assert.match(lens, /data-particle-anchor="lens-original"/);
  assert.match(sheet, /data-particle-kind="fragment"/);
  assert.match(orb, /data-particle-anchor="else-orb"/);
  assert.equal(count(sheet, 'data-else-orb-slot'), 1);
});

test('onboarding and import flows form batches from anchored source records', () => {
  const intro = renderRoute('#/onboarding', state);
  const firstImport = renderRoute('#/onboarding/first-import', state);
  const processing = renderRoute('#/onboarding/processing', state);
  const firstConnection = renderRoute('#/onboarding/first-connection', state);
  const worldImport = renderRoute('#/world/import', state);
  const receipt = renderRoute('#/world/inbox/receipt/batch-bangkok-backfill', state);
  assert.ok(count(intro.html, 'data-particle-anchor') >= 5);
  assert.ok(count(firstImport.html, 'data-particle-kind="fragment"') >= 4);
  assert.match(processing.html, /data-particle-anchor="processing-core"/);
  assert.ok(count(firstConnection.html, 'data-particle-kind="fragment"') >= 2);
  assert.match(firstConnection.html, /data-particle-kind="connection"/);
  assert.match(worldImport.html, /data-particle-anchor="import-batch-core"/);
  assert.ok(count(receipt.html, 'data-particle-anchor') >= 5);
  assert.ok(getSceneDefinition('processing', { particleCount: 1000 }).activeCount > 0);
});

test('Discover Home anchors every source and C-grade tools remain particle-free', () => {
  const discover = renderRoute('#/discover', state).html;
  assert.ok(count(discover, 'data-particle-kind="fragment"') >= 3);
  assert.equal(count(discover, 'data-particle-kind="entity"'), 1);
  ROUTES.filter((route) => route.intensity === 'C').forEach((route) => {
    const view = renderRoute(route.samplePath, state);
    assert.equal(view.sceneMode, 'quiet-tool', route.pageId);
    assert.equal(getSceneDefinition(view.sceneMode, { particleCount: 1000 }).activeCount, 0, route.pageId);
  });
});

test('rendered surfaces never expose generic pending source placeholders', () => {
  ROUTES.forEach((route) => {
    const html = renderRoute(route.samplePath, state).html;
    assert.doesNotMatch(html, /SOURCE \/ PENDING|PENDING|空白占位/, route.pageId);
  });
});
