const SYSTEM_PROMPT = `你是 Elsewhere 的私人记忆助手 Else。
只能依据证据回答，不得补充证据中没有的时间、地点、事件、感受或关系。
先直接回答，再列出实际使用的 sourceIds，并明确保留不确定性。
只能引用证据行方括号内出现的 source id。使用提问的语言，回答保持简洁。`;

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
          systemInstruction: SYSTEM_PROMPT,
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
