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
  const label = fragment?.requiredAsset
    ? '原件尚未加入演示包'
    : '原件待整理';
  return `<div class="${escapeHtml(className)} memory-original--missing" role="img" aria-label="${label}"><span>${label}</span></div>`;
}

export const renderStatus = (status) => {
  const labels = { confirmed: '已确认', supported: '来源支持', unresolved: '待确认', suggested: '候选' };
  return `<span class="status status--${escapeHtml(status)}">${labels[status] || escapeHtml(status)}</span>`;
};
