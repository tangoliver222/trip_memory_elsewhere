import { store } from "../store.js";

export function renderDiscoverPage(route, state) {
  const pageId = route.pageId;
  const params = route.params || {};

  // HELPER to get strength confidence from status
  function getConfidence(status) {
    if (status === "new") return 95;
    if (status === "supported") return 100;
    return 75;
  }

  // 1. DISCOVER HOME VIEW
  if (pageId === "discover-home") {
    return `
      <div class="p-6 space-y-6 fade-in text-stone-200">
        <div>
          <span class="text-[10px] font-mono tracking-widest text-stone-500 uppercase">Discover List</span>
          <h1 class="text-2xl font-display font-medium text-white mt-1">显影的线索</h1>
        </div>

        <p class="text-sm text-stone-400">
          Elsewhere 通过对比你在不同日子重叠的空间轨迹，提取出你在旅行中潜意识建立的常去地和故事链：
        </p>

        <div class="space-y-4">
          ${state.discoveries.map(disc => {
            const confidence = getConfidence(disc.status);
            const fragmentCount = disc.supportingFragments ? disc.supportingFragments.length : 0;
            return `
              <div class="archive-card p-5 relative overflow-hidden flex justify-between items-center" 
                   onclick="window.location.hash='#/discover/${disc.id}'">
                <div class="space-y-2">
                  <span class="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 text-[9px] border border-amber-500/20 font-mono uppercase">
                    ${confidence}% 确信
                  </span>
                  <h3 class="text-lg font-display text-white mt-1">${disc.title}</h3>
                  <p class="text-xs text-stone-400 font-serif italic">"${disc.observation}"</p>
                  <div class="flex gap-2 text-[10px] text-stone-500 font-mono pt-1">
                    <span>${fragmentCount} 个原件</span>
                    <span>·</span>
                    <span>曼谷</span>
                  </div>
                </div>
                <svg class="w-5 h-5 text-stone-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // 2. DISCOVER DETAIL VIEW
  if (pageId === "discover-detail") {
    const discId = params.id || "disc-ari-mornings";
    const discovery = state.discoveries.find(d => d.id === discId) || {};
    const fragmentsList = discovery.supportingFragments || [];

    return `
      <div class="p-6 space-y-6 fade-in text-stone-200">
        <div class="flex items-center gap-3">
          <a href="#/discover" class="p-1 rounded hover:bg-stone-800 text-stone-400 hover:text-white">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </a>
          <div>
            <span class="text-[9px] font-mono tracking-widest text-stone-500 uppercase">Clue Detail</span>
            <h1 class="text-xl font-display font-medium text-white">${discovery.title || ''}</h1>
          </div>
        </div>

        <div class="text-center py-6 border-b border-stone-850">
          <p class="serif-quote text-stone-300">
            "${discovery.observation || ''}"
          </p>
        </div>

        <div class="space-y-4">
          <h3 class="text-xs font-mono tracking-wider text-stone-500 uppercase">证据支撑点</h3>

          <!-- Evidence List -->
          <div class="space-y-3">
            ${fragmentsList.map(elemId => {
              const frag = state.fragments.find(f => f.id === elemId) || {};
              const typeLabel = frag.type ? frag.type.toUpperCase() : "原件";
              return `
                <div class="p-4 bg-stone-900 border border-stone-800 rounded-xl flex justify-between items-center cursor-pointer" 
                     onclick="window.openFragmentLens('${elemId}')">
                  <div>
                    <span class="text-[9px] font-mono text-stone-400">${typeLabel}</span>
                    <h4 class="text-sm font-medium text-white mt-1">${frag.id}</h4>
                    <p class="text-xs text-stone-500">${frag.evidencePreview || frag.ocrText || '时空对齐碎片'}</p>
                  </div>
                  <svg class="w-4 h-4 text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div class="bg-stone-950 p-4 border border-stone-900 rounded-xl">
          <span class="text-[9px] font-mono tracking-wider text-stone-500 block uppercase">PRIVATE DIARY REFLECTION</span>
          <textarea class="w-full bg-transparent border-0 outline-0 text-sm text-stone-300 mt-2 font-serif focus:ring-0 leading-relaxed min-h-[100px]" 
                    placeholder="在这里补全你的个人日记与回忆笔谈，只有你可见..."></textarea>
        </div>
      </div>
    `;
  }

  return `<div class="p-4">Unknown Discover route ${pageId}</div>`;
}
