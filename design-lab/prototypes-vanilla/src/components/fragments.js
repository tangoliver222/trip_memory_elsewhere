import { escapeHtml, renderMedia, renderStatus } from './primitives.js';

export function renderOriginalTile(fragment, {
  label,
  interactive = false,
  index = 0,
  className = '',
  anchorId = '',
  particleKind = 'fragment',
  particleDepth = -8,
} = {}) {
  const anchorAttributes = anchorId
    ? ` data-particle-anchor="${escapeHtml(anchorId)}" data-particle-kind="${escapeHtml(particleKind)}" data-particle-depth="${particleDepth}"`
    : '';
  const content = `${renderMedia(fragment, { className: 'original-tile__media' })}
    <span class="original-tile__shade"></span>
    <span class="original-tile__meta">${escapeHtml(label || fragment.evidencePreview)}</span>`;
  if (!interactive) return `<figure class="original-tile ${className}" style="--tile-index:${index}"${anchorAttributes}>${content}</figure>`;
  return `<button id="fragment-focus-${index}" class="original-tile ${className}" style="--tile-index:${index}" type="button" data-action="open-lens" data-fragment-id="${escapeHtml(fragment.id)}"${anchorAttributes}>${content}</button>`;
}

export function renderEvidenceCard(fragment, { title, detail, anchorId = '', particleDepth = -8 } = {}) {
  const anchorAttributes = anchorId
    ? ` data-particle-anchor="${escapeHtml(anchorId)}" data-particle-kind="fragment" data-particle-depth="${particleDepth}"`
    : '';
  return `<article class="evidence-card"${anchorAttributes}>
    <div class="evidence-card__original">${renderMedia(fragment, { className: 'evidence-card__media' })}</div>
    <div class="evidence-card__copy">
      ${renderStatus(fragment.status)}
      <h3>${escapeHtml(title || fragment.evidencePreview)}</h3>
      <p>${escapeHtml(detail || fragment.placeCandidate || '地点待确认')}</p>
    </div>
  </article>`;
}

export function renderMissingOriginal(label) {
  return `<div class="missing-original"><span>${escapeHtml(label)}</span><small>本次演示包未包含代表原件</small></div>`;
}
