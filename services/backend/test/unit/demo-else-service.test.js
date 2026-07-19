import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDemoEvidencePack,
  createDemoElseService,
  createGeminiElseProvider,
} from '../../src/demo/else-service.js';

const snapshot = Object.freeze({
  ownerId: 'user_alpha',
  revision: 'revision-real-01',
  world: Object.freeze({
    totalFragments: 3,
    totalCities: 1,
    totalPlaces: 1,
    placedFragments: 3,
    unplacedFragments: 0,
    sourceIds: Object.freeze(['frag_real_01', 'frag_real_02', 'frag_real_03']),
  }),
  cities: Object.freeze([Object.freeze({
    id: 'city-bangkok',
    name: 'Bangkok',
    country: 'Thailand',
    fragmentCount: 3,
    placeCount: 1,
    sourceIds: Object.freeze(['frag_real_01', 'frag_real_02', 'frag_real_03']),
  })]),
  fragments: Object.freeze([
    Object.freeze({
      id: 'frag_real_01',
      type: 'photo',
      originalName: 'ari-2024-10-12.jpg',
      capturedAt: '2024-10-12T01:17:00.000Z',
      localDate: '2024-10-12',
      placeId: 'place-common-grounds',
      placeName: 'Common Grounds',
      cityId: 'city-bangkok',
      sourceIds: Object.freeze(['frag_real_01']),
    }),
    Object.freeze({
      id: 'frag_real_02',
      type: 'receipt',
      originalName: 'ari-receipt-2024-10-16.png',
      capturedAt: '2024-10-16T01:22:00.000Z',
      localDate: '2024-10-16',
      placeId: 'place-common-grounds',
      placeName: 'Common Grounds',
      cityId: 'city-bangkok',
      sourceIds: Object.freeze(['frag_real_02']),
    }),
    Object.freeze({
      id: 'frag_real_03',
      type: 'photo',
      originalName: 'ari-2024-10-19.jpg',
      capturedAt: '2024-10-19T01:29:00.000Z',
      localDate: '2024-10-19',
      placeId: 'place-common-grounds',
      placeName: 'Common Grounds',
      cityId: 'city-bangkok',
      sourceIds: Object.freeze(['frag_real_03']),
    }),
  ]),
  places: Object.freeze([Object.freeze({
    id: 'place-common-grounds',
    name: 'Common Grounds',
    area: 'Ari',
    fragmentCount: 3,
    sourceIds: Object.freeze(['frag_real_01', 'frag_real_02', 'frag_real_03']),
  })]),
  visits: Object.freeze([]),
  connections: Object.freeze([]),
  discoveries: Object.freeze([Object.freeze({
    id: 'discovery-place-common-grounds-repeated-mornings',
    title: '3 个早晨都从 Common Grounds 开始',
    explanation: '3 个不同日期的原件在同一地点及早晨时段出现。',
    sourceIds: Object.freeze(['frag_real_01', 'frag_real_02', 'frag_real_03']),
  })]),
  inboxItems: Object.freeze([]),
  importBatches: Object.freeze([]),
});

test('evidence pack uses only persisted snapshot facts and keeps a source allowlist', () => {
  const pack = buildDemoEvidencePack(snapshot, { type: 'city', id: 'city-bangkok' });

  assert.equal(pack.label, 'Bangkok · 3 个原件');
  assert.match(pack.text, /ari-2024-10-12\.jpg/);
  assert.match(pack.text, /Common Grounds/);
  assert.deepEqual([...pack.sources.keys()], ['frag_real_01', 'frag_real_02', 'frag_real_03']);
  assert.doesNotMatch(pack.text, /感到|喜欢|治愈/);
});

test('Else returns a direct answer, validates source ids, and never exposes invented sources', async () => {
  const calls = [];
  const service = createDemoElseService({
    provider: Object.freeze({
      async answer(input) {
        calls.push(input);
        return {
          answer: '三个不同日期的原件都指向 Common Grounds。',
          sourceIds: ['frag_real_01', 'invented-fragment', 'frag_real_03'],
          uncertainty: '这里只能确认时间和地点重复。',
          nextStep: '打开这条发现',
        };
      },
    }),
  });

  const result = await service.ask({
    snapshot,
    question: '我反复去过哪里？',
    scope: { type: 'city', id: 'city-bangkok' },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].revision, snapshot.revision);
  assert.equal(result.status, 'completed');
  assert.equal(result.state, 'found');
  assert.deepEqual(result.sources.map(({ fragmentId }) => fragmentId), [
    'frag_real_01',
    'frag_real_03',
  ]);
  assert.equal(JSON.stringify(result).includes('invented-fragment'), false);
});

test('missing Gemini credentials are explicit and do not fabricate a fallback answer', async () => {
  const service = createDemoElseService({ provider: null });
  const result = await service.ask({
    snapshot,
    question: '我反复去过哪里？',
    scope: { type: 'world' },
  });

  assert.deepEqual(result, {
    status: 'unavailable',
    state: 'uncertain',
    answer: 'Gemini 尚未配置，Else 暂时不能生成回答。',
    sources: [],
    uncertainty: '原件与确定性关系仍然可用，但本次没有调用模型。',
    nextAction: null,
    scope: { label: '全部旅行世界' },
  });
});

test('Gemini provider requests strict evidence-only JSON and parses the structured answer', async () => {
  const calls = [];
  const provider = createGeminiElseProvider({
    client: Object.freeze({
      models: Object.freeze({
        async generateContent(input) {
          calls.push(input);
          return {
            text: JSON.stringify({
              answer: '三个不同日期都出现于 Common Grounds。',
              sourceIds: ['frag_real_01', 'frag_real_02', 'frag_real_03'],
              uncertainty: '只确认重复时间与地点。',
              nextStep: '打开这条发现',
            }),
          };
        },
      }),
    }),
    model: 'gemini-2.5-flash',
  });

  const result = await provider.answer({
    revision: snapshot.revision,
    question: '我反复去过哪里？',
    scopeLabel: 'Bangkok · 3 个原件',
    evidence: '[frag_real_01] · 原件:ari-2024-10-12.jpg',
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, 'gemini-2.5-flash');
  assert.equal(calls[0].config.responseMimeType, 'application/json');
  assert.match(calls[0].config.systemInstruction, /只能依据证据/);
  assert.match(calls[0].contents, /revision-real-01/);
  assert.deepEqual(result.sourceIds, ['frag_real_01', 'frag_real_02', 'frag_real_03']);
});

test('Gemini provider rejects malformed output instead of presenting it as an answer', async () => {
  const provider = createGeminiElseProvider({
    client: { models: { async generateContent() { return { text: 'not-json' }; } } },
    model: 'gemini-2.5-flash',
  });

  await assert.rejects(
    provider.answer({ revision: 'r1', question: '问题', scopeLabel: '世界', evidence: '证据' }),
    /invalid structured response/i,
  );
});
