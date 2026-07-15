/**
 * Gemini 调用：流式正文 + 结构化尾部解析 + 来源白名单校验。
 * DEEP 模型失败自动回退 FAST（模型名漂移时服务不倒）。
 */
import { GoogleGenAI } from '@google/genai';
import { config } from './config.js';
import { resolveScope } from './scope.js';
import { pickAlias } from './router.js';
import { DELIMITER, SYSTEM_PROMPT, buildUserPrompt } from './prompt.js';

let client = null;
function getClient() {
  if (!client) {
    client = new GoogleGenAI(config.useVertex
      ? { vertexai: true, project: config.vertexProject, location: config.vertexLocation }
      : { apiKey: config.apiKey });
  }
  return client;
}

/** 流式输出的分隔闸门：正文逐段放行，尾部（JSON）整体缓冲；分隔符可能被切分在两个 chunk 之间。 */
export class TokenGate {
  constructor(delimiter = DELIMITER) {
    this.delimiter = delimiter;
    this.buffer = '';
    this.trailer = '';
    this.found = false;
    this.emitted = '';
  }

  push(chunk = '') {
    if (this.found) {
      this.trailer += chunk;
      return '';
    }
    this.buffer += chunk;
    const index = this.buffer.indexOf(this.delimiter);
    if (index !== -1) {
      this.found = true;
      const emit = this.buffer.slice(0, index);
      this.trailer = this.buffer.slice(index + this.delimiter.length);
      this.buffer = '';
      this.emitted += emit;
      return emit;
    }
    // 留住可能是分隔符前缀的尾巴
    const safeLength = Math.max(0, this.buffer.length - this.delimiter.length);
    const emit = this.buffer.slice(0, safeLength);
    this.buffer = this.buffer.slice(safeLength);
    this.emitted += emit;
    return emit;
  }

  end() {
    if (!this.found && this.buffer) {
      this.emitted += this.buffer;
      const emit = this.buffer;
      this.buffer = '';
      return emit;
    }
    return '';
  }
}

/** 从尾部文本中容错解析 JSON。 */
export function parseTrailer(text = '') {
  const start = text.indexOf('{');
  const endIndex = text.lastIndexOf('}');
  if (start === -1 || endIndex <= start) return { sourceIds: [], uncertainty: null, nextStep: null };
  try {
    const parsed = JSON.parse(text.slice(start, endIndex + 1));
    return {
      sourceIds: Array.isArray(parsed.sourceIds) ? parsed.sourceIds.filter((v) => typeof v === 'string') : [],
      uncertainty: typeof parsed.uncertainty === 'string' && parsed.uncertainty ? parsed.uncertainty : null,
      nextStep: typeof parsed.nextStep === 'string' && parsed.nextStep ? parsed.nextStep : null,
    };
  } catch {
    return { sourceIds: [], uncertainty: null, nextStep: null };
  }
}

/**
 * 来源校验：只保留证据包中真实存在的 id；
 * 若模型引用了 id 但全部无效，回退为证据包前 3 项并标记 sourcesFallback。
 */
export function validateSources(sourceIds, sourcesMap) {
  const valid = sourceIds.filter((id) => sourcesMap.has(id)).map((id) => sourcesMap.get(id));
  if (valid.length > 0) return { sources: valid, sourcesFallback: false };
  if (sourceIds.length === 0) return { sources: [], sourcesFallback: false };
  return { sources: [...sourcesMap.values()].slice(0, 3), sourcesFallback: true };
}

/** 第一步：解析范围与路由（供 SSE 先发 meta）。 */
export function prepare(question, scope) {
  const pack = resolveScope(scope);
  const alias = pickAlias(question, pack.lines.length);
  return { pack, alias, question };
}

/** 第二步：调用模型并解析。onToken 可选（SSE 时传入）。 */
export async function run({ pack, alias, question }, { onToken } = {}, forcedAlias = null) {
  const useAlias = forcedAlias || alias;
  const model = config.models[useAlias];
  try {
    const stream = await getClient().models.generateContentStream({
      model,
      contents: [{ role: 'user', parts: [{ text: buildUserPrompt({ scopeLabel: pack.label, lines: pack.lines, question }) }] }],
      config: { systemInstruction: SYSTEM_PROMPT, temperature: 0.3, maxOutputTokens: 1024 },
    });
    const gate = new TokenGate();
    for await (const chunk of stream) {
      const emit = gate.push(chunk.text ?? '');
      if (emit && onToken) onToken(emit);
    }
    const last = gate.end();
    if (last && onToken) onToken(last);

    const trailer = parseTrailer(gate.trailer);
    const { sources, sourcesFallback } = validateSources(trailer.sourceIds, pack.sources);
    return {
      answer: gate.emitted.trim(),
      sources,
      sourcesFallback,
      uncertainty: trailer.uncertainty,
      nextStep: trailer.nextStep,
      modelAlias: useAlias,
      model,
    };
  } catch (error) {
    // DEEP 失败且与 FAST 不同源时降级重试一次
    if (useAlias === 'DEEP_REASONING' && config.models.FAST_MULTIMODAL !== model && !forcedAlias) {
      return run({ pack, alias, question }, { onToken }, 'FAST_MULTIMODAL');
    }
    throw error;
  }
}
