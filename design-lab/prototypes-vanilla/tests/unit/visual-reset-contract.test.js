import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderWorldHome, renderCityHome } from '../../src/pages/world.js';
import { renderFragmentField, renderInboxPage } from '../../src/pages/fragments.js';
import { renderDiscoveryDetail } from '../../src/pages/discover.js';
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
