import test from 'node:test';
import assert from 'node:assert/strict';
import { TokenGate, parseTrailer, validateSources } from '../src/answer.js';
import { resolveScope } from '../src/scope.js';

test('TokenGate：正文放行，尾部缓冲，分隔符跨 chunk 也能切开', () => {
  const gate = new TokenGate('---ELSE---');
  let out = '';
  out += gate.push('三次到访都发生在早晨 [frag-a]。');
  out += gate.push('---EL');
  out += gate.push('SE---{"sourceIds":["frag-a"]}');
  out += gate.end();
  assert.equal(out, '三次到访都发生在早晨 [frag-a]。');
  assert.equal(gate.trailer, '{"sourceIds":["frag-a"]}');
});

test('TokenGate：无分隔符时全部正文可见', () => {
  const gate = new TokenGate('---ELSE---');
  let out = gate.push('目前的碎片里没有足够证据。');
  out += gate.end();
  assert.equal(out, '目前的碎片里没有足够证据。');
  assert.equal(gate.trailer, '');
});

test('parseTrailer 容错解析并规范字段', () => {
  const good = parseTrailer('噪音 {"sourceIds":["a","b"],"uncertainty":"缺 GPS","nextStep":"打开原件"} 噪音');
  assert.deepEqual(good.sourceIds, ['a', 'b']);
  assert.equal(good.uncertainty, '缺 GPS');
  const bad = parseTrailer('不是 JSON');
  assert.deepEqual(bad, { sourceIds: [], uncertainty: null, nextStep: null });
});

test('validateSources：无效 id 被剔除，全部无效时回退并打标', () => {
  const { sources: map } = resolveScope({ type: 'city', id: 'bangkok' });
  const ok = validateSources(['frag-ari-1016-receipt', 'frag-编造的'], map);
  assert.equal(ok.sources.length, 1);
  assert.equal(ok.sourcesFallback, false);

  const fallback = validateSources(['全是编造的'], map);
  assert.ok(fallback.sources.length > 0);
  assert.equal(fallback.sourcesFallback, true);

  const none = validateSources([], map);
  assert.equal(none.sources.length, 0);
  assert.equal(none.sourcesFallback, false);
});
