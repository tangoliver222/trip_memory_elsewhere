import { buildElseEvidence } from './evidence.js';
import { ElseQueryError } from './errors.js';

function assertPort(port, method, label) {
  if (typeof port?.[method] !== 'function') throw new TypeError(`${label} must implement ${method}()`);
  return port;
}

function emptyAnswer(label) {
  return Object.freeze({
    status: 'completed',
    state: 'uncertain',
    answer: '当前范围里还没有可用于回答的原件。',
    sources: Object.freeze([]),
    uncertainty: 'Else 没有调用模型，也没有补充原件之外的信息。',
    nextAction: Object.freeze({ label: '放入新的碎片', href: '#/world/import' }),
    scope: Object.freeze({ label }),
  });
}

export function createElseQueryService({
  memorySnapshotLoader,
  budgetGate,
  provider,
} = {}) {
  const snapshots = assertPort(memorySnapshotLoader, 'load', 'Memory snapshot loader');
  const budgets = assertPort(budgetGate, 'reserve', 'Else budget gate');
  const answers = assertPort(provider, 'answer', 'Else provider');

  return Object.freeze({
    async ask(ownerId, { question, scope }) {
      let snapshot;
      try {
        snapshot = await snapshots.load(ownerId);
      } catch {
        throw new ElseQueryError('else/unavailable');
      }
      const pack = buildElseEvidence(snapshot, scope);
      if (pack.sourceIds.length === 0) return emptyAnswer(pack.label);

      try {
        await budgets.reserve(ownerId);
      } catch (error) {
        if (error?.code === 'else/budget-exhausted') throw error;
        throw new ElseQueryError('else/unavailable');
      }

      let generated;
      try {
        generated = await answers.answer(Object.freeze({
          revision: pack.revision,
          question,
          scopeLabel: pack.label,
          evidence: pack.evidence,
          sourceIds: pack.sourceIds,
        }));
      } catch {
        throw new ElseQueryError('else/provider-failed');
      }
      const returnedIds = Array.isArray(generated?.sourceIds) ? generated.sourceIds : [];
      const sources = returnedIds
        .filter((id, index) => typeof id === 'string' && returnedIds.indexOf(id) === index)
        .map((id) => pack.sources.get(id))
        .filter(Boolean);
      const answer = typeof generated?.answer === 'string' && generated.answer.trim()
        ? generated.answer.trim()
        : '当前原件不足以形成可靠回答。';
      return Object.freeze({
        status: 'completed',
        state: sources.length > 0 ? 'found' : 'uncertain',
        answer,
        sources: Object.freeze(sources),
        uncertainty: typeof generated?.uncertainty === 'string' && generated.uncertainty.trim()
          ? generated.uncertainty.trim()
          : '只使用当前范围内已保存的原件。',
        nextAction: typeof generated?.nextStep === 'string' && generated.nextStep.trim()
          ? Object.freeze({ label: generated.nextStep.trim(), href: '#/world/fragments' })
          : null,
        scope: Object.freeze({ label: pack.label }),
      });
    },
  });
}
