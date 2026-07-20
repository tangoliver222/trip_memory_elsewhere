import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { indexes } from '../fixtures/indexes.js';
import { getMemoryView } from '../data/view-model.js';
import { getConnectionContext, getPlaceScenes, getSceneFragments } from '../selectors.js';
import { renderEvidenceCard, renderOriginalTile } from '../components/fragments.js';
import { escapeHtml, renderStatus } from '../components/primitives.js';
import { renderRelationThread, renderTimeBridge } from '../components/relations.js';

const validViews = new Set(['time', 'place', 'connection']);
const primary = (label, route, extra = '') => `<button class="primary-action" type="button" data-primary-action ${extra || `data-action="navigate" data-route="${route}"`}>${label}</button>`;
const connectionTypeLabel = Object.freeze({
  same_visit: '同一次到访',
  repeated_place: '重复地点',
  temporal_and_textual_near: '时间与文字靠近',
  place_candidate: '地点候选',
});

export function getAuthorityLink(objectType, id) {
  const roots = { scene: 'scene', place: 'place', connection: 'connection', fragment: 'fragments' };
  const root = roots[objectType];
  if (!root) return '#/world';
  if (objectType === 'fragment') return '#/world/fragments';
  return `#/world/${root}/${id}`;
}

const exploreTabs = (slug, current) => `<nav class="explore-tabs" aria-label="探索视角">
  ${['time', 'place', 'connection'].map((view) => `<button type="button" class="${view === current ? 'is-active' : ''}" data-action="navigate" data-route="#/world/city/${slug}/explore?view=${view}">${{ time: '时间', place: '地点', connection: '连接' }[view]}</button>`).join('')}
</nav>`;

function renderUnavailable(pageId, title = '对象尚未形成', detail = '当前数据中没有可回溯的来源。', route = '#/world') {
  return {
    sceneMode: 'quiet-tool',
    scenePayload: { target: 'quiet', itemCount: 0, items: [], opacity: 0.18 },
    afterRender: null,
    html: `<main class="page authority-page authority-page--empty" data-page-id="${pageId}"><header class="authority-header"><p class="eyebrow">数据尚未形成</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p></header>${primary('返回世界', route)}</main>`,
  };
}

const shortDate = (value) => {
  const match = String(value || '').match(/\d{4}-(\d{2})-(\d{2})/);
  return match ? `${match[2]} / ${match[1]}` : '时间待确认';
};

const dateRange = (members) => {
  const dates = members.map(({ capturedAt }) => String(capturedAt || '').slice(0, 10)).filter(Boolean).sort();
  if (!dates.length) return '时间待确认';
  if (dates[0] === dates.at(-1)) return shortDate(dates[0]);
  return `${shortDate(dates[0])}—${shortDate(dates.at(-1))}`;
};

function renderTimeView(context) {
  if (!context.scenes.length) return `<section class="explore-empty"><h2>${escapeHtml(context.city.name)} 还没有可探索的时间结构</h2><p>只有形成可回溯的到访或事件后，时间骨架才会出现。</p></section>`;
  const dates = [...new Set(context.scenes.map(({ date }) => date).filter(Boolean))].sort();
  return `<section class="time-explore">
    <div class="date-rail" aria-label="当前城市日期轨">${dates.map((date, index) => `<span>${escapeHtml(shortDate(date))}</span>${index < dates.length - 1 ? '<i></i>' : ''}`).join('')}</div>
    <div class="time-moments">
      ${context.scenes.map((moment, index) => `<button type="button" class="time-moment" data-particle-anchor data-particle-id="${moment.id}" data-particle-role="scene" data-particle-weight="${Math.max(1, moment.fragmentIds?.length || 1)}" data-action="navigate" data-route="${getAuthorityLink('scene', moment.id)}" style="--moment-order:${index}">
        <span>${escapeHtml(moment.timeRange)}</span><strong>${escapeHtml(moment.label)}</strong><small>${escapeHtml(moment.observation)}</small>
        ${moment.primaryAsset ? `<img src="${moment.primaryAsset}" alt="">` : '<i class="missing-dot"></i>'}
      </button>`).join('')}
    </div>
  </section>`;
}

function renderPlaceView(context) {
  if (!context.places.length) return `<section class="explore-empty"><h2>${escapeHtml(context.city.name)} 还没有可确认的地点</h2><p>没有来源支撑的位置不会被补进地图。</p></section>`;
  const confirmed = context.places.filter(({ status }) => ['confirmed', 'accepted_by_user'].includes(status)).length;
  const open = context.places.length - confirmed;
  return `<section class="place-explore">
    <div class="memory-map" aria-label="${escapeHtml(context.city.name)} 记忆地点图">
      <div class="river-line" aria-hidden="true"></div>
      ${context.places.map((place, index) => `<button class="map-place map-place--${index + 1}" type="button" data-particle-anchor data-particle-id="${place.id}" data-particle-role="place" data-particle-weight="${Math.max(1, place.visitCount || 1)}" data-action="navigate" data-route="${getAuthorityLink('place', place.id)}"><i></i><span>${escapeHtml(place.name)}</span><small>${escapeHtml(place.area)}</small></button>`).join('')}
    </div>
    <div class="map-caption"><p>地图只显示有来源支撑的地点与候选，不补全缺失轨迹。</p><span>${confirmed} 已确认${open ? ` · ${open} 待确认` : ''}</span></div>
  </section>`;
}

function renderConnectionView(context) {
  if (!context.connections.length) return `<section class="explore-empty"><h2>${escapeHtml(context.city.name)} 还没有可检查的连接</h2><p>碎片之间尚未形成有来源支撑的关系。</p></section>`;
  const pathMarkup = context.connections.slice(1).map((connection, index) => {
    const startY = 110 + index * 78;
    const endY = 160 + (index % 3) * 96;
    return `<path class="${['suggested', 'unresolved', 'conflicted'].includes(connection.status) ? 'is-open' : ''}" d="M${120 + index * 45} ${startY} C 340 ${Math.max(30, startY - 80)}, 610 ${endY + 80}, ${850 - index * 28} ${endY}"/>`;
  }).join('');
  return `<section class="connection-explore">
    <div class="relation-space">
      ${context.connections.map((connection, index) => `<button class="relation-node relation-node--${index + 1} relation-node--${connection.status}" type="button" data-particle-anchor data-particle-id="${connection.id}" data-particle-role="relation" data-particle-weight="${Math.max(1, connection.evidence.length)}" data-action="navigate" data-route="${getAuthorityLink('connection', connection.id)}"><span>${escapeHtml(connectionTypeLabel[connection.type] || '连接')}</span><small>${connection.evidence.length} 条来源说明</small></button>`).join('')}
      <svg class="relation-paths" aria-hidden="true" viewBox="0 0 1000 540" preserveAspectRatio="none">${pathMarkup}</svg>
    </div>
    <div class="relation-legend"><span><i></i>已确认</span><span><i></i>来源支持</span><span><i></i>仍待判断</span></div>
  </section>`;
}

export function renderExplore(routeId = 'bangkok', requestedView = 'time') {
  const context = getMemoryView().city(routeId);
  if (!context) return renderUnavailable('world-explore', '还没有形成这座城市', '当前数据中没有这个城市的旅程或来源。');
  const view = validViews.has(requestedView) ? requestedView : 'time';
  const content = view === 'time' ? renderTimeView(context) : (view === 'place' ? renderPlaceView(context) : renderConnectionView(context));
  const target = { time: 'timeline', place: 'map', connection: 'relations' }[view];
  const sourceItems = { time: context.scenes, place: context.places, connection: context.connections }[view];
  const items = sourceItems.map((item) => ({ id: item.id, role: view === 'time' ? 'scene' : view === 'place' ? 'place' : 'relation', status: item.status }));
  const first = sourceItems[0] || null;
  const primaryRoute = first ? getAuthorityLink(view === 'time' ? 'scene' : view === 'place' ? 'place' : 'connection', first.id) : `#/world/city/${context.city.slug}`;
  const primaryLabel = first ? `打开${view === 'time' ? '场景' : view === 'place' ? '地点' : '连接'} · ${escapeHtml(first.label || first.name || connectionTypeLabel[first.type] || '')}` : '返回城市世界';
  return {
    sceneMode: 'city',
    scenePayload: {
      target,
      view,
      cityId: context.city.id,
      itemCount: items.length,
      items,
      days: view === 'time' ? context.scenes : undefined,
      places: view === 'place' ? context.places : undefined,
      relations: view === 'connection' ? context.connections : undefined,
    },
    afterRender: null,
    html: `<main class="page explore-page explore-page--${view}" data-page-id="world-explore">
      <header class="explore-header"><div><p class="eyebrow">${escapeHtml(context.city.name)} · 三个视角</p><h1>${{ time: '这些日子如何发生', place: '哪些地点反复出现', connection: '原件为什么靠近' }[view]}</h1></div>${exploreTabs(context.city.slug, view)}</header>
      ${content}
      ${primary(primaryLabel, primaryRoute)}
    </main>`,
  };
}

function capsuleAfterRender({ pageRoot }) {
  if (typeof window === 'undefined' || !pageRoot) return null;
  gsap.registerPlugin(ScrollTrigger);
  const context = gsap.context(() => {
    gsap.utils.toArray('.capsule-chapter').forEach((chapter) => {
      gsap.fromTo(chapter.querySelectorAll('.capsule-reveal'),
        { opacity: 0, y: 36 },
        { opacity: 1, y: 0, stagger: 0.12, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: chapter, start: 'top 72%', once: true } });
    });
  }, pageRoot);
  return () => context.revert();
}

function renderEmptyCapsule(context) {
  return {
    sceneMode: 'capsule',
    scenePayload: { target: 'city-field', cityId: context.city.id, itemCount: 0, items: [], chapters: 0 },
    afterRender: null,
    html: `<main class="page capsule-page capsule-page--empty" data-page-id="world-capsule"><header class="authority-header"><p class="eyebrow">CITY CAPSULE</p><h1>${escapeHtml(context.city.name)} 的 Capsule 尚未形成</h1><p>当前没有可用于章节策展的代表原件；已有总数不会被冒充成可见证据。</p></header>${primary('返回城市世界', `#/world/city/${context.city.slug}`)}</main>`,
  };
}

function clusterTitle(context, cluster) {
  const note = context.notes.find((item) => item.type === 'user_name' && item.related?.includes(cluster.id));
  return note?.text || cluster.label;
}

export function renderCapsule(routeId = 'bangkok') {
  const context = getMemoryView().city(routeId);
  if (!context) return renderUnavailable('world-capsule', '还没有形成这座城市', '没有城市对象就不会生成借来的 Capsule。');
  const chapterClusters = context.clusters.slice(0, 3).map((cluster) => ({ ...cluster, fragments: cluster.fragments.slice(0, 4) }));
  const capsuleFragments = chapterClusters.flatMap(({ fragments: members }) => members);
  if (!capsuleFragments.length) return renderEmptyCapsule(context);
  const coverAsset = context.city.representativeAsset || capsuleFragments.find(({ asset }) => asset)?.asset || null;
  const cityNote = context.notes.find((item) => item.type === 'city_reflection' && item.related?.includes(context.city.journeyId));
  const coverLine = cityNote?.text || context.city.fact;
  const chapters = chapterClusters.map((cluster, index) => {
    const place = context.places.find(({ id }) => id === cluster.id);
    const factualCopy = place?.fact || `${cluster.fragments.length} 个可见原件共同支持这一组；没有来源的部分保持空缺。`;
    return `<section class="capsule-chapter capsule-chapter--data-${index + 1}">
      <div class="capsule-chapter__title capsule-reveal"><p>CHAPTER ${String(index + 1).padStart(2, '0')}</p><h2>${escapeHtml(clusterTitle(context, cluster))}</h2><span>${escapeHtml(cluster.label)} · ${escapeHtml(dateRange(cluster.fragments))}</span></div>
      <div class="capsule-spread capsule-reveal">${cluster.fragments.map((item, tileIndex) => renderOriginalTile(item, { interactive: true, index: tileIndex, label: item.evidencePreview })).join('')}</div>
      <p class="capsule-prose capsule-reveal">${escapeHtml(factualCopy)}</p>
    </section>`;
  }).join('');
  return {
    sceneMode: 'capsule',
    scenePayload: {
      target: 'city-field',
      chapters: chapterClusters.length,
      cityId: context.city.id,
      itemCount: capsuleFragments.length,
      items: capsuleFragments.map((fragment) => ({ id: fragment.id, role: 'fragment', clusterId: fragment.placeId || fragment.sceneId || 'unplaced', status: fragment.status })),
    },
    afterRender: capsuleAfterRender,
    html: `<main class="capsule-page" data-page-id="world-capsule">
      <header class="capsule-cover">${coverAsset ? `<div class="capsule-cover__image"><img src="${coverAsset}" alt="${escapeHtml(context.city.name)} 代表原件"></div>` : ''}<div class="capsule-cover__copy capsule-reveal"><p>ELSEWHERE CITY CAPSULE</p><h1>${escapeHtml(context.city.name)}</h1><span>${escapeHtml(context.city.period || dateRange(capsuleFragments))}</span><blockquote>“${escapeHtml(coverLine)}”</blockquote></div></header>
      ${chapters}
      <div class="capsule-actions">${primary('分享这段 Capsule', '', `data-action="open-share" data-title="${escapeHtml(context.city.name)} · City Capsule" data-text="${escapeHtml(coverLine)}"`)}<button class="text-action" type="button" data-action="navigate" data-route="#/world/city/${context.city.slug}">回到城市世界</button></div>
    </main>`,
  };
}

function cityRouteForJourney(journeyId) {
  const city = getMemoryView().world.cities.find((item) => item.journeyId === journeyId);
  return city ? `#/world/city/${city.slug}` : '#/world';
}

export function renderSceneDetail(sceneId) {
  const moment = indexes.scenesById[sceneId];
  if (!moment) return renderUnavailable('world-scene-detail');
  const originals = getSceneFragments(moment.id);
  const place = indexes.placesById[moment.placeId] || null;
  const backRoute = cityRouteForJourney(moment.journeyId);
  const factBlocks = [
    place ? `<div><span>地点</span><button type="button" data-action="navigate" data-route="${getAuthorityLink('place', place.id)}">${escapeHtml(place.name)} →</button></div>` : '',
    `<div><span>时间范围</span><strong>${escapeHtml(moment.timeRange)}</strong></div>`,
    `<div><span>状态</span>${renderStatus(moment.status)}</div>`,
  ].join('');
  const primaryAction = originals[0]
    ? primary('查看原件', '#/world/fragments', `data-action="open-lens" data-fragment-id="${originals[0].id}"`)
    : primary('返回城市世界', backRoute);
  return {
    sceneMode: 'connection',
    scenePayload: {
      target: 'timeline',
      sceneId: moment.id,
      itemCount: originals.length,
      items: originals.map((fragment) => ({ id: fragment.id, role: 'evidence', clusterId: moment.id, status: fragment.status })),
      days: [moment.date],
    },
    afterRender: null,
    html: `<main class="page authority-page moment-detail" data-page-id="world-scene-detail">
      <section class="moment-evidence" data-authority-evidence>${originals.map((item, index) => `<div class="moment-evidence__item"><span>${escapeHtml(item.capturedAt.slice(11, 16))}</span>${renderOriginalTile(item, { interactive: true, index, label: item.evidencePreview })}</div>`).join('')}${originals.length > 1 ? renderTimeBridge({ from: originals[0].capturedAt.slice(11, 16), to: originals[1].capturedAt.slice(11, 16), duration: `${Math.max(1, Math.round((new Date(originals[1].capturedAt) - new Date(originals[0].capturedAt)) / 60000))} 分钟` }) : ''}</section>
      <header class="authority-header"><p class="eyebrow">一次具体事件 · ${escapeHtml(moment.date)}</p><h1>${escapeHtml(moment.label)}</h1><p>${escapeHtml(moment.observation)}</p></header>
      <section class="authority-facts">${factBlocks}</section>
      ${primaryAction}
    </main>`,
  };
}

export function renderPlaceDetail(placeId) {
  const place = indexes.placesById[placeId];
  if (!place) return renderUnavailable('world-place-detail');
  const visits = getPlaceScenes(place.id);
  const backRoute = cityRouteForJourney(place.journeyId);
  const visitCount = place.visitCount ?? visits.length;
  return {
    sceneMode: 'city',
    scenePayload: {
      target: 'map',
      placeId: place.id,
      itemCount: visits.length,
      items: visits.map((visit) => ({ id: visit.id, role: 'scene', clusterId: place.id, status: visit.status })),
      places: [place],
    },
    afterRender: null,
    html: `<main class="page authority-page place-detail" data-page-id="world-place-detail">
      <div class="place-anchor" data-particle-anchor data-particle-id="${place.id}" data-particle-role="place" data-particle-weight="${Math.max(1, visitCount || 1)}" aria-hidden="true"><i></i><i></i><i></i><span>${escapeHtml(visitCount || '—')}</span></div>
      <header class="authority-header"><p class="eyebrow">${escapeHtml(place.area)} · ${escapeHtml(place.dateRange)}</p><h1>${escapeHtml(place.name)}</h1><p>${escapeHtml(place.fact)}</p></header>
      <section class="visit-list"><h2>${visitCount} 次${visits.length ? '可回溯到访' : '出现'}</h2>${visits.map((visit) => `<button type="button" data-particle-anchor data-particle-id="${visit.id}" data-particle-role="scene" data-particle-weight="1" data-action="navigate" data-route="${getAuthorityLink('scene', visit.id)}"><span>${escapeHtml(shortDate(visit.date))}</span><strong>${escapeHtml(visit.label)}</strong><small>${escapeHtml(visit.timeRange)}</small></button>`).join('')}</section>
      <p class="authority-source-note">这里只汇总已有原件和已确认的地点关系；候选内容仍保持待确认。</p>
      ${primary('在时间中查看', `${backRoute}/explore?view=time`)}
    </main>`,
  };
}

export function renderConnectionDetail(connectionId) {
  const context = getConnectionContext(connectionId);
  if (!context) return renderUnavailable('world-connection-detail');
  const { connection, from, to, entity } = context;
  const originals = [...from, ...to];
  const humanType = connectionTypeLabel[connection.type] || '来源之间的连接';
  const gap = connection.uncertainty || '当前来源没有明显缺口。';
  const firstCity = originals.map(({ cityId }) => getMemoryView().world.cities.find(({ id }) => id === cityId)).find(Boolean);
  const backRoute = firstCity ? `#/world/city/${firstCity.slug}/explore?view=connection` : '#/world';
  return {
    sceneMode: 'connection',
    scenePayload: {
      target: 'relations',
      state: connection.status,
      itemCount: originals.length,
      items: originals.map((fragment) => ({ id: fragment.id, role: 'evidence', status: fragment.status })),
      relations: [connection],
    },
    afterRender: null,
    html: `<main class="page authority-page connection-detail" data-page-id="world-connection-detail">
      <section class="connection-originals" data-authority-evidence>${originals.length ? originals.map((item) => renderEvidenceCard(item, { title: item.evidencePreview, detail: item.placeCandidate })).join('') : '<div class="missing-original">原件尚未加入当前数据</div>'}</section>
      ${renderRelationThread({ label: humanType, evidence: connection.evidence, uncertainty: gap, state: connection.status })}
      <header class="authority-header"><p class="eyebrow">连接详情 · ${connection.status === 'confirmed' ? '已确认' : connection.status === 'suggested' ? '等待判断' : '仍未安放'}</p><h1>${escapeHtml(humanType)}</h1><p>${entity ? `共同指向 ${escapeHtml(entity.name)}，关系强度只由上方来源支撑。` : '这条关系只由上方原件来源支撑。'}</p></header>
      <section class="connection-gap"><span>仍缺少</span><p>${escapeHtml(gap)}</p></section>
      <div class="connection-actions"><button type="button" data-action="connection-decision" data-value="confirmed">确认这条连接</button><button type="button" data-action="connection-decision" data-value="rejected">保持分开</button></div>
      ${primary('回到连接视角', backRoute)}
    </main>`,
  };
}
