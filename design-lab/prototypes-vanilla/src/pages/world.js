import { getMemoryView } from '../data/view-model.js';
import { escapeHtml } from '../components/primitives.js';
import { renderMedia } from '../components/primitives.js';
import { gsap } from 'gsap';

const reducedMotionQuery = () => (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const mediaTypeLabel = Object.freeze({ photo: '照片', receipt: '小票', ticket: '票根', menu: '菜单', screenshot: '截图', text: '文字' });

function renderCityPins(cityItems) {
  return cityItems.filter(({ coordinates }) => coordinates).map((city) => `<button class="world-city-pin" type="button" data-city-pin="${city.slug}" data-action="navigate" data-route="#/world/city/${city.slug}">
    <i aria-hidden="true"></i><b class="world-city-pin__label" data-city-pin-label><span>${escapeHtml(city.name)}</span><small>${escapeHtml(city.period)}</small></b>
  </button>`).join('');
}

function renderEmptyWorld() {
  return {
    sceneMode: 'world',
    scenePayload: {
      target: 'initializing',
      itemCount: 0,
      items: [],
      cities: [],
      pointSize: 1.15,
      opacity: 0.24,
      focus: 0,
    },
    html: `<main class="page world-home world-home--empty" data-page-id="world-home" data-world-state="empty">
      <header class="world-brand world-brand--empty">
        <span class="world-brand__mark">Elsewhere</span>
      </header>
      <section class="world-empty">
        <div class="world-empty__seed" aria-hidden="true"><i></i><i></i><i></i></div>
        <p class="eyebrow">世界尚未形成</p>
        <h1>从一份真实原件开始。</h1>
        <p>照片、小票、截图或文字进入后，时间与地点会在这里慢慢靠近。</p>
        <button class="primary-action primary-action--filled" type="button" data-primary-action data-action="navigate" data-route="#/world/import">放入第一批碎片</button>
      </section>
    </main>`,
    afterRender: null,
  };
}

function renderUnplacedWorld(memory) {
  const count = memory.world.counts.fragments;
  return {
    sceneMode: 'world',
    scenePayload: {
      target: 'multiCityField',
      itemCount: count,
      items: memory.world.unplacedItems,
      clusters: [{ id: 'unplaced', slug: 'unplaced', weight: count }],
      pointSize: 1.2,
      opacity: 0.42,
      focus: 0,
    },
    html: `<main class="page world-home world-home--empty" data-page-id="world-home" data-world-state="forming">
      <header class="world-brand world-brand--empty"><span class="world-brand__mark">Elsewhere</span></header>
      <section class="world-empty">
        <div class="world-empty__seed world-empty__seed--forming" aria-hidden="true"><i></i><i></i><i></i></div>
        <p class="eyebrow">世界正在形成</p>
        <h1>${count} 个碎片正在等待形成城市。</h1>
        <p>原件已经安全保留。补充地点或等待当前整理完成后，城市会在这里显影。</p>
        <button class="primary-action primary-action--filled" type="button" data-primary-action data-action="navigate" data-route="#/world/fragments">查看这些碎片</button>
        <button class="text-action" type="button" data-action="navigate" data-route="#/world/import">继续放入碎片</button>
      </section>
    </main>`,
    afterRender: null,
  };
}

/**
 * 世界首页：五个产品层 ——
 * ① 点云地球（城市索引） ② 推荐城市 ③ 放入碎片 ④ 收件箱 ⑤ 全部碎片 + Else。
 */
export function renderWorldHome() {
  const memory = getMemoryView();
  if (!memory.world.hasFragments) return renderEmptyWorld();
  const recommended = memory.world.recommendedCity;
  if (!recommended) return renderUnplacedWorld(memory);
  const recommendedContext = recommended ? memory.city(recommended.slug) : null;
  const counts = memory.world.counts;
  const pendingCount = memory.world.statusItems.find(({ key }) => key === 'review')?.count || 0;
  const locatedCities = memory.world.cities.filter(({ coordinates }) => coordinates);
  const happening = memory.world.statusItems.map(({ count, label }) => `${count} ${label}`).join(' · ');
  return {
    sceneMode: 'world',
    scenePayload: {
      target: 'globe',
      itemCount: counts.fragments,
      items: memory.world.particleItems,
      cities: locatedCities.map((city) => ({ ...city, lat: city.coordinates.lat, lng: city.coordinates.lng })),
      pointSize: 1.7,
      opacity: 0.95,
      focus: 1,
    },
    html: `<main class="page world-home" data-page-id="world-home" data-world-state="populated">
      <header class="world-brand">
        <div><span class="world-brand__mark">Elsewhere</span><span class="world-brand__sub">私人旅行记忆世界</span></div>
        <div class="world-brand__actions">
          <button type="button" data-action="navigate" data-route="#/world/inbox" aria-label="打开碎片收件箱">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v13H4zM4 14h4l1.7 2h4.6l1.7-2h4"/></svg>
            ${pendingCount ? `<span>${pendingCount}</span>` : ''}
          </button>
          <button type="button" data-action="navigate" data-route="#/world/fragments" aria-label="搜索全部碎片">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 5 5"/></svg>
          </button>
        </div>
      </header>

      <section class="globe-stage" data-globe-stage data-particle-anchor data-particle-id="world-globe" data-particle-role="world" data-particle-weight="${Math.max(1, counts.fragments)}" aria-label="点云地球：拖拽旋转，点击城市进入">
        <div class="globe-lede will-flow" data-flow="1">
          <p class="eyebrow">世界</p>
          <h1>去过的每个地方，仍然相连。</h1>
          <p class="world-stats">${counts.cities} 座城市 · ${counts.fragments} 个碎片 · ${counts.connections} 条连接</p>
        </div>
        <div class="globe-visual-anchor" data-globe-visual aria-hidden="true"></div>
        <div class="world-city-pins">${renderCityPins(locatedCities)}</div>
      </section>

      <section class="world-entries">
        <article class="world-entry world-entry--city will-flow" data-flow="2">
          <div class="world-entry__visual">${recommended?.representativeAsset
    ? `<img src="${recommended.representativeAsset}" alt="${escapeHtml(recommended.name)} 代表原件">`
    : `<div class="city-index__cluster" aria-label="${escapeHtml(recommended?.name || '最近城市')} 记忆群"><i></i><i></i><i></i></div>`}</div>
          <div class="world-entry__copy">
            <span class="world-entry__label">最近的城市</span>
            <h2>${escapeHtml(recommended?.name || '最近城市')}</h2>
            <p>${escapeHtml(recommended?.period || '时间待确认')} · ${recommended?.fragmentCount || 0} 碎片 · ${recommended?.placeCount || 0} 地点</p>
            ${recommendedContext?.discoveries[0]?.title ? `<p class="world-entry__note">${escapeHtml(recommendedContext.discoveries[0].title)}</p>` : ''}
          </div>
          <button class="world-entry__go" type="button" data-primary-action data-action="navigate" data-route="#/world/city/${recommended.slug}" aria-label="进入 ${escapeHtml(recommended.name)}">→</button>
        </article>

        ${happening ? `<p class="world-happening will-flow" data-flow="3">世界正在发生：${escapeHtml(happening)}</p>` : ''}

        <button class="world-entry world-entry--utility will-flow" data-flow="4" type="button" data-action="navigate" data-route="#/world/import" aria-label="放入新的碎片">
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

        <button class="world-entry world-entry--utility will-flow" data-flow="5" type="button" data-action="navigate" data-route="#/world/fragments">
          <div class="world-entry__visual world-entry__visual--field" aria-hidden="true">
            <i style="--gx:22%;--gy:30%"></i><i style="--gx:66%;--gy:22%"></i><i style="--gx:48%;--gy:66%"></i>
          </div>
          <div class="world-entry__copy">
            <span class="world-entry__label">全部碎片</span>
            <h2>${counts.fragments} 个碎片的私人数据库</h2>
            <p class="world-entry__meta">${counts.cities} 座城市 · 可搜索 · 可问 Else</p>
          </div>
          <span class="world-entry__go" aria-hidden="true">→</span>
        </button>

        <button class="text-action world-cities-link will-flow" data-flow="6" type="button" data-action="navigate" data-route="#/world/cities">查看全部城市 →</button>
      </section>
    </main>`,
    afterRender({ pageRoot, sceneManager }) {
      const stage = pageRoot.querySelector('[data-globe-stage]');
      const visual = pageRoot.querySelector('[data-globe-visual]');
      if (stage) {
        sceneManager.bindControls(stage);
        sceneManager.alignWorldToElement(visual || stage, { fill: 0.96 });
      }
      sceneManager.trackCityPins(locatedCities.map((city) => ({
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

export function renderWorldCities(_state = {}, selectedYear = 'all') {
  const memory = getMemoryView();
  const years = [...new Set(memory.world.cities.map(({ period }) => String(period || '').match(/\d{4}/)?.[0]).filter(Boolean))].sort().reverse();
  const visibleCities = selectedYear === 'all'
    ? memory.world.cities
    : memory.world.cities.filter(({ period }) => String(period || '').includes(selectedYear));
  if (!memory.world.cities.length) {
    return {
      sceneMode: 'world',
      scenePayload: { target: 'initializing', itemCount: 0, items: [], cities: [] },
      afterRender: null,
      html: `<main class="page cities-page cities-page--empty" data-page-id="world-cities"><header class="compact-header"><div><p class="eyebrow">城市索引</p><h1>还没有形成城市</h1></div></header><p>带有地点来源的碎片进入后，城市会出现在这里。</p><button class="primary-action primary-action--filled" type="button" data-primary-action data-action="navigate" data-route="#/world/import">放入第一批碎片</button></main>`,
    };
  }
  return {
    sceneMode: 'world',
    scenePayload: {
      target: 'globe',
      indexMode: true,
      itemCount: memory.world.counts.fragments,
      items: visibleCities.map((city) => ({ id: city.id, role: 'city', clusterId: city.id, status: city.status?.[0] })),
      cities: visibleCities.filter(({ coordinates }) => coordinates).map((city) => ({ ...city, lat: city.coordinates.lat, lng: city.coordinates.lng })),
    },
    html: `<main class="page cities-page" data-page-id="world-cities">
      <header class="compact-header">
        <div><p class="eyebrow">仍在同一个世界</p><h1>旅行城市</h1></div>
        <button class="text-action" type="button" data-action="navigate" data-route="#/world">返回地球</button>
      </header>
      <div class="year-rail" role="tablist" aria-label="年份"><button class="${selectedYear === 'all' ? 'is-active' : ''}" type="button" data-action="navigate" data-route="#/world/cities">全部</button>${years.map((year) => `<button class="${selectedYear === year ? 'is-active' : ''}" type="button" data-action="navigate" data-route="#/world/cities?year=${year}">${year}</button>`).join('')}</div>
      <section class="city-index">
        ${visibleCities.map((city, index) => `<article class="city-index__item" style="--city-order:${index}" data-particle-anchor data-particle-id="${city.id}" data-particle-role="city" data-particle-weight="${Math.max(1, city.fragmentCount)}">
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
      ${visibleCities.length ? `<button class="primary-action" type="button" data-primary-action data-action="navigate" data-route="#/world/city/${visibleCities[0].slug}">进入当前旅程 · ${escapeHtml(visibleCities[0].name)}</button>` : `<button class="primary-action" type="button" data-primary-action data-action="navigate" data-route="#/world/cities">查看全部年份</button>`}
    </main>`,
    afterRender: null,
  };
}

function renderEmptyCityHome() {
  return {
    sceneMode: 'quiet-tool',
    scenePayload: { target: 'quiet', itemCount: 0, items: [], opacity: 0.2 },
    html: `<main class="page city-world city-world--empty" data-page-id="world-city-home">
      <header class="city-head">
        <p class="eyebrow">城市记忆群</p>
        <h1>还没有形成城市记忆群</h1>
        <p>带有时间或地点的真实原件进入世界后，城市会在这里显影。</p>
      </header>
      <button class="primary-action primary-action--filled" type="button" data-primary-action data-action="navigate" data-route="#/world/import">放入碎片</button>
      <button class="text-action" type="button" data-action="navigate" data-route="#/world">返回世界</button>
    </main>`,
    afterRender: null,
  };
}

/** 城市世界：三个记忆聚类（混合媒介）+ 两个主方向。 */
export function renderCityHome(routeId = 'bangkok', state = {}) {
  const context = getMemoryView().city(routeId);
  if (!context) return renderEmptyCityHome();
  const { city } = context;
  const slots = ['ari', 'river', 'oldtown'];
  const clusters = context.clusters.slice(0, 3).map((cluster, index) => ({
    ...cluster,
    key: slots[index],
    name: cluster.label,
    meta: cluster.detail,
    fragments: cluster.fragments.slice(0, 4),
  }));
  const anchoredFragments = clusters.flatMap((cluster) => cluster.fragments);
  const mediaKinds = [...new Set(context.fragments.map(({ type }) => mediaTypeLabel[type] || '原件'))];
  const observation = mediaKinds.length
    ? `${mediaKinds.join('、')}正在按 ${context.clusters.length} 个实际地点或事件靠近。`
    : city.fact;
  const clusterHtml = clusters.map((cluster, index) => `
    <div class="city-cluster city-cluster--${cluster.key}" data-cluster-anchor style="--cluster-order:${index}">
      <span class="city-cluster__name">${escapeHtml(cluster.name)}<small>${escapeHtml(cluster.meta)}</small></span>
      ${cluster.fragments.filter(Boolean).map((fragment, tileIndex) => `
        <button class="city-tile city-tile--${tileIndex} city-tile--t-${fragment.type}" type="button" data-particle-anchor data-particle-id="${fragment.id}" data-particle-role="fragment" data-particle-weight="1" data-action="open-lens" data-fragment-id="${fragment.id}" aria-label="${escapeHtml(fragment.evidencePreview)}">
          ${renderMedia(fragment, { className: 'city-tile__media', decorative: true })}
        </button>`).join('')}
    </div>`).join('');

  return {
    sceneMode: 'city',
    scenePayload: {
      target: 'cityCluster',
      cityId: city.id,
      itemCount: city.fragmentCount ?? context.fragments.length,
      items: anchoredFragments.map((fragment) => ({ id: fragment.id, role: 'fragment', clusterId: fragment.placeId || 'unplaced', status: fragment.status })),
      pointSize: 1.5,
      opacity: 0.92,
      focus: 0.5,
    },
    html: `<main class="page city-world" data-page-id="world-city-home">
      <header class="city-head will-flow">
        <p class="eyebrow">${escapeHtml(city.period)} · ${escapeHtml(city.localizedName)}</p>
        <h1>${escapeHtml(city.name)}</h1>
        <div class="city-head__paths">
          <button type="button" data-action="navigate" data-route="#/world/city/${city.slug}/capsule"><span>01</span><strong>City Capsule</strong><small>回到这段日子</small></button>
          <button type="button" data-action="navigate" data-route="#/world/city/${city.slug}/explore?view=time"><span>02</span><strong>三个视角探索</strong><small>时间 · 地点 · 连接</small></button>
        </div>
      </header>

      ${clusters.length ? `<section class="city-cluster-space city-cluster-space--count-${clusters.length}" aria-label="城市碎片场">${clusterHtml}</section>
      <div class="city-observation will-flow">
        <p>${escapeHtml(observation)}</p>
        <strong>${city.fragmentCount} 个碎片 · ${city.placeCount} 个地点</strong>
      </div>` : `<section class="city-cluster-space city-cluster-space--empty"><p>${escapeHtml(city.fact)}</p></section>`}

      <div class="city-foot will-flow">
        <button class="primary-action primary-action--filled" type="button" data-primary-action data-action="navigate" data-route="#/world/city/${city.slug}/capsule">回到这段日子</button>
        <div class="city-foot__aux">
          <button class="text-action" type="button" data-action="navigate" data-route="#/world/inbox">待确认 ${context.reviews.length}</button>
          <button class="text-action" type="button" data-action="navigate" data-route="#/world/fragments">查看该城市全部碎片 →</button>
        </div>
      </div>
    </main>`,
    afterRender({ pageRoot, sceneManager }) {
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
