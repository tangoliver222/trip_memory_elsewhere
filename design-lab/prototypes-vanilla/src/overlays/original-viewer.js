import { escapeHtml, renderMedia } from '../components/primitives.js';

export function renderOriginalViewer(context) {
  if (!context?.fragment) return '';
  return `<section class="original-viewer spatial-overlay" role="dialog" aria-modal="true" aria-label="原件查看器">
    <div class="original-viewer__chrome">
      <p>${escapeHtml(context.fragment.evidencePreview)}</p>
      <button class="icon-button" type="button" data-action="close-overlay" aria-label="返回碎片镜头">×</button>
    </div>
    <div class="original-viewer__stage">${renderMedia(context.fragment, { className: 'original-viewer__media' })}</div>
  </section>`;
}
