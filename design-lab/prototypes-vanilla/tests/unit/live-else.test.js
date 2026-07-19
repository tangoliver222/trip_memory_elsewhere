import test from 'node:test';
import assert from 'node:assert/strict';
import { askElseWithRuntime, scopeForElseRoute } from '../../src/data/live-else.js';

test('Else scope follows the current live route or selected persisted fragment', () => {
  assert.deepEqual(scopeForElseRoute('#/world', null), { type: 'world' });
  assert.deepEqual(scopeForElseRoute('#/world/fragments', null), { type: 'fragments' });
  assert.deepEqual(scopeForElseRoute('#/world/city/bangkok/capsule', null), {
    type: 'city',
    id: 'city-bangkok',
  });
  assert.deepEqual(scopeForElseRoute('#/discover/discovery-real-01', null), {
    type: 'discovery',
    id: 'discovery-real-01',
  });
  assert.deepEqual(scopeForElseRoute('#/world', 'frag_real_01'), {
    type: 'fragment',
    id: 'frag_real_01',
  });
});

test('live Else calls the authenticated server client and never invokes fixture fallback', async () => {
  let fixtureCalls = 0;
  const calls = [];
  const result = await askElseWithRuntime({
    runtime: {
      mode: 'live',
      client: {
        async askElse(question, scope) {
          calls.push({ question, scope });
          return { status: 'completed', answer: '真实回答', sources: [] };
        },
      },
    },
    route: '#/world/city/bangkok',
    question: '我反复去过哪里？',
    fixtureAnswer() {
      fixtureCalls += 1;
      return { answer: '固定回答' };
    },
  });

  assert.equal(result.answer, '真实回答');
  assert.equal(fixtureCalls, 0);
  assert.deepEqual(calls, [{
    question: '我反复去过哪里？',
    scope: { type: 'city', id: 'city-bangkok' },
  }]);
});

test('fixture Else remains isolated to non-live visual tests', async () => {
  const result = await askElseWithRuntime({
    runtime: { mode: 'fixture', client: null },
    route: '#/world',
    question: '问题',
    fixtureAnswer: ({ route, question }) => ({ answer: `${route}:${question}` }),
  });
  assert.equal(result.answer, '#/world:问题');
});
