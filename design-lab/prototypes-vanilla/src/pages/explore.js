import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { connections, fragments, places, scenes, userNotes } from '../fixtures/data.js';
import { indexes } from '../fixtures/indexes.js';
import { getCityByRouteId, getConnectionContext, getPlaceScenes, getSceneFragments } from '../selectors.js';
import { renderEvidenceCard, renderOriginalTile } from '../components/fragments.js';
import { escapeHtml, renderMedia, renderStatus } from '../components/primitives.js';
import { renderRelationThread, renderTimeBridge } from '../components/relations.js';

const validViews = new Set(['time', 'place', 'connection']);
const primary = (label, route, extra = '') => `<button class="primary-action" type="button" data-primary-action ${extra || `data-action="navigate" data-route="${route}"`}>${label}</button>`;

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

function renderTimeView(slug) {
  return `<section class="time-explore">
    <div class="date-rail" aria-label="可拖动日期轨"><span>12 OCT</span><i></i><span>16 OCT</span><i></i><span>17 OCT</span><i></i><span>18 OCT</span><i></i><span>19 OCT</span></div>
    <div class="time-moments">
      ${scenes.map((moment, index) => `<button type="button" class="time-moment" data-action="navigate" data-route="${getAuthorityLink('scene', moment.id)}" style="--moment-order:${index}">
        <span>${escapeHtml(moment.timeRange)}</span><strong>${escapeHtml(moment.label)}</strong><small>${escapeHtml(moment.observation)}</small>
        ${moment.primaryAsset ? `<img src="${moment.primaryAsset}" alt="">` : '<i class="missing-dot"></i>'}
      </button>`).join('')}
    </div>
  </section>`;
}

function renderPlaceView() {
  return `<section class="place-explore">
    <div class="memory-map" aria-label="Bangkok 记忆地点图">
      <div class="river-line" aria-hidden="true"></div>
      ${places.map((place, index) => `<button class="map-place map-place--${index + 1}" type="button" data-action="navigate" data-route="${getAuthorityLink('place', place.id)}"><i></i><span>${escapeHtml(place.name)}</span><small>${escapeHtml(place.area)}</small></button>`).join('')}
    </div>
    <div class="map-caption"><p>地图只显示有来源支撑的地点与候选，不补全缺失轨迹。</p><span>3 已确认 · 1 候选</span></div>
  </section>`;
}

function renderConnectionView() {
  return `<section class="connection-explore">
    <div class="relation-space">
      ${connections.map((connection, index) => `<button class="relation-node relation-node--${index + 1} relation-node--${connection.status}" type="button" data-action="navigate" data-route="${getAuthorityLink('connection', connection.id)}"><span>${{ same_visit: '同一次到访', repeated_place: '重复地点', temporal_and_textual_near: '时间与文字靠近', place_candidate: '地点候选' }[connection.type]}</span><small>${connection.evidence.length} 条来源说明</small></button>`).join('')}
      <svg class="relation-paths" aria-hidden="true" viewBox="0 0 1000 540" preserveAspectRatio="none"><path d="M130 170 C 300 40, 420 330, 530 220 S 780 80, 890 190"/><path d="M220 410 C 350 270, 570 480, 820 370"/><path class="is-open" d="M530 220 C 620 300, 690 350, 820 370"/></svg>
    </div>
    <div class="relation-legend"><span><i></i>已确认</span><span><i></i>来源支持</span><span><i></i>仍待判断</span></div>
  </section>`;
}

export function renderExplore(routeId = 'bangkok', requestedView = 'time') {
  const city = getCityByRouteId(routeId) || getCityByRouteId('bangkok');
  const view = validViews.has(requestedView) ? requestedView : 'time';
  const content = view === 'time' ? renderTimeView(city.slug) : (view === 'place' ? renderPlaceView() : renderConnectionView());
  const target = { time: 'timeline', place: 'map', connection: 'relations' }[view];
  return {
    sceneMode: 'city', scenePayload: { target, view, cityId: city.id }, afterRender: null,
    html: `<main class="page explore-page explore-page--${view}" data-page-id="world-explore">
      <header class="explore-header"><div><p class="eyebrow">${escapeHtml(city.name)} · 三个视角</p><h1>${{ time: '这些日子如何发生', place: '哪些地点反复出现', connection: '原件为什么靠近' }[view]}</h1></div>${exploreTabs(city.slug, view)}</header>
      ${content}
      ${primary(view === 'time' ? '打开河岸候船' : view === 'place' ? '打开 Common Grounds' : '查看船票与河岸照片', view === 'time' ? '#/world/scene/scene-river-evening' : view === 'place' ? '#/world/place/place-common-grounds' : '#/world/connection/rel-river-ticket-photo')}
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

export function renderCapsule(routeId = 'bangkok') {
  const city = getCityByRouteId(routeId) || getCityByRouteId('bangkok');
  const ari = fragments.filter((item) => item.placeId === 'place-common-grounds');
  const river = fragments.filter((item) => item.placeId === 'place-chao-phraya-ferry');
  return {
    sceneMode: 'capsule', scenePayload: { target: 'city-field', chapters: 3, cityId: city.id }, afterRender: capsuleAfterRender,
    html: `<main class="capsule-page" data-page-id="world-capsule">
      <header class="capsule-cover"><div class="capsule-cover__image"><img src="/assets/bangkok-photo-03-old-town.jpg" alt="Bangkok Old Town 原件"></div><div class="capsule-cover__copy capsule-reveal"><p>ELSEWHERE CITY CAPSULE · 001</p><h1>Bangkok</h1><span>12—22 OCT 2024</span><blockquote>“${escapeHtml(userNotes.find((item) => item.id === 'writing-city-reflection').text)}”</blockquote></div></header>
      <section class="capsule-chapter capsule-chapter--ari">
        <div class="capsule-chapter__title capsule-reveal"><p>CHAPTER 01</p><h2>等雨停的早晨</h2><span>ARI · THREE MORNINGS</span></div>
        <div class="capsule-spread capsule-reveal">${ari.slice(0, 3).map((item, index) => renderOriginalTile(item, { index, label: item.evidencePreview })).join('')}</div>
        <p class="capsule-prose capsule-reveal">你给这段重复出现的地点取了名字。三天的时间来源都落在上午，商户或地点来源共同指向 Common Grounds。</p>
      </section>
      <section class="capsule-chapter capsule-chapter--river">
        <div class="capsule-chapter__title capsule-reveal"><p>CHAPTER 02</p><h2>河流把傍晚分成十七分钟</h2><span>CHAO PHRAYA · 18 OCT</span></div>
        <div class="capsule-river-originals capsule-reveal">${river.map((item) => renderOriginalTile(item, { label: item.evidencePreview })).join('')}</div>
        ${renderTimeBridge({ from: '17:42', to: '17:59', duration: '17 分钟' })}
      </section>
      <section class="capsule-chapter capsule-chapter--ending"><div class="capsule-ending__image capsule-reveal"><img src="/assets/bangkok-photo-02-riverside.jpg" alt="Chao Phraya 河岸原件"></div><div class="capsule-ending__words capsule-reveal"><p>CHAPTER 03 · LEAVING</p><blockquote>“离开 Bangkok 以后，我最常想起的是河上的风。”</blockquote><span>这是你的文字；Elsewhere 没有替你补写感受。</span></div></section>
      <div class="capsule-actions">${primary('分享这段 Capsule', '', `data-action="open-share" data-title="Bangkok · City Capsule" data-text="离开 Bangkok 以后，我最常想起的是河上的风。"`)}<button class="text-action" type="button" data-action="navigate" data-route="#/world/city/${city.slug}">回到城市世界</button></div>
    </main>`,
  };
}

export function renderSceneDetail(sceneId) {
  const moment = indexes.scenesById[sceneId] || scenes.find((item) => item.id === 'scene-river-evening') || scenes[0];
  const originals = getSceneFragments(moment.id);
  const place = indexes.placesById[moment.placeId];
  return {
    sceneMode: 'connection', scenePayload: { target: 'timeline', sceneId: moment.id }, afterRender: null,
    html: `<main class="page authority-page moment-detail" data-page-id="world-scene-detail">
      <section class="moment-evidence" data-authority-evidence>${originals.map((item, index) => `<div class="moment-evidence__item"><span>${escapeHtml(item.capturedAt.slice(11,16))}</span>${renderOriginalTile(item, { interactive: true, index, label: item.evidencePreview })}</div>`).join('')}${originals.length > 1 ? renderTimeBridge({ from: originals[0].capturedAt.slice(11,16), to: originals[1].capturedAt.slice(11,16), duration: '17 分钟' }) : ''}</section>
      <header class="authority-header"><p class="eyebrow">一次具体事件 · ${escapeHtml(moment.date)}</p><h1>${escapeHtml(moment.label)}</h1><p>${escapeHtml(moment.observation)}</p></header>
      <section class="authority-facts"><div><span>地点</span><button type="button" data-action="navigate" data-route="${getAuthorityLink('place', place.id)}">${escapeHtml(place.name)} →</button></div><div><span>时间范围</span><strong>${escapeHtml(moment.timeRange)}</strong></div><div><span>状态</span>${renderStatus(moment.status)}</div></section>
      ${primary('查看原件', '#/world/fragments', `data-action="open-lens" data-fragment-id="${originals[0]?.id || fragments[0].id}"`)}
    </main>`,
  };
}

export function renderPlaceDetail(placeId) {
  const place = indexes.placesById[placeId] || places[0];
  const visits = getPlaceScenes(place.id);
  return {
    sceneMode: 'city', scenePayload: { target: 'map', placeId: place.id }, afterRender: null,
    html: `<main class="page authority-page place-detail" data-page-id="world-place-detail">
      <div class="place-anchor" aria-hidden="true"><i></i><i></i><i></i><span>${escapeHtml(place.visitCount ?? '?')}</span></div>
      <header class="authority-header"><p class="eyebrow">${escapeHtml(place.area)} · ${escapeHtml(place.dateRange)}</p><h1>${escapeHtml(place.name)}</h1><p>${escapeHtml(place.fact)}</p></header>
      <section class="visit-list"><h2>${place.visitCount === 3 ? '三次确认到访' : `${place.visitCount || visits.length} 次出现`}</h2>${visits.map((visit) => `<button type="button" data-action="navigate" data-route="${getAuthorityLink('scene', visit.id)}"><span>${escapeHtml(visit.date.replace('2024-', '').replace('-', ' / '))}</span><strong>${escapeHtml(visit.label)}</strong><small>${escapeHtml(visit.timeRange)}</small></button>`).join('')}</section>
      <p class="authority-source-note">这里只汇总已有原件和你确认的地点关系；候选内容仍会标记为待确认。</p>
      ${primary('在时间中查看', '#/world/city/bangkok/explore?view=time')}
    </main>`,
  };
}

export function renderConnectionDetail(connectionId) {
  const context = getConnectionContext(connectionId) || getConnectionContext(connections[0].id);
  const { connection, from, to, entity } = context;
  const originals = [...from, ...to];
  const humanType = { same_visit: '可能属于同一次到访', repeated_place: '同一地点反复出现', temporal_and_textual_near: '时间与文字语境靠近', place_candidate: '地点候选' }[connection.type];
  const gap = connection.uncertainty || '当前来源没有明显缺口。';
  return {
    sceneMode: 'connection', scenePayload: { target: 'relations', state: connection.status }, afterRender: null,
    html: `<main class="page authority-page connection-detail" data-page-id="world-connection-detail">
      <section class="connection-originals" data-authority-evidence>${originals.length ? originals.map((item) => renderEvidenceCard(item, { title: item.evidencePreview, detail: item.placeCandidate })).join('') : '<div class="missing-original">原件尚未加入当前演示包</div>'}</section>
      ${renderRelationThread({ label: humanType, evidence: connection.evidence, uncertainty: gap, state: connection.status })}
      <header class="authority-header"><p class="eyebrow">连接详情 · ${connection.status === 'confirmed' ? '已确认' : connection.status === 'suggested' ? '等待判断' : '仍未安放'}</p><h1>${escapeHtml(humanType)}</h1><p>${entity ? `共同指向 ${escapeHtml(entity.name)}，但关系强度只由下面列出的来源支撑。` : '这条关系只由列出的原件来源支撑。'}</p></header>
      <section class="connection-gap"><span>仍缺少</span><p>${escapeHtml(gap)}</p></section>
      <div class="connection-actions"><button type="button" data-action="connection-decision" data-value="confirmed">确认这条连接</button><button type="button" data-action="connection-decision" data-value="rejected">保持分开</button></div>
      ${primary('回到连接视角', '#/world/city/bangkok/explore?view=connection')}
    </main>`,
  };
}
