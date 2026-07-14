export const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

export function formatMoment(value) {
  if (!value) return '时间待确认';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Bangkok',
  }).format(date);
}

export function renderMedia(fragment, { className = 'memory-original', decorative = false } = {}) {
  if (fragment?.asset) {
    return `<img class="${escapeHtml(className)}" src="${escapeHtml(fragment.asset)}" alt="${decorative ? '' : escapeHtml(fragment.evidencePreview)}">`;
  }
  const sourceState = fragment?.requiredAsset ? '原件未随演示包提供' : '来源记录待整理';
  const label = fragment?.evidencePreview ? `${fragment.evidencePreview} · ${sourceState}` : sourceState;
  return `<div class="${escapeHtml(className)} memory-original--missing" role="img" aria-label="${escapeHtml(label)}" data-source-unavailable><span>${escapeHtml(label)}</span></div>`;
}

export const renderStatus = (status) => {
  const labels = { confirmed: '已确认', supported: '来源支持', unresolved: '待确认', suggested: '候选' };
  return `<span class="status status--${escapeHtml(status)}">${labels[status] || escapeHtml(status)}</span>`;
};
