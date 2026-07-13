import test from 'node:test';
import assert from 'node:assert/strict';
import { answerElse } from '../../src/else/answer-engine.js';
import { renderElseSheet } from '../../src/overlays/else-sheet.js';
import { createInitialState } from '../../src/store.js';

test('Else inherits route scope and uses human-readable source names', () => {
  const answer = answerElse({ route: '#/world/place/place-chao-phraya-ferry', question: '哪些到访已确认？' });
  assert.equal(answer.scope.label, 'Chao Phraya Ferry');
  assert.ok(answer.sources.every((source) => !source.label.startsWith('frag-')));
  assert.ok(answer.uncertainty);
  assert.ok(answer.nextAction.href);
});

test('Else drawer contains one source-first answer and no duplicated Orb', () => {
  const answer = answerElse({ route: '#/world/place/place-chao-phraya-ferry', question: '哪些到访已确认？' });
  const state = createInitialState({ route: '#/world/place/place-chao-phraya-ferry', else: { open: true, state: 'found', answer, query: '哪些到访已确认？' } });
  const html = renderElseSheet(state, '#/world/place/place-chao-phraya-ferry');
  assert.match(html, /data-else-orb-slot/);
  assert.doesNotMatch(html, /data-else-orb(?:\s|>)/);
  assert.equal((html.match(/data-else-next-action/g) || []).length, 1);
  assert.match(html, /10 月 22 日/);
});

test('unsupported location questions keep an explicit uncertain state', () => {
  const answer = answerElse({ route: '#/world', question: '老城区那张菜单到底是哪家店？' });
  assert.equal(answer.state, 'uncertain');
  assert.match(answer.uncertainty, /缺少/);
});
