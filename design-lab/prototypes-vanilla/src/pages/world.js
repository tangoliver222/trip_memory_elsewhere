import { cities, fragments, world } from '../fixtures/data.js';
import { getCityByRouteId } from '../selectors.js';
import { escapeHtml } from '../components/primitives.js';
import { renderMissingOriginal, renderOriginalTile } from '../components/fragments.js';

const primary = (label, route) => `<button class="primary-action" type="button" data-primary-action data-action="navigate" data-route="${route}">${label}</button>`;

function renderCityPins() {
  const depths = [-5, -11, -18];
  return cities.map((city, index) => `<button class="world-city-pin world-city-pin--${city.slug}" type="button" data-action="navigate" data-route="#/world/city/${city.slug}" style="--city-order:${index}" data-particle-anchor="world-city-${city.slug}" data-particle-kind="place" data-particle-depth="${depths[index]}">
    <i aria-hidden="true"></i><span>${escapeHtml(city.name)}</span><small>${escapeHtml(city.period)}</small>
  </button>`).join('');
}

const worldEntries = [
  { number: '01', kind: 'recommended', label: '继续 Bangkok', detail: '最近旅程 · 63 个碎片', route: '#/world/city/bangkok' },
  { number: '02', kind: 'import', label: '安放新碎片', detail: '照片、截图、小票与票根', route: '#/world/import' },
  { number: '03', kind: 'inbox', label: '碎片收件箱', detail: '3 项需要你的判断', route: '#/world/inbox' },
  { number: '04', kind: 'archive', label: '全部碎片', detail: '进入三维私人数据库', route: '#/world/fragments' },
];

const renderWorldEntries = () => worldEntries.map((entry, index) => `<button class="world-entry world-entry--${entry.kind}" type="button" data-world-entry data-action="navigate" data-route="${entry.route}" ${index === 0 ? 'data-primary-action' : ''} data-particle-anchor="world-entry-${entry.kind}" data-particle-kind="scene" data-particle-depth="${-20 - index * 3}">
  <span class="world-entry__number">${entry.number}</span><i class="world-entry__glyph" aria-hidden="true"></i><span class="world-entry__copy"><small>${entry.kind}</small><strong>${entry.label}</strong><em>${entry.detail}</em></span><span class="world-entry__arrow">→</span>
</button>`).join('');

export function renderWorldHome() {
  return {
    sceneMode: 'world',
    scenePayload: { target: 'globe', cityCoordinates: cities.map(({ slug, coordinates }) => ({ slug, ...coordinates })) },
    html: `<main class="page world-home" data-page-id="world-home" data-visual-grade="S">
      <header class="world-title will-flow">
        <p class="world-wordmark">Elsewhere</p><p class="eyebrow">Travel memory database</p>
        <div class="world-title__statement"><span>WORLD HOME</span><h1>Every place<br>you’ve been.<br>Connected.</h1><p>${world.totalCities} 座城市 · ${world.totalFragments} 个碎片 · ${world.totalConnections} 条连接</p></div>
      </header>
      <section class="world-home__space" aria-label="由旅行碎片凝聚成的地球">
        <div class="globe-atmosphere" aria-hidden="true"></div>
        <div class="world-city-pins">${renderCityPins()}</div>
        <p class="world-drag-hint">拖拽转动 · 点击城市进入</p>
      </section>
      <section class="world-entry-list" aria-label="Elsewhere 入口">${renderWorldEntries()}</section>
    </main>`,
    afterRender: null,
  };
}

export function renderWorldCities() {
  return {
    sceneMode: 'world',
    scenePayload: { target: 'globe', indexMode: true },
    html: `<main class="page cities-page" data-page-id="world-cities">
      <header class="compact-header">
        <div><p class="eyebrow">仍在同一个世界</p><h1>旅行城市</h1><p>按城市与年份查看已形成的记忆群。</p></div>
        <button class="text-action" type="button" data-action="navigate" data-route="#/world">返回地球</button>
      </header>
      <div class="year-rail" role="tablist" aria-label="年份"><button class="is-active" type="button">全部</button><button type="button">2024</button><button type="button">2023</button></div>
      <section class="city-index">
        ${cities.map((city, index) => `<article class="city-index__item" style="--city-order:${index}" data-particle-anchor="city-index-${city.slug}" data-particle-kind="scene" data-particle-depth="${[-5, -14, -24][index]}">
          <div class="city-index__image">${city.representativeAsset ? `<img src="${city.representativeAsset}" alt="${escapeHtml(city.localizedName)} 代表原件">` : renderMissingOriginal(city.localizedName)}</div>
          <div class="city-index__copy"><p>${escapeHtml(city.period)}</p><h2>${escapeHtml(city.name)} <small>${escapeHtml(city.localizedName)}</small></h2><p>${escapeHtml(city.fact)}</p><button type="button" data-action="navigate" data-route="#/world/city/${city.slug}">进入城市群 →</button></div>
        </article>`).join('')}
      </section>
      ${primary('进入当前旅程 · Bangkok', '#/world/city/bangkok')}
    </main>`,
    afterRender: null,
  };
}

export function renderCityHome(routeId = 'bangkok') {
  const city = getCityByRouteId(routeId) || cities[0];
  const isBangkok = city.slug === 'bangkok';
  const originals = isBangkok ? fragments.filter((fragment) => fragment.asset).slice(0, 6) : [];
  return {
    sceneMode: 'city',
    scenePayload: { target: 'city-field', cityId: city.id },
    html: `<main class="page city-world" data-page-id="world-city-home" data-visual-grade="S">
      <header class="city-world__header will-flow">
        <p class="city-wordmark">Elsewhere</p><p class="eyebrow">City World · ${escapeHtml(city.period)}</p>
        <h1>${escapeHtml(city.name)}</h1>
        <p class="city-coordinate">13.7563° N · 100.5018° E</p>
        <div class="city-world__paths">
          <button type="button" data-action="navigate" data-route="#/world/city/${city.slug}/capsule"><span>01</span><strong>City Capsule</strong><small>像翻阅一本摄影书</small></button>
          <button type="button" data-action="navigate" data-route="#/world/city/${city.slug}/explore?view=time"><span>02</span><strong>三个视角探索</strong><small>时间 · 地点 · 连接</small></button>
        </div>
        <p>${escapeHtml(city.fact)}</p>
      </header>
      <section class="city-fragment-stage" aria-label="城市碎片场">
        ${originals.length ? originals.map((fragment, index) => renderOriginalTile(fragment, { index, label: fragment.evidencePreview, className: `city-tile city-tile--${index + 1}`, anchorId: `city-original-${index + 1}`, particleDepth: [-4, -16, -8, -24, -13, -30][index] })).join('') : renderMissingOriginal(`${city.localizedName} 城市群`)}
        <div class="city-semantic-card city-semantic-card--receipt" data-particle-anchor="city-receipt-source" data-particle-kind="fragment" data-particle-depth="-11"><span>RECEIPT SOURCE</span><strong>COMMON GROUNDS</strong><small>16 OCT · 124 THB</small></div>
        <div class="city-semantic-card city-semantic-card--map" data-particle-anchor="city-place-source" data-particle-kind="place" data-particle-depth="-19"><span>SPATIAL ANCHOR</span><strong>ARI · BANGKOK</strong><small>13.7797° N · 100.5448° E</small></div>
        <div class="city-field-caption"><p>照片、小票、菜单与地图在同一空间中靠近</p><strong>${city.fragmentCount} 个碎片 · ${city.placeCount} 个地点</strong></div>
      </section>
      ${primary(isBangkok ? '回到这段日子' : '查看当前城市索引', isBangkok ? '#/world/city/bangkok/capsule' : '#/world/cities')}
    </main>`,
    afterRender: null,
  };
}
