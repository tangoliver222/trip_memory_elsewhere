const MAX_QUESTION_LENGTH = 500;
const GEMINI_SYSTEM_PROMPT = `你是 Elsewhere 的私人记忆助手 Else。
只能依据证据回答，不得补充证据中没有的时间、地点、事件、感受或关系。
先直接回答，再列出实际使用的 sourceIds，并明确保留不确定性。
只能引用证据行方括号内出现的 source id。使用提问的语言，回答保持简洁。`;

function scopeFragments(snapshot, scope) {
  const type = scope?.type || 'world';
  if (type === 'fragment') {
    return snapshot.fragments.filter(({ id }) => id === scope.id);
  }
  if (type === 'city') {
    return snapshot.fragments.filter(({ cityId }) => cityId === scope.id);
  }
  if (type === 'discovery') {
    const discovery = snapshot.discoveries.find(({ id }) => id === scope.id);
    const ids = new Set(discovery?.sourceIds || []);
    return snapshot.fragments.filter(({ id }) => ids.has(id));
  }
  return snapshot.fragments;
}

function scopeLabel(snapshot, scope, fragmentCount) {
  const type = scope?.type || 'world';
  if (type === 'fragment') {
    const fragment = snapshot.fragments.find(({ id }) => id === scope.id);
    return fragment?.originalName || '当前碎片';
  }
  if (type === 'city') {
    const city = snapshot.cities.find(({ id }) => id === scope.id);
    return city ? `${city.name} · ${fragmentCount} 个原件` : '当前城市';
  }
  if (type === 'discovery') {
    const discovery = snapshot.discoveries.find(({ id }) => id === scope.id);
    return discovery?.title || '当前发现';
  }
  if (type === 'fragments') return `全部碎片 · ${fragmentCount} 个原件`;
  return '全部旅行世界';
}

function fragmentLine(fragment) {
  return [
    `[${fragment.id}]`,
    `类型:${fragment.type}`,
    `原件:${fragment.originalName}`,
    `时间:${fragment.capturedAt || '待确认'}`,
    `地点:${fragment.placeName || '待确认'}`,
  ].join(' · ');
}

export function buildDemoEvidencePack(snapshot, scope = { type: 'world' }) {
  if (!snapshot || !Array.isArray(snapshot.fragments)) {
    throw new TypeError('Persisted snapshot is required');
  }
  const fragments = scopeFragments(snapshot, scope);
  const sources = new Map(fragments.map((fragment) => [fragment.id, Object.freeze({
    fragmentId: fragment.id,
    label: fragment.originalName,
    kind: fragment.type,
  })]));
  const sourceIds = new Set(sources.keys());
  const discoveryLines = snapshot.discoveries
    .filter((discovery) => discovery.sourceIds.some((id) => sourceIds.has(id)))
    .map((discovery) => `确定性发现:${discovery.title} · ${discovery.explanation} · 来源:${discovery.sourceIds.join(',')}`);
  const lines = [
    ...fragments.map(fragmentLine),
    ...discoveryLines,
  ];
  return Object.freeze({
    label: scopeLabel(snapshot, scope, fragments.length),
    text: lines.join('\n'),
    sources,
  });
}

function unavailableAnswer() {
  return Object.freeze({
    status: 'unavailable',
    state: 'uncertain',
    answer: 'Gemini 尚未配置，Else 暂时不能生成回答。',
    sources: Object.freeze([]),
    uncertainty: '原件与确定性关系仍然可用，但本次没有调用模型。',
    nextAction: null,
    scope: Object.freeze({ label: '全部旅行世界' }),
  });
}

function validateQuestion(question) {
  const normalized = typeof question === 'string' ? question.trim() : '';
  if (!normalized || normalized.length > MAX_QUESTION_LENGTH) {
    throw new TypeError('Question must contain 1 to 500 characters');
  }
  return normalized;
}

export function createDemoElseService({ provider } = {}) {
  if (provider !== null && typeof provider?.answer !== 'function') {
    throw new TypeError('Else provider must implement answer()');
  }
  return Object.freeze({
    async ask({ snapshot, question, scope = { type: 'world' } } = {}) {
      const normalized = validateQuestion(question);
      if (provider === null) return unavailableAnswer();
      const pack = buildDemoEvidencePack(snapshot, scope);
      const generated = await provider.answer(Object.freeze({
        revision: snapshot.revision,
        question: normalized,
        scopeLabel: pack.label,
        evidence: pack.text,
      }));
      const sourceIds = Array.isArray(generated?.sourceIds) ? generated.sourceIds : [];
      const sources = sourceIds
        .filter((id, index) => typeof id === 'string' && sourceIds.indexOf(id) === index)
        .map((id) => pack.sources.get(id))
        .filter(Boolean);
      return Object.freeze({
        status: 'completed',
        state: sources.length > 0 ? 'found' : 'uncertain',
        answer: typeof generated?.answer === 'string' && generated.answer.trim()
          ? generated.answer.trim()
          : '目前的原件里没有足够证据形成回答。',
        sources: Object.freeze(sources),
        uncertainty: typeof generated?.uncertainty === 'string' && generated.uncertainty.trim()
          ? generated.uncertainty.trim()
          : '只使用当前范围内已保存的原件与确定性关系。',
        nextAction: typeof generated?.nextStep === 'string' && generated.nextStep.trim()
          ? Object.freeze({ label: generated.nextStep.trim(), href: '#/world/fragments' })
          : null,
        scope: Object.freeze({ label: pack.label }),
      });
    },
  });
}

function parseProviderResponse(text) {
  if (typeof text !== 'string') throw new Error('Gemini returned an invalid structured response');
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || typeof value.answer !== 'string'
      || !Array.isArray(value.sourceIds)
      || value.sourceIds.some((id) => typeof id !== 'string')) {
      throw new Error('shape');
    }
    return Object.freeze({
      answer: value.answer,
      sourceIds: Object.freeze([...value.sourceIds]),
      uncertainty: typeof value.uncertainty === 'string' ? value.uncertainty : null,
      nextStep: typeof value.nextStep === 'string' ? value.nextStep : null,
    });
  } catch {
    throw new Error('Gemini returned an invalid structured response');
  }
}

export function createGeminiElseProvider({ client, model } = {}) {
  if (typeof client?.models?.generateContent !== 'function') {
    throw new TypeError('Gemini client must implement models.generateContent()');
  }
  if (typeof model !== 'string' || !model) throw new TypeError('Gemini model is required');
  return Object.freeze({
    async answer({ revision, question, scopeLabel, evidence } = {}) {
      const response = await client.models.generateContent({
        model,
        contents: `【数据版本】${revision}\n【当前范围】${scopeLabel}\n【证据】\n${evidence || '没有可用证据'}\n【问题】${question}`,
        config: {
          systemInstruction: GEMINI_SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            required: ['answer', 'sourceIds', 'uncertainty', 'nextStep'],
            properties: {
              answer: { type: 'STRING' },
              sourceIds: { type: 'ARRAY', items: { type: 'STRING' } },
              uncertainty: { type: 'STRING', nullable: true },
              nextStep: { type: 'STRING', nullable: true },
            },
          },
          temperature: 0.2,
          maxOutputTokens: 700,
        },
      });
      return parseProviderResponse(response.text);
    },
  });
}
