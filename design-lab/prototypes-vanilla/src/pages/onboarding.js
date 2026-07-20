import { currentMemoryCatalog } from '../data/view-model.js';
import { renderEvidenceCard, renderOriginalTile } from '../components/fragments.js';
import { renderTimeBridge } from '../components/relations.js';
import { escapeHtml } from '../components/primitives.js';

const primary = (label, route) => `<button class="primary-action" type="button" data-primary-action data-action="navigate" data-route="${route}">${label}</button>`;

const typeLabels = { photo: '照片', receipt: '小票', screenshot: '截图', ticket: '票根', menu: '菜单', text: '文字' };

function formatTypeSummary(batch, selected) {
  const counts = Object.keys(batch?.types || {}).length
    ? batch.types
    : selected.reduce((result, fragment) => ({ ...result, [fragment.type]: (result[fragment.type] || 0) + 1 }), {});
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `${count} ${typeLabels[type] || type}`)
    .join(' · ');
}

function minuteGap(left, right) {
  const duration = Math.round(Math.abs(new Date(right).getTime() - new Date(left).getTime()) / 60000);
  return Number.isFinite(duration) ? duration : null;
}

export function renderOnboarding(pageId, state = {}) {
  const catalog = currentMemoryCatalog();
  const batch = catalog.importBatches[0] || null;
  const selected = batch
    ? batch.representativeFragmentIds.map((id) => catalog.fragments.find((fragment) => fragment.id === id)).filter(Boolean)
    : catalog.fragments;
  const selectedCount = state.importFlow?.files?.length || batch?.itemCount || selected.length;
  if (pageId === 'onboarding-permissions') {
    return {
      sceneMode: 'quiet-tool', scenePayload: { target: 'quiet' }, afterRender: null,
      html: `<main class="page onboarding-tool" data-page-id="onboarding-permissions">
        <header><p class="eyebrow">先说清楚边界</p><h1>你的原件如何被读取</h1><p>这些权限只用于把时间、地点和票据文字放回同一段旅程。你可以稍后逐项关闭。</p></header>
        <section class="permission-list">
          <label><span><strong>照片与截图</strong><small>读取你主动选择的原件；不自动上传整个相册。</small></span><input type="checkbox" checked data-store-action="setting" data-key="photoAccess"></label>
          <label><span><strong>地点信息</strong><small>用于确认城市与地点；关闭后仍可手动安放。</small></span><input type="checkbox" data-store-action="setting" data-key="highAccuracyGPS"></label>
          <label><span><strong>票据文字识别</strong><small>读取商户、时间和金额；原件不会变成公开内容。</small></span><input type="checkbox" checked data-store-action="setting" data-key="cloudProcessing"></label>
        </section>
        <p class="privacy-note">敏感金额和精确地址默认不会出现在分享内容中。</p>
        ${primary('按当前选择继续', '#/onboarding/first-import')}
      </main>`,
    };
  }

  if (pageId === 'onboarding-first-import') {
    const visible = selected.slice(0, 7);
    const summary = formatTypeSummary(batch, selected);
    return {
      sceneMode: 'import', scenePayload: { target: 'quiet', selectedCount }, afterRender: null,
      html: `<main class="page onboarding-import" data-page-id="onboarding-first-import">
        <header><p class="eyebrow">放入第一批碎片</p><h1>不必先分类</h1><p>照片、截图、小票和票根可以一起放进来。Elsewhere 会保留原件，并把不确定项单独交给你判断。</p></header>
        ${visible.length ? `<section class="import-selection">
          ${visible.map((fragment, index) => renderOriginalTile(fragment, { index, label: typeLabels[fragment.type] || '原件' })).join('')}
          ${selectedCount > visible.length ? `<div class="import-selection__more">+${selectedCount - visible.length}</div>` : ''}
        </section>` : '<section class="import-selection import-selection--empty"><p>还没有选择原件。先从照片、截图或票据开始。</p></section>'}
        <div class="import-summary"><strong>${selectedCount ? `已选择 ${selectedCount} 个原件` : '尚未选择原件'}</strong>${summary ? `<span>${escapeHtml(summary)}</span>` : '<span>选择后会在这里显示真实构成</span>'}</div>
        ${primary(selectedCount ? '开始整理这批碎片' : '选择第一批碎片', '#/world/import')}
      </main>`,
    };
  }

  if (pageId === 'onboarding-processing') {
    const activeItem = catalog.processingItems[0] || null;
    const city = batch
      ? catalog.cities.find((item) => item.journeyId === batch.journeyCandidate)
      : null;
    if (!batch && !selectedCount) {
      return {
        sceneMode: 'processing', scenePayload: { target: 'quiet', itemCount: 0, progress: 0 }, afterRender: null,
        html: `<main class="page processing-page processing-page--empty" data-page-id="onboarding-processing">
          <header><p class="eyebrow">整理进度</p><h1>还没有正在整理的碎片</h1><p>选择原件后，真实保存和处理状态会在这里逐步出现。</p></header>
          ${primary('去选择原件', '#/world/import')}
        </main>`,
      };
    }
    return {
      sceneMode: 'processing', scenePayload: { target: 'quiet', itemCount: selectedCount, progress: activeItem ? 0.76 : 1 }, afterRender: null,
      html: `<main class="page processing-page" data-page-id="onboarding-processing">
        <header><p class="eyebrow">可以离开，整理会继续</p><h1>碎片正在找到彼此</h1></header>
        <div class="processing-orbit" aria-hidden="true"><i></i><i></i><i></i><i></i><span>${selectedCount}</span></div>
        <ol class="processing-stages">
          <li class="is-done"><span>01</span><div><strong>原件已保存</strong><small>${batch?.result?.saved ?? selectedCount} / ${selectedCount}</small></div></li>
          <li class="is-done"><span>02</span><div><strong>时间与城市已识别</strong><small>${city ? escapeHtml(city.name) : '按原件来源整理'}</small></div></li>
          <li class="${activeItem ? 'is-active' : 'is-done'}"><span>03</span><div><strong>${escapeHtml(activeItem?.label || '确定性整理已完成')}</strong><small>${catalog.reviewQueue.length ? `仍有 ${catalog.reviewQueue.length} 项需要你判断` : '没有待判断项'}</small></div></li>
        </ol>
        ${primary(catalog.connections.length ? '查看第一条连接' : '进入我的世界', catalog.connections.length ? '#/onboarding/first-connection' : '#/world')}
      </main>`,
    };
  }

  if (pageId === 'onboarding-first-connection') {
    const connection = catalog.connections.find((item) => [...(item.from || []), ...(item.to || [])].length >= 2) || null;
    const sourceIds = connection ? [...(connection.from || []), ...(connection.to || [])] : [];
    const [first, second] = sourceIds.map((id) => catalog.fragments.find((fragment) => fragment.id === id)).filter(Boolean);
    const place = connection ? catalog.places.find(({ id }) => id === connection.toEntityId) : null;
    if (!connection || !first || !second) {
      return {
        sceneMode: 'connection', scenePayload: { target: 'relations', itemCount: 0, items: [], relations: [] }, afterRender: null,
        html: `<main class="page first-connection first-connection--empty" data-page-id="onboarding-first-connection"><header><p class="eyebrow">第一条可解释连接</p><h1>还没有形成连接</h1><p>至少两份原件共享可验证的时间或地点后，关系才会在这里显影。</p></header>${primary('进入我的世界', '#/world')}</main>`,
      };
    }
    const gap = minuteGap(first.capturedAt, second.capturedAt);
    const from = first.capturedAt?.slice(11, 16) || '时间待确认';
    const to = second.capturedAt?.slice(11, 16) || '时间待确认';
    const firstType = typeLabels[first.type] || '原件';
    const secondType = typeLabels[second.type] || '原件';
    return {
      sceneMode: 'connection',
      scenePayload: {
        target: 'relations',
        durationMinutes: gap,
        itemCount: 2,
        items: [first, second].map((fragment) => ({ id: fragment.id, role: 'evidence', status: fragment.status })),
        relations: [{ id: connection.id, status: connection.status }],
      },
      afterRender: null,
      html: `<main class="page first-connection" data-page-id="onboarding-first-connection">
        <header><p class="eyebrow">第一条可解释连接</p><h1>${escapeHtml(firstType)}与${escapeHtml(secondType)}${gap == null ? '出现在同一条关系中' : `相隔 ${gap} 分钟`}</h1><p>${place ? `两份原件都与 ${escapeHtml(place.name)} 有可追溯关系。` : '两份原件共享可追溯来源。'}连接来自当前保存的事实，不是情绪猜测。</p></header>
        <section class="first-connection__evidence">
          ${renderEvidenceCard(first, { title: first.evidencePreview, detail: `${first.capturedAt?.slice(0, 10) || '日期待确认'} · ${from}` })}
          ${renderTimeBridge({ from, to, duration: gap == null ? '待确认' : `${gap} 分钟` })}
          ${renderEvidenceCard(second, { title: second.evidencePreview, detail: `${second.capturedAt?.slice(0, 10) || '日期待确认'} · ${to}` })}
        </section>
        <p class="connection-caveat">这条关系只表达当前来源能够支持的共同点，不会自动推断当时的感受。</p>
        ${primary('确认并进入我的世界', '#/world')}
      </main>`,
    };
  }

  return {
    sceneMode: 'processing', scenePayload: { target: 'deep-scatter', firstVisit: true }, afterRender: null,
    html: `<main class="page onboarding-intro" data-page-id="onboarding-intro">
      <div class="onboarding-intro__constellation" aria-hidden="true"><span>PHOTO</span><span>RECEIPT</span><span>MAP</span><span>TIME</span><span>PLACE</span></div>
      <header class="onboarding-intro__copy"><p class="eyebrow">Elsewhere</p><h1>让散落的旅行<br>重新长成一个世界</h1><p>照片、小票、截图、时间与地点会在同一空间里靠近。你保留原件，也保留最后解释权。</p></header>
      ${primary('进入世界首页', '#/world')}
    </main>`,
  };
}
