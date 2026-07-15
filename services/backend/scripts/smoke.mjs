#!/usr/bin/env node
/**
 * 真实调用冒烟：需要服务已运行（npm run dev）且 .env 配置了 GEMINI_API_KEY。
 * 用法：node scripts/smoke.mjs [问题] [scopeType] [scopeId]
 */
const BASE = process.env.ELSE_BASE || 'http://127.0.0.1:8787';
const question = process.argv[2] || '10 月 18 日傍晚我在哪里？';
const scope = { type: process.argv[3] || 'city', id: process.argv[4] || 'bangkok' };

const health = await (await fetch(`${BASE}/healthz`)).json();
console.log('healthz:', health);
if (!health.credentials) {
  console.error('GEMINI_API_KEY 未配置，服务将拒绝 /ask。');
  process.exit(1);
}

const suggestions = await (await fetch(`${BASE}/v1/else/suggestions?type=${scope.type}&id=${scope.id}`)).json();
console.log('suggestions:', suggestions);

console.log(`\nQ: ${question}\n--- 流式回答 ---`);
const response = await fetch(`${BASE}/v1/else/ask`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ question, scope, stream: true }),
});
const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  let index;
  while ((index = buffer.indexOf('\n\n')) !== -1) {
    const block = buffer.slice(0, index);
    buffer = buffer.slice(index + 2);
    const event = /event: (.+)/.exec(block)?.[1];
    const data = JSON.parse(/data: (.+)/.exec(block)?.[1] || '{}');
    if (event === 'token') process.stdout.write(data.text);
    else if (event === 'done') console.log('\n--- done ---\n', JSON.stringify(data, null, 2));
    else console.log(`\n[${event}]`, data);
  }
}
