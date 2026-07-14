import { cities, discoveries, processingItems, reviewQueue, world } from '../fixtures/data.js';
import { getCityByRouteId, getCityFragments } from '../selectors.js';
import { escapeHtml } from '../components/primitives.js';
import { renderMedia } from '../components/primitives.js';
import { gsap } from 'gsap';

const reducedMotionQuery = () => (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

function renderCityPins() {
  return cities.map((city) => `<button class="world-city-pin" type="button" data-city-pin="${city.slug}" data-action="navigate" data-route="#/world/city/${city.slug}">
    <i aria-hidden="true"></i><span>${escapeHtml(city.name)}</span><small>${escapeHtml(city.period)}</small>
  </button>`).join('');
}

/**
 * 世界首页：五个产品层 ——
 * ① 点云地球（城市索引） ② 推荐城市 ③ 放入碎片 ④ 收件箱 ⑤ 全部碎片 + Else。
 */
export function renderWorldHome() {
  const bangkok = cities[0];
  const pending = reviewQueue.length;
  const newDiscoveries = discoveries.filter((discovery) => discovery.status === 'new').length;
  const processing = processingItems.length;
  return {
    sceneMode: 'world',
    scenePayload: { target: 'globe', pointSize: 1.7, opacity: 0.95, focus: 1 },
    html: `<main class="page world-home" data-page-id="world-home">
      <header class="world-brand">
        <span class="world-brand__mark">Elsewhere</span>
        <span class="world-brand__sub">私人旅行记忆世界</span>
      </header>

      <section class="globe-stage" data-globe-stage aria-label="点云地球：拖拽旋转，点击城市进入">
        <div class="globe-lede will-flow" data-flow="1">
          <p class="eyebrow">世界</p>
          <h1>去过的每个地方，仍然相连。</h1>
          <p class="world-stats">${world.totalCities} 座城市 · ${world.totalFragments} 个碎片 · ${world.totalConnections} 条连接</p>
        </div>
        <div class="globe-atmosphere" aria-hidden="true"></div>
        <div class="world-city-pins">${renderCityPins()}</div>
      </section>

      <section class="world-entries">
        <article class="world-entry world-entry--city will-flow" data-flow="2">
          <div class="world-entry__visual"><img src="${bangkok.representativeAsset}" alt="Bangkok 代表原件"></div>
          <div class="world-entry__copy">
            <span class="world-entry__label">最近的城市</span>
            <h2>Bangkok</h2>
            <p>10.12 – 10.22 · ${bangkok.fragmentCount} 碎片 · ${bangkok.placeCount} 地点</p>
            <p class="world-entry__note">三个早晨都从 Ari 开始</p>
          </div>
          <button class="world-entry__go" type="button" data-primary-action data-action="navigate" data-route="#/world/city/bangkok" aria-label="进入 Bangkok">→</button>
        </article>

        <p class="world-happening will-flow" data-flow="3">世界正在发生：${pending} 个连接待你判断 · ${newDiscoveries} 条发现新显影 · ${processing} 组照片正在整理</p>

        <button class="world-entry will-flow" data-flow="4" type="button" data-action="navigate" data-route="#/world/import">
          <div class="world-entry__visual world-entry__visual--import" aria-hidden="true">
            <i class="mini-photo"></i><i class="mini-receipt"></i><i class="mini-map"></i>
          </div>
          <div class="world-entry__copy">
            <span class="world-entry__label">放入碎片</span>
            <h2>把新的记忆交给世界</h2>
            <p class="world-entry__meta">照片 · 小票 · 截图 · 文字</p>
          </div>
          <span class="world-entry__go" aria-hidden="true">→</span>
        </button>

        <button class="world-entry will-flow" data-flow="5" type="button" data-action="navigate" data-route="#/world/inbox">
          <div class="world-entry__visual world-entry__visual--inbox" aria-hidden="true">
            <svg viewBox="0 0 64 40"><circle cx="14" cy="20" r="3.4"/><circle cx="50" cy="20" r="3.4"/><path d="M18 20 H28 M36 20 H46"/><text x="32" y="24">?</text></svg>
          </div>
          <div class="world-entry__copy">
            <span class="world-entry__label">碎片收件箱</span>
            <h2>${pending} 个未闭合的关系</h2>
            <p class="world-entry__meta">等待你的判断</p>
          </div>
          <span class="world-entry__go" aria-hidden="true">→</span>
        </button>

        <button class="world-entry will-flow" data-flow="6" type="button" data-action="navigate" data-route="#/world/fragments">
          <div class="world-entry__visual world-entry__visual--field" aria-hidden="true">
            <i style="--gx:22%;--gy:30%"></i><i style="--gx:66%;--gy:22%"></i><i style="--gx:48%;--gy:66%"></i>
          </div>
          <div class="world-entry__copy">
            <span class="world-entry__label">全部碎片</span>
            <h2>${world.totalFragments} 个碎片的私人数据库</h2>
            <p class="world-entry__meta">三座城市 · 可搜索 · 可问 Else</p>
          </div>
          <span class="world-entry__go" aria-hidden="true">→</span>
        </button>

        <button class="text-action world-cities-link will-flow" data-flow="7" type="button" data-action="navigate" data-route="#/world/cities">查看全部城市 →</button>
      </section>
    </main>`,
    afterRender({ pageRoot, sceneManager }) {
      const stage = pageRoot.querySelector('[data-globe-stage]');
      if (stage) {
        sceneManager.bindControls(stage);
        sceneManager.alignWorldToElement(stage);
      }
      sceneManager.trackCityPins(cities.map((city) => ({
        lat: city.coordinates.lat,
        lng: city.coordinates.lng,
        el: pageRoot.querySelector(`[data-city-pin="${city.slug}"]`),
      })), pageRoot.querySelector('.world-city-pins'));

      const reduced = reducedMotionQuery();
      const firstVisit = !window.sessionStorage.getItem('elsewhere:world-formed');
      const targets = pageRoot.querySelectorAll('.will-flow');
      if (reduced) {
        gsap.set(targets, { opacity: 1, y: 0 });
      } else {
        const brand = pageRoot.querySelector('.world-brand');
        const lede = pageRoot.querySelector('.globe-lede');
        const delay = firstVisit ? 0.8 : 0.15;
        gsap.fromTo(brand, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out', delay });
        gsap.fromTo(lede, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', delay: firstVisit ? 1.4 : 0.25 });
        gsap.fromTo(targets, { opacity: 0, y: 20 }, {
          opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.1,
          delay: firstVisit ? 2.4 : 0.35,
        });
      }
      return () => sceneManager.trackCityPins([]);
    },
  };
}

export function renderWorldCities() {
  return {
    sceneMode: 'world',
    scenePayload: { target: 'globe', indexMode: true },
    html: `<main class="page cities-page" data-page-id="world-cities">
      <header class="compact-header">
        <div><p class="eyebrow">仍在同一个世界</p><h1>旅行城市</h1></div>
        <button class="text-action" type="button" data-action="navigate" data-route="#/world">返回地球</button>
      </header>
      <div class="year-rail" role="tablist" aria-label="年份"><button class="is-active" type="button">全部</button><button type="button">2024</button><button type="button">2023</button></div>
      <section class="city-index">
        ${cities.map((city, index) => `<article class="city-index__item" style="--city-order:${index}">
          <div class="city-index__media">
            ${city.representativeAsset
    ? `<img src="${city.representativeAsset}" alt="${escapeHtml(city.localizedName)} 代表原件">`
    : `<div class="city-index__cluster" aria-label="${escapeHtml(city.localizedName)} 记忆群"><i></i><i></i><i></i><span>${city.fragmentCount}</span></div>`}
          </div>
          <div class="city-index__copy">
            <p>${escapeHtml(city.period)} · ${city.fragmentCount} 个碎片 · ${city.placeCount} 个地点</p>
            <h2>${escapeHtml(city.name)} <small>${escapeHtml(city.localizedName)}</small></h2>
            <button type="button" data-action="navigate" data-route="#/world/city/${city.slug}">进入城市群 →</button>
          </div>
        </article>`).join('')}
      </section>
      <button class="primary-action" type="button" data-primary-action data-action="navigate" data-route="#/world/city/bangkok">进入当前旅程 · Bangkok</button>
    </main>`,
    afterRender: null,
  };
}

/** 城市世界：三个记忆聚类（混合媒介）+ 两个主方向。 */
export function renderCityHome(routeId = 'bangkok') {
  const city = getCityByRouteId(routeId) || cities[0];
  const isBangkok = city.slug === 'bangkok';
  const cityFragments = getCityFragments(routeId);
  const byId = (id) => cityFragments.find((fragment) => fragment.id === id);
  const clusters = isBangkok ? [
    {
      key: 'ari',
      name: 'Ari 早晨',
      meta: '3 次到访 · 12–19 OCT',
      fragments: [byId('frag-ari-1016-photo'), byId('frag-ari-1016-receipt'), byId('frag-ari-1012-photo')],
    },
    {
      key: 'river',
      name: '河岸傍晚',
      meta: '船票与照片相差 17 分钟',
      fragments: [byId('frag-river-1018-photo'), byId('frag-river-1018-ticket'), byId('frag-river-1022-map')],
    },
    {
      key: 'oldtown',
      name: 'Old Town',
      meta: '待确认的步行',
      fragments: [byId('frag-old-town-1017-photo'), byId('frag-old-town-1017-menu')],
    },
  ] : [];

  const clusterHtml = clusters.map((cluster, index) => `
    <div class="city-cluster city-cluster--${cluster.key}" data-cluster-anchor style="--cluster-order:${index}">
      <span class="city-cluster__name">${escapeHtml(cluster.name)}<small>${escapeHtml(cluster.meta)}</small></span>
      ${cluster.fragments.filter(Boolean).map((fragment, tileIndex) => `
        <button class="city-tile city-tile--${tileIndex} city-tile--t-${fragment.type}" type="button" data-action="open-lens" data-fragment-id="${fragment.id}" aria-label="${escapeHtml(fragment.evidencePreview)}">
          ${renderMedia(fragment, { className: 'city-tile__media', decorative: true })}
        </button>`).join('')}
    </div>`).join('');

  return {
    sceneMode: 'city',
    scenePayload: { target: 'cityCluster', cityId: city.id, pointSize: 1.5, opacity: 0.92, focus: 0.5 },
    html: `<main class="page city-world" data-page-id="world-city-home">
      <header class="city-head will-flow">
        <p class="eyebrow">${escapeHtml(city.period)} · ${escapeHtml(city.localizedName)}</p>
        <h1>${escapeHtml(city.name)}</h1>
        <div class="city-head__paths">
          <button type="button" data-action="navigate" data-route="#/world/city/${city.slug}/capsule"><span>01</span><strong>City Capsule</strong><small>回到这段日子</small></button>
          <button type="button" data-action="navigate" data-route="#/world/city/${city.slug}/explore?view=time"><span>02</span><strong>三个视角探索</strong><small>时间 · 地点 · 连接</small></button>
        </div>
      </header>

      ${isBangkok ? `<section class="city-cluster-space" aria-label="城市碎片场">${clusterHtml}</section>
      <div class="city-observation will-flow">
        <p>照片、小票、菜单与地图在同一空间中靠近；三个早晨都从 Ari 开始。</p>
        <strong>${city.fragmentCount} 个碎片 · ${city.placeCount} 个地点</strong>
      </div>` : `<section class="city-cluster-space city-cluster-space--empty"><p>${escapeHtml(city.fact)}</p></section>`}

      <div class="city-foot will-flow">
        <button class="primary-action primary-action--filled" type="button" data-primary-action data-action="navigate" data-route="#/world/city/${city.slug}/capsule">${isBangkok ? '回到这段日子' : '查看城市索引'}</button>
        <div class="city-foot__aux">
          <button class="text-action" type="button" data-action="navigate" data-route="#/world/inbox">待确认 ${reviewQueue.length}</button>
          <button class="text-action" type="button" data-action="navigate" data-route="#/world/fragments">查看该城市全部碎片 →</button>
        </div>
      </div>
    </main>`,
    afterRender({ pageRoot, sceneManager }) {
      // 聚类 DOM 锚点 → 粒子骨架（碎片与粒子在同一空间坐标系）
      const anchors = sceneManager.anchorsFromElements(
        pageRoot.querySelectorAll('[data-cluster-anchor]'),
        { z: -2, weights: [1, 0.92, 0.8] },
      );
      if (anchors.length) sceneManager.retarget?.('cityCluster', { anchors });

      const reduced = reducedMotionQuery();
      const tiles = pageRoot.querySelectorAll('.city-tile, .city-cluster__name');
      const willFlow = pageRoot.querySelectorAll('.will-flow');
      if (reduced) {
        gsap.set([...tiles, ...willFlow], { opacity: 1, y: 0 });
      } else {
        gsap.fromTo(willFlow, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', stagger: 0.1, delay: 0.1 });
        gsap.fromTo(tiles, { opacity: 0, y: 24, scale: 0.92 }, {
          opacity: 1, y: 0, scale: 1, duration: 1.1, ease: 'power3.out', stagger: 0.08, delay: 0.35,
        });
      }
      return () => {};
    },
  };
}
