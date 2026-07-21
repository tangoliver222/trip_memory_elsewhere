import { settings } from '../fixtures/data.js';
import { indexes } from '../fixtures/indexes.js';
import { currentMemoryCatalog, getMemoryView } from '../data/view-model.js';
import { escapeHtml } from '../components/primitives.js';

const primary = (label, route, extra = '') => `<button class="primary-action" type="button" data-primary-action ${extra || `data-action="navigate" data-route="${route}"`}>${label}</button>`;
const quiet = (html) => ({ html, sceneMode: 'quiet-tool', scenePayload: { target: 'quiet', opacity: 0.24 }, afterRender: null });

const icon = (name) => `<span class="settings-icon settings-icon--${name}" aria-hidden="true"><i></i></span>`;

export function renderMeHome() {
  const catalog = currentMemoryCatalog();
  const memory = getMemoryView();
  const counts = memory.world.counts;
  return quiet(`<main class="page me-home" data-page-id="me-home">
    <header class="me-identity"><div class="me-monogram">你</div><div><p class="eyebrow">私人旅行世界</p><h1>我与 Elsewhere</h1><p>${counts.cities} 座城市 · ${counts.fragments} 个碎片 · ${catalog.discoveries.length} 个代表发现</p></div></header>
    <section class="private-world-status"><div class="private-world-status__orb" aria-hidden="true"><i></i><i></i><span>${counts.fragments}</span></div><div><span>原件与解释彼此分开</span><h2>${counts.fragments ? '你的文字始终属于你' : '世界会从第一份原件开始'}</h2><p>Elsewhere 可以整理来源与关系，但不会把推断写成你的感受。</p></div></section>
    <nav class="settings-groups" aria-label="个人与设置">
      <div>
        <button type="button" data-action="navigate" data-route="#/me/writing">${icon('writing')}<span><strong>我的书写</strong><small>${catalog.userNotes.length} 段私人文字</small></span><b>›</b></button>
        <button type="button" data-action="navigate" data-route="#/me/privacy">${icon('privacy')}<span><strong>隐私与权限</strong><small>Else 可以读取和保存什么</small></span><b>›</b></button>
        <button type="button" data-action="navigate" data-route="#/me/preferences">${icon('tone')}<span><strong>外观与叙述</strong><small>事实优先 · 简体中文</small></span><b>›</b></button>
      </div>
      <div>
        <button type="button" data-action="navigate" data-route="#/me/storage">${icon('storage')}<span><strong>数据与存储</strong><small>原件、派生数据与缓存</small></span><b>›</b></button>
        <button type="button" data-action="navigate" data-route="#/me/export">${icon('export')}<span><strong>导出与删除</strong><small>先看影响，再执行操作</small></span><b>›</b></button>
      </div>
    </nav>
    <footer class="me-about"><span>Elsewhere · Prototype 6.6</span><a href="mailto:feedback@elsewhere.memory">关于与反馈</a></footer>
    ${primary('查看我的书写', '#/me/writing')}
  </main>`);
}

const relatedLabel = (note) => {
  const related = note.related[0];
  return indexes.journeysById[related]?.label
    || indexes.placesById[related]?.name
    || indexes.scenesById[related]?.label
    || indexes.discoveriesById[related]?.title
    || (related?.startsWith('rel-') ? '一条已建立连接' : '旅行世界');
};

export function renderWritingList() {
  const notes = currentMemoryCatalog().userNotes;
  if (!notes.length) return quiet(`<main class="page writing-page" data-page-id="me-writing"><header class="tool-header"><p class="eyebrow">我的书写</p><h1>还没有写下私人文字</h1><p>只有你主动写下的内容才会出现在这里。</p></header>${primary('回到我的设置', '#/me')}</main>`);
  return quiet(`<main class="page writing-page" data-page-id="me-writing">
    <header class="tool-header"><p class="eyebrow">只有你写下的，才会出现在这里</p><h1>我的书写</h1><p>城市反思、地点命名、场景注释与未来信保持线性顺序，不与机器观察混在一起。</p></header>
    <section class="writing-track">${notes.map((note, index) => `<button type="button" data-action="navigate" data-route="#/me/writing/${note.id}" style="--writing-order:${index}"><time>${note.createdAt || '草稿'}</time><blockquote>“${escapeHtml(note.text)}”</blockquote><span>${escapeHtml(relatedLabel(note))}</span><i></i></button>`).join('')}</section>
    ${primary('打开最近一段书写', `#/me/writing/${notes[0].id}`)}
  </main>`);
}

export function renderWritingDetail(noteId, state) {
  const note = currentMemoryCatalog().userNotes.find(({ id }) => id === noteId);
  if (!note) return quiet(`<main class="page writing-editor" data-page-id="me-writing-detail"><header class="tool-header"><p class="eyebrow">我的书写</p><h1>这段文字不存在</h1><p>当前数据中没有这条私人文字。</p></header>${primary('回到我的书写', '#/me/writing')}</main>`);
  const text = state.notes?.[note.id] ?? note.text;
  return quiet(`<main class="page writing-editor" data-page-id="me-writing-detail">
    <header class="tool-header"><p class="eyebrow">${escapeHtml(note.createdAt || '草稿')} · ${escapeHtml(relatedLabel(note))}</p><h1>一段只属于你的解释</h1><p>编辑不会改变原件、时间、地点或连接。</p></header>
    <div class="writing-paper"><span>YOUR WORDS</span><textarea data-store-action="note-editor" data-note-id="${note.id}" aria-label="书写内容">${escapeHtml(text)}</textarea><div class="writing-paper__rule"></div></div>
    <section class="writing-relations"><span>关联到</span><div><i></i><strong>${escapeHtml(relatedLabel(note))}</strong><small>移除关联不会删除文字</small></div></section>
    ${primary('保存修改', '#/me/writing', `data-action="save-note" data-note-id="${escapeHtml(note.id)}"`)}
  </main>`);
}

export function renderPrivacy(state) {
  const current = { ...settings, ...state.settings };
  return quiet(`<main class="page privacy-page" data-page-id="me-privacy">
    <header class="tool-header"><p class="eyebrow">每个开关都说明关闭影响</p><h1>隐私与权限</h1><p>你的选择会通过认证服务保存；设备系统权限仍由操作系统单独管理。</p></header>
    <section class="privacy-boundary"><div class="privacy-boundary__rings" aria-hidden="true"><i></i><i></i><span>YOU</span></div><div><strong>Else 的当前读取范围</strong><p>默认只读取当前页面关联的来源。原件、派生关系和你的文字保持可区分。</p></div></section>
    <section class="control-list">
      <label><span><strong>模糊敏感内容</strong><small>关闭后，原件查看器可能显示完整票据金额。</small></span><input type="checkbox" data-store-action="setting" data-key="sensitiveBlur" ${current.sensitiveBlur ? 'checked' : ''}></label>
      <label><span><strong>高精度地点</strong><small>关闭后只保留城市或手动确认的地点。</small></span><input type="checkbox" data-store-action="setting" data-key="highAccuracyGPS" ${current.highAccuracyGPS ? 'checked' : ''}></label>
      <label><span><strong>派生关系处理</strong><small>关闭后仍保留原件，但不再生成新的地点与连接候选。</small></span><input type="checkbox" data-store-action="setting" data-key="cloudProcessing" ${current.cloudProcessing ? 'checked' : ''}></label>
      <label><span><strong>应用锁</strong><small>真实设备接入后可使用系统认证保护入口。</small></span><input type="checkbox" data-store-action="setting" data-key="appLock" ${current.appLock ? 'checked' : ''}></label>
    </section>
    <p class="tool-caveat">产品偏好会同步到你的私有空间；这里不会声称已修改系统权限。</p>
    ${primary('完成', '#/me')}
  </main>`);
}

export function renderPreferences(state) {
  const tone = state.settings?.aiTone || 'fact';
  const catalog = currentMemoryCatalog();
  const connection = catalog.connections.find((item) => item.type === 'same_visit' && item.toEntityId && [...(item.from || []), ...(item.to || [])].length >= 2)
    || catalog.connections.find((item) => item.toEntityId && [...(item.from || []), ...(item.to || [])].length >= 2)
    || catalog.connections[0];
  const sourceFragments = connection
    ? [...(connection.from || []), ...(connection.to || [])].map((id) => catalog.fragments.find((fragment) => fragment.id === id)).filter(Boolean)
    : [];
  const capturedTimes = sourceFragments.map(({ capturedAt }) => capturedAt?.slice(11, 16)).filter(Boolean);
  const sourceFact = connection
    ? [...(connection.evidence || []), capturedTimes.length > 1 ? `来源时间：${capturedTimes.join(' 与 ')}` : null].filter(Boolean).join('；')
    : '当前还没有足够来源形成一条连接。';
  const examples = [
    ['fact', '事实优先', sourceFact],
    ['balanced', '平衡', connection ? `当前来源共同支持：${sourceFact}` : sourceFact],
    ['narrative', '叙事', connection ? `沿着原件回看，这条连接由以下事实形成：${sourceFact}` : sourceFact],
  ];
  return quiet(`<main class="page preferences-page" data-page-id="me-preferences">
    <header class="tool-header"><p class="eyebrow">表达方式不会改变事实</p><h1>外观与叙述</h1><p>用同一组来源比较三个语气；你随时可以改回事实优先。</p></header>
    <section class="tone-examples">${examples.map(([value,label,copy]) => `<label class="${tone === value ? 'is-selected' : ''}"><input type="radio" name="tone" value="${value}" data-store-action="setting" data-key="aiTone" ${tone === value ? 'checked' : ''}><span>${label}</span><p>${copy}</p><i></i></label>`).join('')}</section>
    <section class="language-row"><span>语言</span><strong>简体中文</strong><small>日期与地点名称保留来源中的原文</small></section>
    ${primary('完成', '#/me')}
  </main>`);
}

export function renderStorage(state) {
  const catalog = currentMemoryCatalog();
  const total = getMemoryView().world.counts.fragments;
  return quiet(`<main class="page storage-page" data-page-id="me-storage">
    <header class="tool-header"><p class="eyebrow">删除缓存不会触碰原件</p><h1>数据与存储</h1><p>当前演示不伪造设备字节数，因此按对象类型和影响展示构成。</p></header>
    <section class="storage-composition">
      <div class="storage-ring"><i></i><span>${total}</span><small>索引碎片</small></div>
      <div class="storage-legend"><div><i class="is-original"></i><span>原件</span><strong>${catalog.fragments.length} 份可回溯原件</strong></div><div><i class="is-derived"></i><span>派生数据</span><strong>${catalog.places.length} 地点 · ${catalog.scenes.length} 场景 · ${catalog.connections.length} 连接</strong></div><div><i class="is-cache"></i><span>预览缓存</span><strong>${state.cacheCleared ? '本次会话已清理' : '可安全重建'}</strong></div></div>
    </section>
    <section class="storage-impact"><h2>清理预览缓存后</h2><ul><li>原件、你的文字和已确认连接不会删除</li><li>缩略图与临时粒子布局会在下次进入时重建</li><li>当前演示不声称释放真实设备容量</li></ul></section>
    ${primary(state.cacheCleared ? '缓存已清理' : '清理预览缓存', '#/me/storage', 'data-action="clear-cache"')}
  </main>`);
}

export function renderExportPage() {
  const memory = getMemoryView();
  const city = memory.world.recommendedCity;
  const context = city ? memory.city(city.slug) : null;
  const impact = context ? {
    fragments: context.fragments,
    scenes: context.scenes,
    connections: context.connections,
    discoveries: context.discoveries,
    userNotes: context.notes,
  } : null;
  return quiet(`<main class="page export-page" data-page-id="me-export">
    <header class="tool-header"><p class="eyebrow">先带走，再决定是否删除</p><h1>导出与删除</h1><p>导出会生成可读的数据说明；当前原型不会把未提供的原件伪装进导出包。</p></header>
    <section class="export-options"><div><span>01</span><h2>旅行世界数据</h2><p>城市、场景、地点、连接、发现与我的书写。</p><button type="button" data-action="export-data">导出 JSON</button></div>${city ? `<div><span>02</span><h2>分享用 Capsule</h2><p>默认隐藏金额、精确地址和私人笔记。</p><button type="button" data-action="open-share" data-title="${escapeHtml(city.name)} · City Capsule">预览分享</button></div>` : ''}</section>
    ${impact ? `<section class="delete-zone"><div class="delete-zone__header"><span>不可撤销操作</span><h2>删除 ${escapeHtml(city.name)} · ${escapeHtml(city.period)}</h2></div><div class="delete-impact"><h3>将影响</h3><ul><li>${impact.fragments.length} 份可回溯原件</li><li>${impact.scenes.length} 个场景</li><li>${impact.connections.length} 条连接</li><li>${impact.discoveries.length} 个发现</li><li>${impact.userNotes.length} 段我的书写</li><li>${impact.fragments.length ? '1' : '0'} 本 City Capsule</li></ul><p>原型只展示影响，不会在未点击最终操作时改变数据。</p></div><button class="danger-action" type="button" data-action="open-delete" data-target-id="${escapeHtml(city.journeyId)}">确认删除</button></section>` : '<p class="tool-caveat">当前没有可以删除的城市旅程。</p>'}
    ${primary('返回我的设置', '#/me')}
  </main>`);
}
