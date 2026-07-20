import { fragments, processingItems } from '../fixtures/data.js';
import { renderEvidenceCard, renderOriginalTile } from '../components/fragments.js';
import { renderTimeBridge } from '../components/relations.js';

const primary = (label, route) => `<button class="primary-action" type="button" data-primary-action data-action="navigate" data-route="${route}">${label}</button>`;

export function renderOnboarding(pageId) {
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
    return {
      sceneMode: 'import', scenePayload: { target: 'quiet', selectedCount: 28 }, afterRender: null,
      html: `<main class="page onboarding-import" data-page-id="onboarding-first-import">
        <header><p class="eyebrow">放入第一批碎片</p><h1>不必先分类</h1><p>照片、截图、小票和票根可以一起放进来。Elsewhere 会保留原件，并把不确定项单独交给你判断。</p></header>
        <section class="import-selection">
          ${fragments.slice(0, 7).map((fragment, index) => renderOriginalTile(fragment, { index, label: ['照片','小票','照片','小票','船票','照片','街景'][index] })).join('')}
          <div class="import-selection__more">+21</div>
        </section>
        <div class="import-summary"><strong>已选择 28 个原件</strong><span>18 照片 · 5 截图 · 3 小票 · 2 票根</span></div>
        ${primary('开始整理这批碎片', '#/onboarding/processing')}
      </main>`,
    };
  }

  if (pageId === 'onboarding-processing') {
    return {
      sceneMode: 'processing', scenePayload: { target: 'quiet', progress: 0.76 }, afterRender: null,
      html: `<main class="page processing-page" data-page-id="onboarding-processing">
        <header><p class="eyebrow">可以离开，整理会继续</p><h1>碎片正在找到彼此</h1></header>
        <div class="processing-orbit" aria-hidden="true"><i></i><i></i><i></i><i></i><span>28</span></div>
        <ol class="processing-stages">
          <li class="is-done"><span>01</span><div><strong>原件已保存</strong><small>28 / 28</small></div></li>
          <li class="is-done"><span>02</span><div><strong>时间与城市已识别</strong><small>Bangkok · 2024 秋</small></div></li>
          <li class="is-active"><span>03</span><div><strong>${processingItems[0].label}</strong><small>仍有 2 项需要你判断</small></div></li>
        </ol>
        ${primary('查看第一条连接', '#/onboarding/first-connection')}
      </main>`,
    };
  }

  if (pageId === 'onboarding-first-connection') {
    const ticket = fragments.find((item) => item.type === 'ticket');
    const photo = fragments.find((item) => item.evidencePreview.startsWith('河岸照片'));
    return {
      sceneMode: 'connection', scenePayload: { target: 'relations', durationMinutes: 17 }, afterRender: null,
      html: `<main class="page first-connection" data-page-id="onboarding-first-connection">
        <header><p class="eyebrow">第一条可解释连接</p><h1>一张船票，十七分钟后的一张照片</h1><p>两份原件都靠近 Chao Phraya Ferry。连接来自时间与地点来源，不是情绪猜测。</p></header>
        <section class="first-connection__evidence">
          ${renderEvidenceCard(ticket, { title: '渡船票根', detail: '18 OCT · 17:42 · 票据文字' })}
          ${renderTimeBridge({ from: '17:42', to: '17:59', duration: '17 分钟' })}
          ${renderEvidenceCard(photo, { title: '河岸照片', detail: '18 OCT · 17:59 · 拍摄时间' })}
        </section>
        <p class="connection-caveat">这说明它们很可能属于同一次候船，但不会自动推断当时的感受。</p>
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
