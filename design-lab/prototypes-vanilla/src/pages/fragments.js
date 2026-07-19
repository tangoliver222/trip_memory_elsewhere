import { cities, exceptions, fragments, importBatches, processingItems, reviewQueue, world } from '../fixtures/data.js';
import { createFieldController, createFieldLayout } from '../controllers/field-controller.js';
import { escapeHtml, renderMedia } from '../components/primitives.js';

const primary = (label, route) => `<button class="primary-action" type="button" data-primary-action data-action="navigate" data-route="${route}">${label}</button>`;

const typeLabel = { photo: '照片', receipt: '小票', ticket: '票根', menu: '菜单', screenshot: '截图' };
const processingStatusLabel = {
  pending: '等待', completed: '完成', skipped: '跳过', unresolved: '待确认', failed: '失败',
};

function renderProcessingTrace(trace = []) {
  if (!Array.isArray(trace) || trace.length === 0) return '';
  return `<section class="processing-provenance" aria-label="真实处理轨迹">
    <div class="processing-provenance__heading"><p class="eyebrow">PERSISTED PROCESSING</p><h2>这次真实执行</h2></div>
    <ol>${trace.map((stage, index) => `<li class="processing-stage processing-stage--${escapeHtml(stage.status)}">
      <span class="processing-stage__index">${String(index + 1).padStart(2, '0')}</span>
      <i aria-hidden="true"></i>
      <div><strong>${escapeHtml(stage.label)}</strong><small>${escapeHtml(stage.provider)} · ${escapeHtml(stage.detail)}</small></div>
      <em>${processingStatusLabel[stage.status] || escapeHtml(stage.status)}</em>
    </li>`).join('')}</ol>
  </section>`;
}

export function renderFragmentField(state) {
  const query = state.field?.filters?.query || '';
  const layout = createFieldLayout(query, { compact: Boolean(globalThis.innerWidth && globalThis.innerWidth <= 700) });
  const positions = Object.fromEntries(layout.map((node) => [node.id, node]));
  const clusters = cities
    .filter(({ fragmentCount }) => fragmentCount > 0)
    .map((city) => ({ slug: city.slug, weight: city.fragmentCount }));
  const unplacedCount = fragments.filter(({ cityId }) => !cityId).length;
  if (unplacedCount > 0) clusters.push({ slug: 'unplaced', weight: unplacedCount });
  return {
    sceneMode: 'fragment-field',
    scenePayload: { target: 'field', query, filters: state.field?.filters, clusters },
    afterRender({ pageRoot, store, sceneManager }) {
      const viewport = pageRoot?.querySelector?.('[data-field-viewport]');
      if (!viewport) return null;
      const controller = createFieldController({ viewport, store, sceneManager, scenePayload: { clusters } });
      const search = pageRoot.querySelector('[data-field-search]');
      const onSearch = (event) => controller.search(event.target.value);
      search?.addEventListener('input', onSearch);
      search?.addEventListener('search', onSearch);
      return () => { search?.removeEventListener('input', onSearch); search?.removeEventListener('search', onSearch); controller.destroy(); };
    },
    html: `<main class="page fragment-field" data-page-id="world-fragments">
      <header class="field-header">
        <div><p class="eyebrow">全部碎片 · 三维私人数据库</p><h1>Fragment Field</h1></div>
        <label class="field-search"><span class="visually-hidden">搜索碎片</span><input data-field-search data-store-action="field-query" type="search" value="${escapeHtml(query)}" placeholder="搜索地点、商户或原件"><kbd>⌘ K</kbd></label>
        <div class="field-filters" role="group" aria-label="原件类型">
          ${['all', 'photo', 'receipt', 'unresolved'].map((type) => `<button type="button" data-action="set-field-type" data-value="${type}" class="${state.field?.filters?.type === type ? 'is-active' : ''}">${{ all: '全部', photo: '照片', receipt: '票据', unresolved: '待安放' }[type]}</button>`).join('')}
        </div>
      </header>
      <section class="field-viewport" data-field-viewport aria-label="可拖拽和缩放的碎片空间">
        <div class="field-cluster-labels" aria-hidden="true">${cities.map((city) => `<span class="field-cluster-label field-cluster-label--${city.slug}">${escapeHtml(city.name)} · ${city.fragmentCount} 碎片</span>`).join('')}<span class="field-cluster-label field-cluster-label--unplaced">未安放 · ${fragments.filter(({ cityId }) => !cityId).length}</span></div>
        <div class="field-depth-grid" aria-hidden="true"><span>NEAR</span><span>MID</span><span>DEEP</span></div>
        ${fragments.map((fragment, index) => {
          const node = positions[fragment.id];
          const relevant = !query || node.relevance === 1;
          return `<button id="fragment-focus-${index}" class="field-node field-node--${fragment.type}" style="--field-x:${node.x + (state.field?.camera?.x || 0)}px;--field-y:${node.y + (state.field?.camera?.y || 0)}px;--field-z:${node.z}px;--field-scale:${state.field?.camera?.scale || 1};--node-index:${index};opacity:${node.relevance}" type="button" data-field-node data-relevance="${relevant ? 'focused' : 'background'}" data-action="open-lens" data-fragment-id="${fragment.id}">
            ${renderMedia(fragment, { className: 'field-node__media' })}
            <span class="field-node__type">${typeLabel[fragment.type] || fragment.type}</span>
            <span class="field-node__label">${escapeHtml(fragment.evidencePreview)}</span>
            ${fragment.ocr ? `<span class="field-node__provenance">Document AI · ${fragment.ocr.pageCount} 页</span>` : ''}
          </button>`;
        }).join('')}
      </section>
      <aside class="field-legend"><strong>${fragments.length} 份代表原件</strong><span>完整索引共 ${world.totalFragments} 个碎片</span><span>拖拽移动 · 滚轮或双指缩放</span></aside>
      <div class="field-primary">${primary('导入更多碎片', '#/world/import')}</div>
    </main>`,
  };
}

export function renderImportPage(state = {}) {
  if (state.runtime?.mode === 'live') {
    const flow = state.importFlow || { status: 'idle', files: [], progress: {}, failures: [] };
    const busy = ['creating', 'uploading', 'processing'].includes(flow.status);
    const progressValues = Object.values(flow.progress || {});
    const progress = progressValues.length > 0
      ? Math.round((progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length) * 100)
      : 0;
    const statusLabel = {
      idle: '请选择 1–15 个真实原件',
      selected: `已选择 ${flow.files.length} 个原件`,
      creating: '正在创建安全上传清单',
      uploading: `正在上传原件 · ${progress}%`,
      processing: '正在读取格式、时间、地点与重复关系',
      complete: '全部原件已完成确定性处理',
      partial: `${flow.failures.length} 个原件需要重试，其余已保留`,
      failed: '这批原件尚未完成，请检查本地服务后重试',
    }[flow.status] || '准备导入';
    return {
      sceneMode: 'import',
      scenePayload: { target: 'import', itemCount: flow.files.length },
      afterRender: null,
      html: `<main class="page import-page import-page--live" data-page-id="world-import">
        <header><p class="eyebrow">真实原件导入</p><h1>把这一段旅行交给记忆空间</h1><p>原件会先保存，再进行确定性的格式、时间、地点、哈希与重复检测。无法确认的内容会留在收件箱，不会被猜测。</p></header>
        <label class="drop-field drop-field--live" for="live-import-files">
          <div class="drop-field__orbit" aria-hidden="true"><i></i><i></i><i></i></div>
          <strong>${escapeHtml(statusLabel)}</strong>
          <span>JPEG · PNG · WebP · TXT</span>
          <small>点击选择，或把文件拖到这里</small>
          <input id="live-import-files" data-live-files data-store-action="live-files" type="file" accept="image/jpeg,image/png,image/webp,text/plain" multiple ${busy ? 'disabled' : ''}>
        </label>
        ${flow.files.length > 0 ? `<ol class="live-file-list">${flow.files.map((file, index) => `<li><span>${String(index + 1).padStart(2, '0')}</span><strong>${escapeHtml(file.name)}</strong><small>${Math.max(1, Math.round(file.size / 1024))} KB</small></li>`).join('')}</ol>` : ''}
        <section class="import-boundary"><h2>这次真实执行</h2><ol><li><span>01</span>创建 owner-scoped 上传清单</li><li><span>02</span>保存并校验真实文件字节</li><li><span>03</span>确定性处理后重组页面与粒子</li></ol></section>
        <button class="primary-action" type="button" data-primary-action data-action="run-live-import" ${(flow.files.length === 0 || busy) ? 'disabled' : ''}>${busy ? statusLabel : `开始整理 ${flow.files.length || ''} 个原件`}</button>
      </main>`,
    };
  }
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
  if (!batch) {
    return {
      sceneMode: 'import',
      scenePayload: { target: 'quiet' },
      afterRender: null,
      html: `<main class="page receipt-page" data-page-id="world-receipt"><header><p class="eyebrow">整理回执</p><h1>这批原件仍在处理中</h1><p>回执会在服务器保存首个真实原件后出现。</p></header>${primary('返回导入', '#/world/import')}</main>`,
    };
  }
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
      <p class="receipt-truth">${batch.result.failed === 0 ? '没有终态失败项。' : `${batch.result.failed} 个原件处理失败。`} 待判断内容不会被当作已确认事实。</p>
      ${renderProcessingTrace(batch.processingTrace)}
      ${primary('进入 Bangkok 看变化', '#/world/city/bangkok')}
    </main>`,
  };
}

export function renderInboxPage() {
  const review = reviewQueue[0];
  return {
    sceneMode: 'quiet-tool', scenePayload: { target: 'quiet' }, afterRender: null,
    html: `<main class="page inbox-page" data-page-id="world-inbox">
      <header class="inbox-header"><p class="eyebrow">收件箱 · 一次只做一个判断</p><h1>这张交通截图<br>是否也靠近<br>Chao Phraya Ferry？</h1><p>截图文字包含 ferry，但缺少可确认的具体码头。你的选择会改变地点连接，不会修改原件。</p></header>
      <section class="review-comparison"><div class="review-source review-source--pending"><span>22 OCT · 18:04</span><strong>交通截图</strong><small>具体码头待确认</small></div><div class="review-link" aria-hidden="true"><i></i><span class="review-link__question">?</span><i></i></div><div class="review-source"><img src="/assets/bangkok-photo-02-riverside.jpg" alt="已确认的河岸原件"><span>18 OCT · 17:59</span><strong>Chao Phraya Ferry</strong></div></section>
      <div class="review-choices">${review.choices.map((choice, index) => `<button type="button" data-review-choice data-action="review-choice" data-value="${index}">${escapeHtml(choice)}</button>`).join('')}</div>
      <section class="inbox-queues"><div class="inbox-queue-item"><span>正在整理</span><strong>${escapeHtml(processingItems[0].label)}</strong></div><div class="inbox-queue-item"><span>需要原件</span><strong>${escapeHtml(exceptions[0].label)}</strong></div></section>
      ${primary('回到全部碎片', '#/world/fragments')}
    </main>`,
  };
}
