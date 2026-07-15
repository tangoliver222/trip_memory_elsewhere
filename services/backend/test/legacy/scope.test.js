import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveScope } from '../../src/scope.js';
import { config } from '../../src/config.js';

test('world scope 汇总城市、发现与待判断，且不超过证据上限', () => {
  const pack = resolveScope({ type: 'world' });
  assert.match(pack.label, /我的世界/);
  assert.ok(pack.lines.some((line) => line.includes('Bangkok')));
  assert.ok(pack.lines.some((line) => line.includes('发现')));
  assert.ok(pack.lines.some((line) => line.includes('待判断')));
  assert.ok(pack.lines.length <= config.evidenceLimit);
});

test('city scope 携带小票证据与用户解释，id 全部进入来源白名单', () => {
  const pack = resolveScope({ type: 'city', id: 'bangkok' });
  assert.match(pack.label, /Bangkok/);
  assert.ok(pack.lines.some((line) => line.includes('小票')));
  assert.ok(pack.lines.some((line) => line.includes('用户解释')));
  const ids = pack.lines.map((line) => line.match(/^\[([^\]]+)\]/)?.[1]).filter(Boolean);
  assert.equal(ids.length, pack.lines.length);
  ids.forEach((id) => assert.ok(pack.sources.has(id), `${id} 应在来源白名单`));
});

test('fragment scope 解析出场景、地点与连接', () => {
  const pack = resolveScope({ type: 'fragment', id: 'frag-river-1018-ticket' });
  assert.ok(pack.lines.some((line) => line.includes('场景')));
  assert.ok(pack.lines.some((line) => line.includes('Chao Phraya')));
  assert.ok(pack.lines.some((line) => line.includes('连接')));
});

test('discovery scope 先证据后发现，包含缺口信息', () => {
  const pack = resolveScope({ type: 'discovery', id: 'disc-river-open-thread' });
  assert.ok(pack.lines.some((line) => line.includes('缺口')));
});

test('fragments 搜索缩小证据范围', () => {
  const all = resolveScope({ type: 'fragments' });
  const filtered = resolveScope({ type: 'fragments', query: 'ferry' });
  assert.ok(filtered.lines.length < all.lines.length);
  assert.match(filtered.label, /ferry/);
});

test('未知 scope 回退世界总览', () => {
  const pack = resolveScope({ type: 'nonsense', id: 'x' });
  assert.match(pack.label, /我的世界/);
});
