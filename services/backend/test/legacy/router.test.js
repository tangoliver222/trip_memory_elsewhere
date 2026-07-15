import test from 'node:test';
import assert from 'node:assert/strict';
import { pickAlias } from '../../src/router.js';

test('简单事实问题走 FAST', () => {
  assert.equal(pickAlias('10 月 18 日我在哪里？', 10), 'FAST_MULTIMODAL');
});

test('为什么 / 规律 / 冲突类问题走 DEEP', () => {
  assert.equal(pickAlias('为什么这两张碎片会被连接？', 5), 'DEEP_REASONING');
  assert.equal(pickAlias('我的早晨有什么规律？', 5), 'DEEP_REASONING');
  assert.equal(pickAlias('这两个时间冲突吗？', 5), 'DEEP_REASONING');
});

test('大证据包走 DEEP', () => {
  assert.equal(pickAlias('都有什么？', 30), 'DEEP_REASONING');
});
