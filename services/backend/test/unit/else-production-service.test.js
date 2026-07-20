import test from 'node:test';
import assert from 'node:assert/strict';
import { createElseQueryService } from '../../src/else/service.js';

function snapshot(fragments = []) {
  return Object.freeze({
    revision: '0123456789abcdef0123',
    summary: Object.freeze({ totalFragments: fragments.length }),
    fragments: Object.freeze(fragments),
    importBatches: Object.freeze([]),
    page: Object.freeze({ fragmentsTruncated: false, importBatchesTruncated: false }),
  });
}

function fragment(id) {
  return Object.freeze({
    id,
    type: 'receipt',
    status: 'placed',
    original: Object.freeze({ name: `${id}.png` }),
    source: Object.freeze({
      sourceCreatedAt: '2026-07-12T03:22:14.000Z',
      sourceModifiedAt: null,
      locationHint: Object.freeze({ lat: 13.7791, lng: 100.5443 }),
    }),
    facts: Object.freeze({}),
    relationships: Object.freeze({ placeId: 'place_common_grounds' }),
  });
}

function harness({ fragments = [fragment('frag_12345678')], generated } = {}) {
  const order = [];
  const service = createElseQueryService({
    memorySnapshotLoader: Object.freeze({
      async load(ownerId) {
        order.push(['snapshot', ownerId]);
        return snapshot(fragments);
      },
    }),
    budgetGate: Object.freeze({
      async reserve(ownerId) {
        order.push(['budget', ownerId]);
        return Object.freeze({ ownerUsed: 1, projectUsed: 1 });
      },
    }),
    provider: Object.freeze({
      async answer(input) {
        order.push(['provider', input]);
        return generated ?? Object.freeze({
          answer: '找到一张小票。',
          sourceIds: ['invented', 'frag_12345678', 'frag_12345678'],
          uncertainty: '只有一份原件。',
          nextStep: null,
        });
      },
    }),
  });
  return { service, order };
}

test('Else reserves budget before provider and validates source IDs', async () => {
  const { service, order } = harness();

  const answer = await service.ask('user_alpha', {
    question: '我保存过什么？',
    scope: { type: 'world' },
  });

  assert.deepEqual(order.map(([name]) => name), ['snapshot', 'budget', 'provider']);
  assert.deepEqual(answer.sources, [{
    fragmentId: 'frag_12345678',
    label: 'frag_12345678.png',
    kind: 'receipt',
  }]);
  const providerInput = order[2][1];
  assert.equal(providerInput.evidence.includes('frag_12345678'), true);
  assert.equal(providerInput.evidence.includes('users/'), false);
});

test('Else returns honest uncertainty without budget or provider for empty evidence', async () => {
  const { service, order } = harness({ fragments: [] });

  const answer = await service.ask('user_alpha', {
    question: '我保存过什么？',
    scope: { type: 'world' },
  });

  assert.deepEqual(order, [['snapshot', 'user_alpha']]);
  assert.equal(answer.state, 'uncertain');
  assert.deepEqual(answer.sources, []);
});

test('Else fragment scope uses at most forty persisted sources', async () => {
  const fragments = Array.from({ length: 45 }, (_, index) => (
    fragment(`frag_${String(index + 1).padStart(8, '0')}`)
  ));
  const { service, order } = harness({ fragments });

  await service.ask('user_alpha', {
    question: '这张碎片是什么？',
    scope: { type: 'fragment', id: 'frag_00000041' },
  });

  const providerInput = order.find(([name]) => name === 'provider')[1];
  assert.equal(providerInput.sourceIds.length, 1);
  assert.deepEqual(providerInput.sourceIds, ['frag_00000041']);
});
