import { cities, fragments, world } from '../fixtures/data.js';
import { getCityByRouteId } from '../selectors.js';
import { escapeHtml } from '../components/primitives.js';
import { renderMissingOriginal, renderOriginalTile } from '../components/fragments.js';

const primary = (label, route) => `<button class="primary-action" type="button" data-primary-action data-action="navigate" data-route="${route}">${label}</button>`;

function renderCityPins() {
  return cities.map((city, index) => `<button class="world-city-pin world-city-pin--${city.slug}" type="button" data-action="navigate" data-route="#/world/city/${city.slug}" style="--city-order:${index}">
    <i aria-hidden="true"></i><span>${escapeHtml(city.name)}</span><small>${escapeHtml(city.period)}</small>
  </button>`).join('');
}

export function renderWorldHome() {
  return {
    sceneMode: 'world',
    scenePayload: { target: 'globe', cityCoordinates: cities.map(({ slug, coordinates }) => ({ slug, ...coordinates })) },
    html: `<main class="page world-home" data-page-id="world-home">
      <div class="world-home__space" aria-label="由旅行碎片凝聚成的地球">
        <div class="globe-atmosphere" aria-hidden="true"></div>
        <div class="world-city-pins">${renderCityPins()}</div>
      </div>
      <header class="world-title will-flow">
        <p class="eyebrow">你的私人记忆宇宙</p>
        <h1>Elsewhere</h1>
        <p>${world.totalCities} 座城市 · ${world.totalFragments} 个碎片 · ${world.totalConnections} 条已建立连接</p>
      </header>
      <div class="world-home__action">${primary('进入 Bangkok', '#/world/city/bangkok')}<button class="text-action" type="button" data-action="navigate" data-route="#/world/cities">查看全部城市</button></div>
      <p class="world-drag-hint">拖拽转动 · 滚动靠近 · 点击城市进入</p>
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
        ${cities.map((city, index) => `<article class="city-index__item" style="--city-order:${index}">
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
    html: `<main class="page city-world" data-page-id="world-city-home">
      <header class="city-world__header will-flow">
        <p class="eyebrow">${escapeHtml(city.period)} · ${escapeHtml(city.localizedName)}</p>
        <h1>${escapeHtml(city.name)}</h1>
        <div class="city-world__paths">
          <button type="button" data-action="navigate" data-route="#/world/city/${city.slug}/capsule"><span>01</span><strong>City Capsule</strong><small>像翻阅一本摄影书</small></button>
          <button type="button" data-action="navigate" data-route="#/world/city/${city.slug}/explore?view=time"><span>02</span><strong>三个视角探索</strong><small>时间 · 地点 · 连接</small></button>
        </div>
        <p>${escapeHtml(city.fact)}</p>
      </header>
      <section class="city-fragment-stage" aria-label="城市碎片场">
        ${originals.length ? originals.map((fragment, index) => renderOriginalTile(fragment, { index, label: fragment.type === 'photo' ? '照片原件' : fragment.type === 'receipt' ? '票据原件' : fragment.type === 'ticket' ? '船票原件' : '旅行原件', className: `city-tile city-tile--${index + 1}` })).join('') : renderMissingOriginal(`${city.localizedName} 城市群`)}
        <div class="city-field-caption"><p>照片、小票、菜单与地图在同一空间中靠近</p><strong>${city.fragmentCount} 个碎片 · ${city.placeCount} 个地点</strong></div>
      </section>
      ${primary(isBangkok ? '回到这段日子' : '查看当前城市索引', isBangkok ? '#/world/city/bangkok/capsule' : '#/world/cities')}
    </main>`,
    afterRender: null,
  };
}
