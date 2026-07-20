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

const timeOf = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' }).format(date);
};

const dayOf = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'Asia/Bangkok' }).format(date).toUpperCase();
};

/**
 * 工艺化原件：小票 / 票根 / 菜单 / 截图地图 / 文字。
 * 只渲染 fixture 中真实存在的 OCR 文本、商户、时间与金额，
 * 不伪造照片，也不使用空 Pending 占位。
 */
export function renderArtifact(fragment, { className = '' } = {}) {
  const type = fragment?.type;
  const merchant = escapeHtml((fragment?.placeCandidate || '').split('·')[0].trim() || '未识别商户');
  const day = dayOf(fragment?.capturedAt);
  const time = timeOf(fragment?.capturedAt);
  const preview = escapeHtml(fragment?.evidencePreview || '');
  const amountMatch = /([0-9]+)\s*(THB|฿|元)/i.exec(fragment?.evidencePreview || '');
  const amount = amountMatch ? `${amountMatch[1]} ${amountMatch[2].toUpperCase()}` : null;

  if (type === 'receipt') {
    return `<div class="artifact artifact--receipt ${className}" role="img" aria-label="${preview}">
      <strong>${merchant}</strong>
      <span class="artifact__rule"></span>
      <em>${day}${time ? ` · ${time}` : ''}</em>
      ${amount ? `<span class="artifact__rule artifact__rule--dashed"></span><b>TOTAL <i>${amount}</i></b>` : ''}
      <small>OCR 文本 · 原件待整理</small>
    </div>`;
  }
  if (type === 'ticket') {
    return `<div class="artifact artifact--ticket ${className}" role="img" aria-label="${preview}">
      <span class="artifact__punch" aria-hidden="true"></span>
      <div><strong>${merchant}</strong><em>${day}</em></div>
      <b>${time || '--:--'}</b>
      <small>OCR 文本 · 原件待整理</small>
    </div>`;
  }
  if (type === 'menu') {
    return `<div class="artifact artifact--menu ${className}" role="img" aria-label="${preview}">
      <strong>MENU</strong>
      <span class="artifact__rule"></span>
      <em>${preview}</em>
      <small>OCR 预览 · 原件待整理</small>
    </div>`;
  }
  if (type === 'screenshot') {
    return `<div class="artifact artifact--map ${className}" role="img" aria-label="${preview}">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <path d="M8 18 L92 12 M6 42 L94 38 M10 68 L90 66 M4 88 L96 84" />
        <path d="M24 4 L28 96 M52 2 L50 98 M78 6 L74 94" />
        <path class="artifact__route" d="M28 74 C 42 60, 55 52, 51 30" />
        <circle class="artifact__pin" cx="51" cy="30" r="3.4" />
      </svg>
      <em>${preview}</em>
    </div>`;
  }
  if (type === 'text') {
    return `<div class="artifact artifact--note ${className}" role="img" aria-label="${preview}"><em>${preview}</em></div>`;
  }
  return `<div class="artifact artifact--generic ${className}" role="img" aria-label="${preview}"><em>${preview || '原件待整理'}</em></div>`;
}

export function renderMedia(fragment, { className = 'memory-original', decorative = false } = {}) {
  if (fragment?.asset) {
    return `<img class="${escapeHtml(className)}" src="${escapeHtml(fragment.asset)}" alt="${decorative ? '' : escapeHtml(fragment.evidencePreview)}">`;
  }
  return renderArtifact(fragment, { className: escapeHtml(className) });
}

export const renderStatus = (status) => {
  const labels = {
    confirmed: '已确认',
    supported: '来源支持',
    unresolved: '待确认',
    suggested: '候选',
    processing: '整理中',
    failed: '处理失败',
  };
  return `<span class="status status--${escapeHtml(status)}">${labels[status] || escapeHtml(status)}</span>`;
};
