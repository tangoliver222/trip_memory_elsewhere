import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAppShell } from '../../src/components/app-shell.js';
import { renderFragmentLens } from '../../src/overlays/fragment-lens.js';
import { getFragmentContext } from '../../src/selectors.js';

test('app shell has exactly one memory canvas, overlay root and Else instance', () => {
  const html = renderAppShell({
    pageHtml: '<main data-page-id="world-home"></main>',
    route: { pageId: 'world-home', contract: { space: 'world', elseScope: 'world' } },
    state: { overlays: [], else: { hidden: false, state: 'idle' } },
  });

  assert.equal((html.match(/id="memory-canvas"/g) || []).length, 1);
  assert.equal((html.match(/id="overlay-root"/g) || []).length, 1);
  assert.equal((html.match(/data-else-orb/g) || []).length, 1);
  assert.doesNotMatch(html, /onclick=|onchange=/);
});

test('Fragment Lens answers identity, place and importance without exposing internal ids', () => {
  const context = getFragmentContext('frag-river-1018-photo');
  const html = renderFragmentLens(context);
  assert.match(html, /河岸照片/);
  assert.match(html, /Chao Phraya Ferry/);
  assert.match(html, /相隔 17 分钟/);
  assert.match(html, /查看原件/);
  assert.doesNotMatch(html, /frag-river|rel-river|FACT CORE|EXIF/);
  assert.doesNotMatch(html, /onclick=|onchange=/);
});
