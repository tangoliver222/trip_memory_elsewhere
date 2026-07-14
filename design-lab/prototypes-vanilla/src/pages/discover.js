import { discoveries } from '../fixtures/data.js';
import { getDiscoveryContext } from '../selectors.js';
import { escapeHtml, renderMedia } from '../components/primitives.js';

const compositionMap = Object.freeze({
  repeated_place: 'repeat',
  cross_journey: 'cross-journey',
  cross_media_visit: 'cross-media',
  open_thread: 'unresolved',
});

export const getDiscoveryComposition = (type) => compositionMap[type] || 'unresolved';

const primary = (label, route, extra = '') => `<button class="primary-action" type="button" data-primary-action ${extra || `data-action="navigate" data-route="${route}"`}>${label}</button>`;

const statusLabel = { new: '新显影', supported: '来源支持', unresolved: '仍有缺口' };

const renderDiscoverySource = (fragment) => fragment.asset
  ? renderMedia(fragment, { className: 'discovery-time-node__media' })
  : `<div class="discovery-time-node__media discovery-source-record" role="img" aria-label="${escapeHtml(fragment.evidencePreview)}"><span>${escapeHtml(fragment.type.toUpperCase())}</span><strong>${escapeHtml(fragment.evidencePreview.split(' · ')[0])}</strong><small>${escapeHtml(fragment.evidencePreview.split(' · ').slice(1).join(' · '))}</small></div>`;

export function renderDiscoverHome(state) {
  const requested = state.discoveryFilter;
  const activeIndex = requested === 'saved' ? 1 : requested === 'unresolved' ? 2 : 0;
  const discovery = discoveries[activeIndex] || discoveries[0];
  const context = getDiscoveryContext(discovery.id);
  const composition = getDiscoveryComposition(discovery.type);
  return {
    sceneMode: 'discovery', scenePayload: { target: 'discovery', composition, discoveryId: discovery.id }, afterRender: null,
    html: `<main class="page discover-home" data-page-id="discover-home">
      <header class="discover-header"><div><p class="eyebrow">少量值得重新看的联系</p><h1>发现不是结论，<br>而是来源之间新长出的关系</h1></div><div class="discover-filters">${[['all','此刻'],['saved','已保存'],['unresolved','待确认']].map(([value,label]) => `<button class="${requested === value ? 'is-active' : ''}" type="button" data-action="set-discovery-filter" data-value="${value}">${label}</button>`).join('')}</div></header>
      <article class="discovery-feature discovery-feature--${composition}">
        <div class="featured-space">
          ${context.fragments.slice(0, 4).map((fragment, index) => `<div class="feature-source feature-source--${index + 1}" data-particle-anchor="discover-source-${index + 1}" data-particle-kind="fragment" data-particle-depth="${[-18, -9, -2, -25][index]}">${renderMedia(fragment, { className: 'feature-source__media' })}<span>${escapeHtml(fragment.evidencePreview)}</span></div>`).join('')}
          <svg aria-hidden="true" viewBox="0 0 900 520"><path d="M150 110 C 270 250, 300 90, 440 250 S 650 440, 770 180"/><circle cx="450" cy="255" r="60"/></svg>
          <div class="feature-entity" data-particle-anchor="discover-feature-entity" data-particle-kind="entity" data-particle-depth="-6"><i></i><span>${escapeHtml(context.entity?.name || '地点仍待确认')}</span></div>
        </div>
        <div class="featured-copy"><span>${statusLabel[discovery.status]} · ${escapeHtml(discovery.timeRange)}</span><h2>${escapeHtml(discovery.title)}</h2><p>${escapeHtml(discovery.observation)}</p><button type="button" data-action="navigate" data-route="#/discover/${discovery.id}">打开这次显影 →</button></div>
      </article>
      <div class="discovery-pager" aria-label="发现位置">${discoveries.map((item, index) => `<button type="button" data-action="navigate" data-route="#/discover/${item.id}" class="${index === activeIndex ? 'is-active' : ''}" aria-label="${escapeHtml(item.title)}"></button>`).join('')}</div>
      ${primary('进入当前发现', `#/discover/${discovery.id}`)}
    </main>`,
  };
}

const groupByDate = (fragments) => {
  const groups = new Map();
  fragments.forEach((fragment) => {
    const date = fragment.capturedAt.slice(0, 10);
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date).push(fragment);
  });
  return [...groups.entries()];
};

const dateLabel = (date) => {
  const [, month, day] = date.split('-');
  return `${day} ${month === '10' ? 'OCT' : month}`;
};

export function renderDiscoveryDetail(discoveryId, state) {
  const context = getDiscoveryContext(discoveryId) || getDiscoveryContext(discoveries[0].id);
  const { discovery, fragments, connections, entity, userNotes } = context;
  const composition = getDiscoveryComposition(discovery.type);
  const groups = groupByDate(fragments);
  const saved = discovery.saved || state.savedDiscoveryIds?.includes(discovery.id);
  return {
    sceneMode: 'discovery',
    scenePayload: { target: 'discovery', composition, discoveryId: discovery.id, sourceCount: fragments.length },
    afterRender: null,
    html: `<main class="page discovery-detail discovery-detail--${composition}" data-page-id="discover-detail" data-visual-grade="S">
      <section class="discovery-growth" data-discovery-evidence aria-label="发现证据先于标题出现">
        <div class="discovery-time-nodes">
          ${groups.map(([date, originals], groupIndex) => `<article class="discovery-time-node discovery-time-node--${groupIndex + 1}" style="--date-index:${groupIndex}"><time>${dateLabel(date)}</time><div>${originals.map((fragment, index) => `<button type="button" data-action="open-lens" data-fragment-id="${fragment.id}" id="discovery-source-${groupIndex}-${index}" data-particle-anchor="discovery-source-${groupIndex}-${index}" data-particle-kind="fragment" data-particle-depth="${[-22, -10, 2][groupIndex] || -8}">${renderDiscoverySource(fragment)}<span>${escapeHtml(fragment.evidencePreview)}</span></button>`).join('')}</div></article>`).join('')}
        </div>
        <div class="discovery-relation-forming"><span>关系正在成立</span><svg viewBox="0 0 1000 220" preserveAspectRatio="none" aria-hidden="true"><path d="M80 105 C 250 10, 320 210, 500 105 S 760 10, 920 105"/></svg><div class="relation-particles"><i></i><i></i><i></i><i></i></div></div>
        <div class="discovery-entity-forming" data-particle-anchor="discovery-shared-entity" data-particle-kind="entity" data-particle-depth="-5"><i aria-hidden="true"></i><span>共同地点</span><strong>${escapeHtml(entity?.name || '地点仍待确认')}</strong></div>
      </section>
      <header class="discovery-title-reveal"><p class="eyebrow">${statusLabel[discovery.status]} · ${escapeHtml(discovery.timeRange)}</p><h1>${escapeHtml(discovery.title)}</h1><p>${escapeHtml(discovery.observation)}</p></header>
      <section class="discovery-explanation"><div><span>关系类型</span><strong>${{ repeat: '同一地点反复出现', 'cross-media': '不同媒介靠近同一次到访', unresolved: '仍未完成的线索', 'cross-journey': '跨旅程联系' }[composition]}</strong></div><div><span>来源如何支持</span><ul>${connections.flatMap((connection) => connection.evidence).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>${discovery.uncertainty ? `<div class="is-uncertain"><span>仍缺少</span><p>${escapeHtml(discovery.uncertainty)}</p></div>` : ''}</section>
      ${userNotes.length ? `<blockquote class="discovery-user-note">“${escapeHtml(userNotes[0].text)}”<span>你的文字</span></blockquote>` : ''}
      <div class="discovery-detail__actions"><button type="button" data-action="save-discovery" data-discovery-id="${discovery.id}">${saved ? '已保存' : '保存发现'}</button><button type="button" data-action="open-share" data-title="${escapeHtml(discovery.title)}" data-text="${escapeHtml(discovery.observation)}">分享一张来源卡片</button></div>
      ${primary('回到发现', '#/discover')}
    </main>`,
  };
}
