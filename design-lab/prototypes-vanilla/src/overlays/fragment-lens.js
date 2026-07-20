import { escapeHtml, formatMoment, renderMedia, renderStatus } from '../components/primitives.js';

export function renderFragmentLens(context) {
  if (!context?.fragment) return '';
  const { fragment, city, journey, scene, place, connections, userNotes } = context;
  const relationEvidence = connections.flatMap((connection) => connection.evidence || []);
  const importance = scene?.observation || relationEvidence[0] || '这是这段旅程中的一份原始来源。';
  const note = userNotes?.[0]?.text;
  const trace = Array.isArray(fragment.processingTrace) ? fragment.processingTrace : [];

  return `<section class="fragment-lens spatial-overlay" role="dialog" aria-modal="true" aria-labelledby="fragment-lens-title">
    <button class="overlay-scrim" type="button" data-action="close-overlay" aria-label="关闭碎片镜头"></button>
    <article class="fragment-lens__panel" data-particle-scroll-root>
      <header class="overlay-header">
        <div>
          <p class="eyebrow">从记忆场中提取</p>
          <h2 id="fragment-lens-title">${escapeHtml(fragment.evidencePreview)}</h2>
        </div>
        <button class="icon-button" type="button" data-action="close-overlay" aria-label="关闭">×</button>
      </header>
      <div class="fragment-lens__body">
        <button class="fragment-lens__original" type="button" data-particle-anchor data-particle-id="lens-original" data-particle-role="fragment" data-particle-weight="2" data-action="open-original" aria-label="查看原件">
          ${renderMedia(fragment, { className: 'fragment-lens__image' })}
          <span>查看原件</span>
        </button>
        <div class="fragment-lens__identity">
          ${renderStatus(fragment.status)}
          <p class="fragment-lens__moment">${formatMoment(fragment.capturedAt)}</p>
          <h3>${escapeHtml(place?.name || fragment.placeCandidate || '地点待确认')}</h3>
          <p>${escapeHtml(place?.area || city?.localizedName || '旅行世界')}</p>
        </div>
        <div class="evidence-stack">
          <section><span>属于哪里</span><p>${escapeHtml(journey?.label || city?.name || '旅程待确认')} · ${escapeHtml(scene?.label || '场景待整理')}</p></section>
          <section><span>为什么重要</span><p>${escapeHtml(importance)}</p></section>
          ${relationEvidence.length ? `<section><span>与它靠近的来源</span><ul>${relationEvidence.slice(0, 3).map((item) => `<li>${escapeHtml(item.replace('时间相差：', '相隔 '))}</li>`).join('')}</ul></section>` : ''}
          ${note ? `<section class="user-writing"><span>你写过</span><p>“${escapeHtml(note)}”</p></section>` : ''}
        </div>
        ${trace.length > 0 ? `<section class="fragment-provenance" aria-label="原件处理轨迹">
          <div><span>原件如何进入记忆空间</span><p>只显示服务器已持久化的结果。</p></div>
          <ol>${trace.map((stage) => `<li class="fragment-provenance__stage fragment-provenance__stage--${escapeHtml(stage.status)}"><i></i><div><strong>${escapeHtml(stage.label)}</strong><small>${escapeHtml(stage.provider)} · ${escapeHtml(stage.detail)}</small></div></li>`).join('')}</ol>
          ${fragment.ocr ? `<div class="fragment-ocr"><span>Google Document AI · ${fragment.ocr.pageCount} 页</span><p>${escapeHtml(fragment.ocr.textExcerpt || '没有足够文字')}</p></div>` : ''}
        </section>` : ''}
      </div>
    </article>
  </section>`;
}
