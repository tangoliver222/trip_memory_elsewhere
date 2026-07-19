import test from 'node:test';
import assert from 'node:assert/strict';
import { renderRoute } from '../../src/pages/render-route.js';
import { createInitialState } from '../../src/store.js';

const state = createInitialState();

test('receipt counts come only from the import batch', () => {
  const html = renderRoute('#/world/inbox/receipt/batch-bangkok-backfill', state).html;
  assert.match(html, /28 个原件/);
  assert.match(html, /4 个地点/);
  assert.match(html, /1 条新连接/);
  assert.doesNotMatch(html, /统计面板|Dashboard/);
});

test('mixed-media import and inbox keep one clear next decision', () => {
  const importHtml = renderRoute('#/world/import', state).html;
  const inboxHtml = renderRoute('#/world/inbox', state).html;
  const inboxText = inboxHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  assert.match(importHtml, /18 张照片/);
  assert.match(importHtml, /5 张截图/);
  assert.equal((inboxHtml.match(/data-review-choice/g) || []).length, 3);
  assert.match(inboxText, /是否也靠近 Chao Phraya Ferry/);
});
