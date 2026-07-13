import { escapeHtml } from './primitives.js';

export function renderRelationThread({ label, evidence = [], uncertainty = null, state = 'confirmed' }) {
  return `<div class="relation-thread relation-thread--${escapeHtml(state)}">
    <div class="relation-thread__line" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="relation-thread__copy">
      <p class="eyebrow">${escapeHtml(label)}</p>
      <ul>${evidence.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      ${uncertainty ? `<p class="relation-thread__gap">仍缺少：${escapeHtml(uncertainty)}</p>` : ''}
    </div>
  </div>`;
}

export function renderTimeBridge({ from, to, duration }) {
  return `<div class="time-bridge" aria-label="${escapeHtml(from)} 到 ${escapeHtml(to)}，相隔 ${escapeHtml(duration)}">
    <span>${escapeHtml(from)}</span><div><i></i></div><strong>相隔 ${escapeHtml(duration)}</strong><div><i></i></div><span>${escapeHtml(to)}</span>
  </div>`;
}
