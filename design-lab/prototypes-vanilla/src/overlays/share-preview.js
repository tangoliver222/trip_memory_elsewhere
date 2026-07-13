import { escapeHtml } from '../components/primitives.js';
import { getShareModel } from '../privacy/models.js';

export function renderSharePreview(payload = {}) {
  const model = payload.model || getShareModel(payload.targetId || 'journey-bangkok-2024-autumn', payload.privacy);
  const title = payload.title || model.visibleContent.title;
  return `<section class="share-preview spatial-overlay" role="dialog" aria-modal="true" aria-label="分享预览">
    <button class="overlay-scrim" type="button" data-action="close-overlay" aria-label="关闭分享预览背景"></button>
    <article class="share-preview__panel">
      <header class="overlay-header"><div><p class="eyebrow">只导出你选择的内容</p><h2>${escapeHtml(title)}</h2></div><button class="icon-button" type="button" data-action="close-overlay" aria-label="关闭分享预览">×</button></header>
      <div class="share-preview__card"><div class="share-preview__particles" aria-hidden="true"><i></i><i></i><i></i></div><p>${escapeHtml(payload.text || model.visibleContent.summary)}</p><span>ELSEWHERE · PRIVATE MEMORY CUT</span></div>
      <fieldset class="share-privacy"><legend>分享前隐藏</legend><label><input type="checkbox" checked disabled>金额</label><label><input type="checkbox" checked disabled>精确地址</label><label><input type="checkbox" checked disabled>私人笔记</label></fieldset>
      <p class="share-note">这些默认项已应用到预览；原件本身不会被修改。</p>
      <button class="primary-action" type="button" data-action="confirm-share">保存分享图</button>
    </article>
  </section>`;
}
