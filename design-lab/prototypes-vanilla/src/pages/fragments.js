import { exceptions, fragments, importBatches, processingItems, reviewQueue } from '../fixtures/data.js';
import { createFieldController, createFieldLayout } from '../controllers/field-controller.js';
import { escapeHtml, renderMedia } from '../components/primitives.js';

const primary = (label, route) => `<button class="primary-action" type="button" data-primary-action data-action="navigate" data-route="${route}">${label}</button>`;

const typeLabel = { photo: '照片', receipt: '小票', ticket: '票根', menu: '菜单', screenshot: '截图' };

const renderFieldSource = (fragment) => fragment.asset
  ? renderMedia(fragment, { className: 'field-node__media' })
  : `<div class="field-node__media field-source-record" aria-label="${escapeHtml(fragment.evidencePreview)}"><span>${escapeHtml(typeLabel[fragment.type] || '来源记录')}</span><strong>${escapeHtml(fragment.evidencePreview.split(' · ')[0])}</strong><small>${escapeHtml(fragment.evidencePreview.split(' · ').slice(1).join(' · '))}</small></div>`;

export function renderFragmentField(state) {
  const query = state.field?.filters?.query || '';
  const layout = createFieldLayout(query, { compact: Boolean(globalThis.innerWidth && globalThis.innerWidth <= 700) });
  const positions = Object.fromEntries(layout.map((node) => [node.id, node]));
  return {
    sceneMode: 'fragment-field',
    scenePayload: { target: 'field', query, filters: state.field?.filters },
    afterRender({ pageRoot, store, sceneManager }) {
      const viewport = pageRoot?.querySelector?.('[data-field-viewport]');
      if (!viewport) return null;
      const controller = createFieldController({ viewport, store, sceneManager });
      const search = pageRoot.querySelector('[data-field-search]');
      const onSearch = (event) => controller.search(event.target.value);
      search?.addEventListener('input', onSearch);
      search?.addEventListener('search', onSearch);
      return () => { search?.removeEventListener('input', onSearch); search?.removeEventListener('search', onSearch); controller.destroy(); };
    },
    html: `<main class="page fragment-field" data-page-id="world-fragments" data-visual-grade="S">
      <header class="field-header">
        <div><p class="eyebrow">全部碎片 · 三维私人数据库</p><h1>Fragment Field</h1></div>
        <label class="field-search"><span class="visually-hidden">搜索碎片</span><input data-field-search data-store-action="field-query" type="search" value="${escapeHtml(query)}" placeholder="搜索地点、商户或原件"><kbd>⌘ K</kbd></label>
        <div class="field-filters" role="group" aria-label="原件类型">
          ${['all', 'photo', 'receipt', 'unresolved'].map((type) => `<button type="button" data-action="set-field-type" data-value="${type}" class="${state.field?.filters?.type === type ? 'is-active' : ''}">${{ all: '全部', photo: '照片', receipt: '票据', unresolved: '待安放' }[type]}</button>`).join('')}
        </div>
      </header>
      <section class="field-viewport" data-field-viewport aria-label="可拖拽和缩放的碎片空间">
        <div class="field-depth-grid" aria-hidden="true"><span>NEAR</span><span>MID</span><span>DEEP</span></div>
        <div class="field-city-label field-city-label--bangkok" data-city-depth-group="near" data-particle-anchor="field-city-bangkok" data-particle-kind="scene" data-particle-depth="-5"><strong>BANGKOK</strong><span>9 份代表原件</span></div>
        <div class="field-city-label field-city-label--tokyo" data-city-depth-group="mid" data-particle-anchor="field-city-tokyo" data-particle-kind="scene" data-particle-depth="-18"><strong>TOKYO</strong><span>索引存在 · 演示原件未提供</span></div>
        <div class="field-city-label field-city-label--chiang-mai" data-city-depth-group="deep" data-particle-anchor="field-city-chiang-mai" data-particle-kind="scene" data-particle-depth="-32"><strong>CHIANG MAI</strong><span>索引存在 · 演示原件未提供</span></div>
        ${fragments.map((fragment, index) => {
          const node = positions[fragment.id];
          const relevant = !query || node.relevance === 1;
          const particleDepth = Math.max(-32, Math.min(4, Math.round(node.z / 5 - 12)));
          return `<button id="fragment-focus-${index}" class="field-node field-node--${fragment.type}" style="--field-x:${node.x + (state.field?.camera?.x || 0)}px;--field-y:${node.y + (state.field?.camera?.y || 0)}px;--field-z:${node.z}px;--field-scale:${state.field?.camera?.scale || 1};--node-index:${index};opacity:${node.relevance}" type="button" data-field-node data-relevance="${relevant ? 'focused' : 'background'}" data-action="open-lens" data-fragment-id="${fragment.id}" data-particle-anchor="field-original-${index + 1}" data-particle-kind="fragment" data-particle-depth="${particleDepth}">
            ${renderFieldSource(fragment)}
            <span class="field-node__type">${typeLabel[fragment.type] || fragment.type}</span>
            <span class="field-node__label">${escapeHtml(fragment.evidencePreview)}</span>
          </button>`;
        }).join('')}
        <div class="field-relation-flow" aria-hidden="true"><i></i><i></i><i></i></div>
      </section>
      <aside class="field-legend"><strong>${fragments.length} 份代表原件</strong><span>完整索引共 172 个碎片</span><span>拖拽移动 · 滚轮或双指缩放</span></aside>
      <div class="field-primary">${primary('导入更多碎片', '#/world/import')}</div>
    </main>`,
  };
}

export function renderImportPage() {
  const batch = importBatches[0];
  return {
    sceneMode: 'import', scenePayload: { target: 'quiet', itemCount: batch.itemCount }, afterRender: null,
    html: `<main class="page import-page" data-page-id="world-import">
      <header><p class="eyebrow">导入一批混合媒介</p><h1>把原件放进同一个入口</h1><p>不需要先把照片、小票和截图分开。整理结束后，原件、待判断项和异常会分别回到它们该在的位置。</p></header>
      <section class="drop-field"><div class="drop-field__orbit" aria-hidden="true"><i></i><i></i><i></i></div><strong>选择照片、文件或文件夹</strong><span>当前批次：18 张照片 · 5 张截图 · 3 张小票 · 2 张票根</span><small>共 28 个原件</small></section>
      <section class="import-boundary"><h2>整理时会发生什么</h2><ol><li><span>01</span>先保存原件和来源</li><li><span>02</span>再读取时间、地点与票据文字</li><li><span>03</span>不确定项留给你判断</li></ol></section>
      ${primary('开始整理这 28 个原件', '#/world/inbox/receipt/batch-bangkok-backfill')}
    </main>`,
  };
}

export function renderReceiptPage(batchId) {
  const batch = importBatches.find((item) => item.id === batchId) || importBatches[0];
  return {
    sceneMode: 'import', scenePayload: { target: 'city-field', distribution: batch.result }, afterRender: null,
    html: `<main class="page receipt-page" data-page-id="world-receipt">
      <header><p class="eyebrow">这批碎片已经改变了世界</p><h1>整理回执</h1><p>${batch.itemCount} 个原件已保存，并分流到城市、地点、连接与待判断项。</p></header>
      <section class="receipt-distribution" aria-label="导入结果">
        <div class="receipt-core" aria-label="${batch.result.saved} 个原件"><strong>${batch.result.saved}</strong><span>个原件</span></div>
        <div class="receipt-stream receipt-stream--city" aria-label="${batch.result.cities} 座城市"><i></i><strong>${batch.result.cities}</strong><span>座城市</span></div>
        <div class="receipt-stream receipt-stream--place" aria-label="${batch.result.places} 个地点"><i></i><strong>${batch.result.places}</strong><span>个地点</span></div>
        <div class="receipt-stream receipt-stream--relation" aria-label="${batch.result.connections} 条新连接"><i></i><strong>${batch.result.connections}</strong><span>条新连接</span></div>
        <div class="receipt-stream receipt-stream--review" aria-label="${batch.result.needsReview} 项待判断"><i></i><strong>${batch.result.needsReview}</strong><span>项待判断</span></div>
      </section>
      <p class="receipt-truth">没有失败项，也没有重复原件。待判断内容不会被当作已确认事实。</p>
      ${primary('进入 Bangkok 看变化', '#/world/city/bangkok')}
    </main>`,
  };
}

export function renderInboxPage() {
  const review = reviewQueue[0];
  return {
    sceneMode: 'inbox', scenePayload: { target: 'inbox', state: 'uncertain' }, afterRender: null,
    html: `<main class="page inbox-page" data-page-id="world-inbox" data-visual-grade="S">
      <header><p class="inbox-wordmark">Elsewhere</p><p class="eyebrow">Fragment Inbox · 1 / 3</p><h1>这张交通截图是否也靠近 Chao Phraya Ferry？</h1><p>截图文字包含 ferry，但缺少可确认的具体码头。你的选择只会改变连接，不会修改原件。</p></header>
      <section class="review-comparison" aria-label="待比较的两份来源">
        <div class="review-source review-source--record" data-particle-anchor="inbox-source-record" data-particle-kind="fragment" data-particle-depth="-7"><span>SCREENSHOT · 22 OCT · 18:04</span><div class="review-source__document"><small>TRANSIT SEARCH</small><strong>ferry · riverside</strong><em>具体码头待确认</em></div></div>
        <div class="review-link" aria-hidden="true" data-particle-anchor="inbox-gap" data-particle-kind="connection" data-particle-depth="-5"><i></i><span>?</span><i></i></div>
        <div class="review-source review-source--photo" data-particle-anchor="inbox-source-photo" data-particle-kind="fragment" data-particle-depth="-9"><img src="/assets/bangkok-photo-02-riverside.jpg" alt="已确认的河岸原件"><span>PHOTO · 18 OCT · 17:59</span><strong>Chao Phraya Ferry</strong></div>
      </section>
      <section class="review-evidence" aria-label="支持与缺口">
        <div data-review-evidence><span>时间接近</span><strong>两份来源相隔 4 天</strong><small>中等支持</small></div>
        <div data-review-evidence><span>内容匹配</span><strong>都出现 ferry / riverside</strong><small>较强支持</small></div>
        <div data-review-evidence><span>仍有缺口</span><strong>截图没有具体码头</strong><small>需要你的判断</small></div>
      </section>
      <div class="review-choices">${review.choices.map((choice, index) => `<button type="button" data-review-choice data-action="review-choice" data-value="${index}"><span>${['✓', '×', '?'][index]}</span>${escapeHtml(choice)}</button>`).join('')}</div>
      <section class="inbox-queues"><div><span>正在整理</span><strong>${escapeHtml(processingItems[0].label)}</strong></div><div><span>需要原件</span><strong>${escapeHtml(exceptions[0].label)}</strong></div></section>
      ${primary('回到全部碎片', '#/world/fragments')}
    </main>`,
  };
}
