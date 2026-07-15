/**
 * Else AI Service —— node:http，三个端点：
 *   GET  /healthz
 *   GET  /v1/else/suggestions?type=&id=&query=
 *   POST /v1/else/ask   { question, scope:{type,id,query}, stream }
 * SSE 事件：meta → token* → done | error（契约见 docs/implementation/else-ai-service-v1.md §4）
 */
import http from 'node:http';
import crypto from 'node:crypto';
import { config, hasCredentials } from './config.js';
import { resolveScope } from './scope.js';
import { suggestionsFor } from './suggestions.js';
import { prepare, run } from './answer.js';

const CORS = {
  'Access-Control-Allow-Origin': config.corsOrigin,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...CORS });
  res.end(JSON.stringify(body));
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 32 * 1024) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function sse(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    ...CORS,
  });
  return (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function handleAsk(req, res) {
  let body;
  try { body = await readBody(req); } catch (error) { return json(res, 400, { error: error.message }); }

  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question || question.length > config.maxQuestionLength) {
    return json(res, 400, { error: `question 必须为 1–${config.maxQuestionLength} 字符` });
  }
  if (!hasCredentials()) return json(res, 503, { error: 'GEMINI_API_KEY missing' });

  const scope = typeof body.scope === 'object' && body.scope ? body.scope : {};
  const stream = body.stream !== false;
  const sessionId = crypto.randomUUID();
  const prep = prepare(question, scope);

  if (!stream) {
    try {
      const result = await run(prep);
      return json(res, 200, { sessionId, scopeLabel: prep.pack.label, ...result });
    } catch (error) {
      console.error('[ask]', error.message);
      return json(res, 502, { error: '模型调用失败', detail: error.message });
    }
  }

  const send = sse(res);
  send('meta', { sessionId, scopeLabel: prep.pack.label, modelAlias: prep.alias });
  try {
    const result = await run(prep, { onToken: (text) => send('token', { text }) });
    send('done', result);
  } catch (error) {
    console.error('[ask:sse]', error.message);
    send('error', { message: '模型调用失败' });
  }
  res.end();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (req.method === 'GET' && url.pathname === '/healthz') {
    return json(res, 200, { ok: true, credentials: hasCredentials(), models: config.models });
  }
  if (req.method === 'GET' && url.pathname === '/v1/else/suggestions') {
    const scope = {
      type: url.searchParams.get('type') || 'world',
      id: url.searchParams.get('id') || '',
      query: url.searchParams.get('query') || '',
    };
    return json(res, 200, { scopeLabel: resolveScope(scope).label, suggestions: suggestionsFor(scope) });
  }
  if (req.method === 'POST' && url.pathname === '/v1/else/ask') return handleAsk(req, res);
  return json(res, 404, { error: 'not found' });
});

server.listen(config.port, () => {
  console.log(`else-service listening on :${config.port} (credentials: ${hasCredentials()})`);
});
