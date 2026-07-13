import { escapeHtml } from '../components/primitives.js';
import { getElseContext } from '../selectors.js';

const stateLabel = { idle: '等待', reading: '正在读取来源', found: '找到来源', uncertain: '来源不足', conflict: '来源方向不一致' };

export function renderElseSheet(state, route = state.route) {
  if (!state.else?.open || state.else.hidden) return '';
  const answer = state.else.answer;
  const scope = answer?.scope || getElseContext(route, state);
  const currentState = state.else.state || 'reading';
  const expanded = Boolean(answer);

  return `<aside class="else-drawer else-drawer--${currentState} ${expanded ? 'is-expanded' : ''}" role="dialog" aria-modal="false" aria-label="Else 记忆助手">
    <header class="else-drawer__header">
      <div class="else-drawer__orb-slot" data-else-orb-slot></div>
      <div><p class="eyebrow">ELSE · ${stateLabel[currentState]}</p><h2>${escapeHtml(scope.label)}</h2></div>
      <button class="icon-button" type="button" data-action="toggle-else" aria-label="收起 Else">×</button>
    </header>
    ${answer ? `<div class="else-answer">
      <p class="else-answer__question">“${escapeHtml(state.else.query)}”</p>
      <p class="else-answer__text">${escapeHtml(answer.answer)}</p>
      <section class="else-sources"><span>支持这个回答的来源</span>${answer.sources.map((source) => `<button type="button" data-action="open-lens" data-fragment-id="${source.fragmentId}"><i></i><strong>${escapeHtml(source.label)}</strong><small>${escapeHtml(source.kind)}</small></button>`).join('')}</section>
      <section class="else-uncertainty"><span>${currentState === 'conflict' ? '两组来源为何没有合并' : '仍需要保留的边界'}</span><p>${escapeHtml(answer.uncertainty)}</p></section>
      <button class="else-next-action" type="button" data-else-next-action data-action="navigate" data-route="${escapeHtml(answer.nextAction.href)}">${escapeHtml(answer.nextAction.label)} →</button>
    </div>` : `<div class="else-quick">
      <p>我会先看当前范围里的原件、时间、地点与连接，再回答。</p>
      <div class="else-suggestions">${(scope.suggestedQuestions || ['我反复去过哪里？','哪些碎片还没有落点？']).map((question) => `<button type="button" data-action="ask-else" data-question="${escapeHtml(question)}">${escapeHtml(question)}</button>`).join('')}</div>
    </div>`}
    <div class="else-composer"><input type="text" data-store-action="else-query" value="${escapeHtml(state.else.query || '')}" placeholder="问问这段记忆"><button type="button" data-action="submit-else" aria-label="发送问题">↑</button></div>
  </aside>`;
}
