import { escapeHtml } from '../components/primitives.js';

export function renderSharePreview(payload = {}) {
  return `<section class="share-preview spatial-overlay" role="dialog" aria-modal="true" aria-label="分享预览">
    <button class="overlay-scrim" type="button" data-action="close-overlay" aria-label="关闭分享预览"></button>
    <article class="share-preview__panel">
      <header class="overlay-header"><div><p class="eyebrow">仅导出你选择的内容</p><h2>${escapeHtml(payload.title || 'Elsewhere 记忆切片')}</h2></div><button class="icon-button" type="button" data-action="close-overlay">×</button></header>
      <div class="share-preview__card"><p>${escapeHtml(payload.text || '一段由原件、时间与地点共同组成的旅行记忆。')}</p></div>
      <button class="primary-action" type="button" data-action="confirm-share">保存分享图</button>
    </article>
  </section>`;
}
