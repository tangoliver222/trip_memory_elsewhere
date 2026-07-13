import { store } from "../store.js";

// Active filter state for discoveries page
if (window.activeDiscoverFilter === undefined) {
  window.activeDiscoverFilter = "all";
}

// Mount state-writing helpers into global window context for vanilla click triggers
window.setDiscoverFilter = function(filter) {
  window.activeDiscoverFilter = filter;
  store.notify(); // trigger reactive re-render
};

window.saveDiscoveryAction = function(id) {
  const titleVal = document.getElementById("disc-edit-title")?.value;
  const obsVal = document.getElementById("disc-edit-obs")?.value;
  const noteVal = document.getElementById("disc-edit-note")?.value;
  store.updateDiscovery(id, titleVal, obsVal, noteVal);
  
  // Show temporary toast feedback instead of crude window alert
  const toast = document.createElement("div");
  toast.className = "fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 bg-stone-900 border border-stone-800 text-amber-500 rounded-full text-xs font-mono tracking-wider z-[9999] shadow-2xl animate-fade-in";
  toast.innerText = "✓ MEMORY ALIGNMENT SAVED & NAMED";
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
};

export function renderDiscoverPage(route, state) {
  const pageId = route.pageId;
  const params = route.params || {};

  function getStatusLabel(status) {
    if (status === "new") return "新显影 · 待确认";
    if (status === "supported") return "跨旅程 · 已证实";
    if (status === "unresolved") return "未决 · 待对齐";
    if (status === "saved") return "已命名 · 记忆闭合";
    return "系统推演线索";
  }

  // 1. DISCOVER HOME VIEW (线索总览)
  if (pageId === "discover-home") {
    // Get all discoveries from store
    const allDiscoveries = state.discoveries;

    // Filter them depending on selected filter state
    const currentFilter = window.activeDiscoverFilter;
    let filteredDiscoveries = allDiscoveries;

    if (currentFilter === "new") {
      filteredDiscoveries = allDiscoveries.filter(d => d.status === "new");
    } else if (currentFilter === "supported") {
      filteredDiscoveries = allDiscoveries.filter(d => d.status === "supported");
    } else if (currentFilter === "unresolved") {
      filteredDiscoveries = allDiscoveries.filter(d => d.status === "unresolved" || d.id === "disc-river-open-thread");
    } else if (currentFilter === "saved") {
      filteredDiscoveries = allDiscoveries.filter(d => d.status === "saved");
    }

    // Helper to render supporting fragments cluster (支撑碎片集合)
    function renderFragmentsCluster(fragIds) {
      return `
        <div class="mt-4 pt-3.5 border-t border-stone-900/60">
          <span class="text-[8px] font-mono text-stone-500 uppercase tracking-widest block mb-2">支撑碎片集合 (Supporting Fragments Group)</span>
          <div class="grid grid-cols-3 gap-2">
            ${fragIds.map(fid => {
              const f = state.fragments.find(x => x.id === fid);
              if (!f) return "";
              
              let typeLabel = "📸";
              if (f.type === "receipt") typeLabel = "📄";
              if (f.type === "ticket") typeLabel = "🎫";
              if (f.type === "screenshot") typeLabel = "🗺️";

              const timeStr = f.capturedAt ? f.capturedAt.split("T")[1].substring(0, 5) : "";
              const dateStr = f.capturedAt ? f.capturedAt.split("T")[0].substring(5) : "";

              return `
                <div class="p-2 bg-stone-950/70 border border-stone-900/80 rounded-lg flex flex-col justify-between h-[56px] hover:border-amber-500/20 transition-all">
                  <div class="flex items-center justify-between">
                    <span class="text-[9px] font-mono">${typeLabel}</span>
                    <span class="text-[7.5px] font-mono text-stone-600">${dateStr} ${timeStr}</span>
                  </div>
                  <p class="text-[8.5px] font-sans text-stone-400 truncate mt-1">${f.placeCandidate || "未知地点"}</p>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    // Render filter buttons HTML
    const filterTabsHtml = `
      <div class="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-none font-mono text-[10px]">
        <button onclick="window.setDiscoverFilter('all')" 
                class="px-3 py-1.5 rounded-lg border transition-all shrink-0 ${currentFilter === "all" ? "bg-stone-900 text-amber-500 border-stone-800 font-semibold" : "bg-transparent text-stone-500 border-transparent hover:text-stone-300"}">
          全部
        </button>
        <button onclick="window.setDiscoverFilter('new')" 
                class="px-3 py-1.5 rounded-lg border transition-all shrink-0 ${currentFilter === "new" ? "bg-stone-900 text-amber-500 border-stone-800 font-semibold" : "bg-transparent text-stone-500 border-transparent hover:text-stone-300"}">
          新显影
        </button>
        <button onclick="window.setDiscoverFilter('supported')" 
                class="px-3 py-1.5 rounded-lg border transition-all shrink-0 ${currentFilter === "supported" ? "bg-stone-900 text-amber-500 border-stone-800 font-semibold" : "bg-transparent text-stone-500 border-transparent hover:text-stone-300"}">
          跨旅程
        </button>
        <button onclick="window.setDiscoverFilter('unresolved')" 
                class="px-3 py-1.5 rounded-lg border transition-all shrink-0 ${currentFilter === "unresolved" ? "bg-stone-900 text-amber-500 border-stone-800 font-semibold" : "bg-transparent text-stone-500 border-transparent hover:text-stone-300"}">
          未决
        </button>
        <button onclick="window.setDiscoverFilter('saved')" 
                class="px-3 py-1.5 rounded-lg border transition-all shrink-0 ${currentFilter === "saved" ? "bg-stone-900 text-amber-500 border-stone-800 font-semibold" : "bg-transparent text-stone-500 border-transparent hover:text-stone-300"}">
          已保存/已命名
        </button>
      </div>
    `;

    // Curated curated display for 'all' filter as requested
    let listContentHtml = "";
    if (currentFilter === "all") {
      const keyFocus = allDiscoveries.find(d => d.id === "disc-ari-mornings");
      const crossJourney = allDiscoveries.find(d => d.id === "disc-river-evidence");
      const unresolvedGap = allDiscoveries.find(d => d.id === "disc-river-open-thread");
      const savedCount = allDiscoveries.filter(d => d.status === "saved").length;

      listContentHtml = `
        <div class="space-y-6">
          <!-- 1. Key Focus Discovery (重点发现) -->
          ${keyFocus ? `
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-[8px] font-mono text-amber-500 uppercase tracking-widest block">✦ 重点发现 (Focus Discovery)</span>
                <span class="px-2 py-0.5 rounded bg-amber-500/5 text-[8.5px] font-mono text-amber-500 uppercase border border-amber-500/10">时空高置信度</span>
              </div>
              <div class="archive-card p-5 relative overflow-hidden bg-gradient-to-br from-stone-950 via-stone-950 to-stone-900 border border-stone-850 hover:border-amber-500/20 transition-all cursor-pointer rounded-2xl" 
                   onclick="window.location.hash='#/discover/${keyFocus.id}'">
                <div class="space-y-2">
                  <div class="flex items-center gap-1.5">
                    <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                    <span class="text-[8.5px] font-mono text-stone-400 tracking-wider uppercase">${getStatusLabel(keyFocus.status)}</span>
                  </div>
                  <h3 class="text-base font-medium text-white font-display">${keyFocus.title}</h3>
                  <p class="text-xs text-stone-400 font-sans leading-relaxed mt-1 italic select-text">"${keyFocus.observation}"</p>
                  
                  <!-- Render cluster -->
                  ${renderFragmentsCluster(keyFocus.supportingFragments)}
                </div>
              </div>
            </div>
          ` : ""}

          <!-- 2. Cross Journey Discovery (跨旅程) -->
          ${crossJourney ? `
            <div class="space-y-2">
              <span class="text-[8px] font-mono text-stone-500 uppercase tracking-widest block">⇆ 跨旅程发现 (Cross-Journey)</span>
              <div class="archive-card p-5 bg-stone-950 border border-stone-900 hover:border-amber-500/20 transition-all cursor-pointer rounded-2xl" 
                   onclick="window.location.hash='#/discover/${crossJourney.id}'">
                <div class="space-y-2">
                  <div class="flex items-center gap-1.5">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    <span class="text-[8.5px] font-mono text-stone-400 tracking-wider uppercase">${getStatusLabel(crossJourney.status)}</span>
                  </div>
                  <h3 class="text-base font-medium text-white font-display">${crossJourney.title}</h3>
                  <p class="text-xs text-stone-400 font-sans leading-relaxed italic">"${crossJourney.observation}"</p>
                  
                  <!-- Render cluster -->
                  ${renderFragmentsCluster(crossJourney.supportingFragments)}
                </div>
              </div>
            </div>
          ` : ""}

          <!-- 3. Unresolved/Pending Discovery (未决) -->
          ${unresolvedGap ? `
            <div class="space-y-2">
              <span class="text-[8px] font-mono text-stone-500 uppercase tracking-widest block">? 未决时空缺口 (Pending Gaps)</span>
              <div class="archive-card p-5 bg-stone-950 border border-stone-900 border-dashed hover:border-amber-500/20 transition-all cursor-pointer rounded-2xl" 
                   onclick="window.location.hash='#/discover/${unresolvedGap.id}'">
                <div class="space-y-2">
                  <div class="flex items-center gap-1.5">
                    <span class="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                    <span class="text-[8.5px] font-mono text-stone-400 tracking-wider uppercase">未决 · 证据待对齐</span>
                  </div>
                  <h3 class="text-base font-medium text-white font-display">${unresolvedGap.title}</h3>
                  <p class="text-xs text-stone-400 font-sans leading-relaxed italic">"${unresolvedGap.observation}"</p>
                  
                  <!-- Render cluster -->
                  ${renderFragmentsCluster(unresolvedGap.supportingFragments)}
                </div>
              </div>
            </div>
          ` : ""}

          <!-- 4. Saved Entries Entrance Card (已保存/已命名入口) -->
          <div class="p-4 bg-stone-950/40 border border-stone-900 rounded-2xl flex items-center justify-between hover:bg-stone-950/80 hover:border-stone-850 transition-all cursor-pointer group"
               onclick="window.setDiscoverFilter('saved')">
            <div class="space-y-1">
              <span class="text-[8px] font-mono text-stone-500 uppercase tracking-widest block">My Curated Discoveries</span>
              <div class="text-xs text-stone-200 font-sans">
                已命名和已保存的线索 <span class="text-amber-500 font-mono font-bold ml-1">${savedCount}</span> 条
              </div>
            </div>
            <div class="flex items-center gap-1 text-[10px] font-mono text-stone-600 group-hover:text-amber-500 transition-colors">
              查看全部已保存 
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </div>
      `;
    } else {
      // flat filtered list
      if (filteredDiscoveries.length === 0) {
        listContentHtml = `
          <div class="p-8 text-center bg-stone-950/20 border border-stone-900 border-dashed rounded-2xl space-y-3.5">
            <div class="text-2xl">🕳️</div>
            <div class="space-y-1">
              <h4 class="text-xs font-mono text-stone-400 uppercase">无此状态的发现</h4>
              <p class="text-[11px] text-stone-600 font-sans leading-relaxed">在这个分类下还没有任何时空线索显影。可以尝试去往别处导入或编辑命名线索。</p>
            </div>
            <button onclick="window.setDiscoverFilter('all')" class="px-3.5 py-1.5 rounded-lg bg-stone-900 text-[10px] font-mono text-stone-300 border border-stone-850">
              返回查看全部发现
            </button>
          </div>
        `;
      } else {
        listContentHtml = `
          <div class="space-y-4">
            ${filteredDiscoveries.map(disc => `
              <div class="archive-card p-5 bg-stone-950 border border-stone-900 hover:border-amber-500/20 transition-all cursor-pointer rounded-2xl" 
                   onclick="window.location.hash='#/discover/${disc.id}'">
                <div class="space-y-2">
                  <div class="flex items-center gap-1.5">
                    <span class="w-1.5 h-1.5 rounded-full ${disc.status === 'saved' ? 'bg-amber-500' : disc.status === 'new' ? 'bg-amber-400' : 'bg-emerald-500'}"></span>
                    <span class="text-[8.5px] font-mono text-stone-400 tracking-wider uppercase">${getStatusLabel(disc.status)}</span>
                  </div>
                  <h3 class="text-sm font-medium text-white font-display">${disc.title}</h3>
                  <p class="text-xs text-stone-400 font-sans leading-relaxed italic">"${disc.observation}"</p>
                  ${renderFragmentsCluster(disc.supportingFragments)}
                </div>
              </div>
            `).join('')}
          </div>
        `;
      }
    }

    return `
      <div class="p-6 space-y-5 fade-in text-stone-200 pb-24">
        <div>
          <span class="text-[9px] font-mono tracking-widest text-stone-500 uppercase">Archive Deductions</span>
          <h1 class="text-2xl font-display font-medium text-white mt-0.5">时空显影线索</h1>
        </div>

        <p class="text-xs text-stone-400 font-sans leading-relaxed select-text">
          Else 在后台通过因果网络，将离散的物理原件进行时间、地点和媒介的聚敛。当多源证据闭合，时空事实便从不确定性中显影。
        </p>

        <!-- Filters Grid -->
        ${filterTabsHtml}

        <!-- Discover List -->
        ${listContentHtml}
      </div>
    `;
  }

  // 2. DISCOVER DETAIL VIEW (线索详情 - 空间拓扑与关系显影)
  if (pageId === "discover-detail") {
    const discId = params.id || "disc-ari-mornings";
    const discovery = state.discoveries.find(d => d.id === discId) || {};
    const relatedNote = state.userNotes.find(n => (n.related || []).includes(discId)) || { text: "" };

    // Set up globally scoped handler to avoid local scope bundle blockages
    window.openLensFromDiscover = (id) => {
      store.selectFragment(id);
      store.setOverlay("fragmentLens", true);
    };

    // Calculate details for "Why Crystallized" (为什么显影)
    let whyCrystallized = {
      time: "多次到访集中在上午 08:42 至 09:15，属于极其固定的日常时空行为模式。",
      place: "地理坐标位于 Ari 区，100 米半径以内，物理证据强力重合聚敛。",
      media: "📸 相机原件与 📄 账单/小票多点交叉验证，证明到访行为并非单纯路过。",
      gaps: discovery.uncertainty || "无显著事实缺口。物理证据已形成完美因果闭合。"
    };

    if (discId === "disc-river-evidence") {
      whyCrystallized = {
        time: "购票时间为 17:42，日落照片拍摄于 17:59，完美的 17 分钟候船连续性。",
        place: "Chao Phraya Ferry 渡口和 Riverside 码头重叠空间坐标对齐。",
        media: "🎫 纸质渡轮船票的物理账单记录 ＋ 📸 EXIF 时间匹配的傍晚夕阳相机原件。",
        gaps: "无显著缺口。17 分钟的物理黑场是必然的候船过程。"
      };
    } else if (discId === "disc-river-open-thread") {
      whyCrystallized = {
        time: "地图截图保存时间在 18:04，与之前夕阳渡轮时间接近，属于相同黄昏时段。",
        place: "截图文本 OCR 识别为河道附近码头，但缺少精确 GPS 地理标定坐标点。",
        media: "🗺️ 电子设备屏幕截图，缺乏小票等纸质支付工具进行物理交叉验证。",
        gaps: "由于缺少实际 GPS 位置元数据和支付事实，无法直接将该截图锚定到具体码头，处于悬挂状态。"
      };
    }

    return `
      <div class="space-y-6 fade-in text-stone-200 pb-28">
        <!-- Sticky Header with Navigation -->
        <div class="p-6 pb-0 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <a href="#/discover" class="p-1 rounded hover:bg-stone-850 text-stone-400 hover:text-white transition-colors">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7" />
              </svg>
            </a>
            <div>
              <span class="text-[9px] font-mono tracking-widest text-amber-500 uppercase">Spatiotemporal Lens</span>
              <h1 class="text-xs font-mono text-stone-400 uppercase tracking-tight">线索拓扑显影</h1>
            </div>
          </div>
          <span class="px-2 py-0.5 rounded text-[8.5px] font-mono border border-amber-500/15 bg-amber-500/[0.03] text-amber-500 uppercase">
            ${discovery.status === "saved" ? "记忆已闭合" : "证据链显影中"}
          </span>
        </div>

        <!-- 1. Main Discovery & Time Span -->
        <div class="px-6 space-y-1">
          <h2 class="text-xl font-display font-semibold text-white tracking-tight">${discovery.title}</h2>
          <div class="flex items-center gap-1.5 text-[10px] font-mono text-stone-500">
            <span>📅 时间跨度:</span>
            <span class="text-stone-300">${discovery.timeRange}</span>
          </div>
        </div>

        <!-- 2. Supporting Fragments Relation Field (支撑碎片关系场) -->
        <div class="px-6 space-y-2.5">
          <span class="text-[8px] font-mono text-stone-500 uppercase tracking-widest block">1. 支撑碎片关系场 (Supporting Fragments Relation Field)</span>
          
          <div class="p-4 bg-stone-950 border border-stone-900 rounded-2xl relative overflow-hidden space-y-3.5">
            <!-- Simulated fine lines connecting nodes -->
            <div class="absolute inset-0 pointer-events-none border border-dashed border-stone-900/40 rounded-2xl m-3"></div>

            <div class="space-y-2.5 relative z-10">
              ${(discovery.supportingFragments || []).map((fid, idx) => {
                const frag = state.fragments.find(x => x.id === fid);
                if (!frag) return "";
                let typeLabel = "📸 CAMERA PHOTO";
                if (frag.type === "receipt") typeLabel = "📄 THERMAL RECEIPT";
                if (frag.type === "ticket") typeLabel = "🎫 PRINTED TICKET";
                if (frag.type === "screenshot") typeLabel = "🗺️ DEVICE SCREENSHOT";

                return `
                  <div class="flex items-center justify-between gap-3 p-2 bg-stone-900/30 border border-stone-900 rounded-xl hover:border-amber-500/20 transition-all cursor-pointer"
                       onclick="window.openLensFromDiscover('${frag.id}')">
                    <div class="flex items-center gap-3 min-w-0">
                      ${frag.asset 
                        ? `<img src="${frag.asset}" class="w-8 h-8 rounded object-cover border border-stone-800" referrerPolicy="no-referrer">`
                        : `<div class="w-8 h-8 rounded bg-stone-950 border border-stone-900 flex items-center justify-center text-xs text-amber-500/80 font-mono">${frag.type === 'receipt' ? '📄' : '🎫'}</div>`
                      }
                      <div class="min-w-0">
                        <div class="text-[8px] font-mono text-stone-500 tracking-wider">${typeLabel} [ID: ${idx+1}]</div>
                        <h4 class="text-xs font-sans text-stone-300 truncate font-medium">${frag.placeCandidate || "未定位碎片"}</h4>
                      </div>
                    </div>
                    <div class="text-right shrink-0">
                      <span class="text-[9px] font-mono text-amber-500/80">${frag.capturedAt.split("T")[1].substring(0, 5)}</span>
                      <span class="text-[8px] font-mono text-stone-600 block">${frag.capturedAt.split("T")[0].substring(5)}</span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>

        <!-- 3. Shared Entity (共同实体) -->
        <div class="px-6 space-y-2">
          <span class="text-[8px] font-mono text-stone-500 uppercase tracking-widest block">2. 交叠共同实体 (Shared Spatiotemporal Entity)</span>
          <div class="p-4 bg-stone-950 border border-stone-900 rounded-2xl flex justify-between items-center">
            <div class="space-y-1">
              <div class="flex items-center gap-1.5">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span class="text-xs font-sans font-medium text-white">${discovery.sharedEntity || "Bangkok 时空集聚域"}</span>
              </div>
              <p class="text-[9px] font-mono text-stone-500">
                13.7845° N, 100.5452° E · 多点物理闭合互证
              </p>
            </div>
            <div class="text-right font-mono text-[9px] text-stone-400">
              <div class="text-white font-semibold">${(discovery.supportingFragments || []).length} 个原始关联</div>
              <div class="text-stone-500">置信度 98%</div>
            </div>
          </div>
        </div>

        <!-- 4. Why Crystallized (为什么显影) -->
        <div class="px-6 space-y-3">
          <span class="text-[8px] font-mono text-stone-500 uppercase tracking-widest block">3. 为什么显影 (Why Crystallized Parameters)</span>
          <div class="grid grid-cols-2 gap-2 text-stone-300">
            <div class="p-3 bg-stone-950 border border-stone-900 rounded-xl space-y-1">
              <span class="text-[8px] font-mono text-stone-500 uppercase">🕒 时间规律</span>
              <p class="text-[10px] text-stone-400 leading-relaxed font-sans">${whyCrystallized.time}</p>
            </div>
            <div class="p-3 bg-stone-950 border border-stone-900 rounded-xl space-y-1">
              <span class="text-[8px] font-mono text-stone-500 uppercase">📍 地点交叠</span>
              <p class="text-[10px] text-stone-400 leading-relaxed font-sans">${whyCrystallized.place}</p>
            </div>
            <div class="p-3 bg-stone-950 border border-stone-900 rounded-xl space-y-1">
              <span class="text-[8px] font-mono text-stone-500 uppercase">📄 媒介互证</span>
              <p class="text-[10px] text-stone-400 leading-relaxed font-sans">${whyCrystallized.media}</p>
            </div>
            <div class="p-3 bg-stone-950 border border-stone-900 rounded-xl border-dashed space-y-1">
              <span class="text-[8px] font-mono text-red-400 uppercase">❓ 悬浮缺口 (Gaps)</span>
              <p class="text-[10px] text-stone-400 leading-relaxed font-sans">${whyCrystallized.gaps}</p>
            </div>
          </div>
        </div>

        <!-- 5. Uncertainty Description -->
        <div class="px-6">
          <div class="p-3 bg-stone-900/30 border border-stone-900 rounded-xl space-y-1">
            <span class="text-[8px] font-mono text-stone-500 uppercase tracking-widest block">⚠️ 认知不确定性免责说明 (Uncertainty Notice)</span>
            <p class="text-[10px] text-stone-500 font-sans leading-relaxed">
              因果推演完全基于设备元数据、物理票据 OCR 文本时间对齐与图像特征进行闭合。系统绝不推测或预设立场推导您的主观情绪与个人动机，保留纯粹的客观事实留白。
            </p>
          </div>
        </div>

        <!-- 6. Original Track (原件轨道) -->
        <div class="px-6 space-y-2">
          <span class="text-[8px] font-mono text-stone-500 uppercase tracking-widest block">4. 原件证据轨道 (Original Track)</span>
          <div class="flex gap-2.5 overflow-x-auto pb-2 scrollbar-none">
            ${(discovery.supportingFragments || []).map(fid => {
              const frag = state.fragments.find(x => x.id === fid);
              if (!frag) return "";
              
              const isPhoto = frag.type === "photo";
              const datePart = frag.capturedAt.split("T")[0].substring(5);

              return `
                <div class="w-24 bg-stone-950 border border-stone-900 rounded-xl p-2 shrink-0 flex flex-col justify-between h-32 hover:border-amber-500/20 transition-colors cursor-pointer"
                     onclick="window.openLensFromDiscover('${frag.id}')">
                  ${frag.asset 
                    ? `<img src="${frag.asset}" class="w-full h-16 rounded object-cover border border-stone-900" referrerPolicy="no-referrer">`
                    : `<div class="w-full h-16 rounded bg-stone-900 border border-stone-850 flex items-center justify-center text-lg">${frag.type === 'receipt' ? '📄' : '🎫'}</div>`
                  }
                  <div class="mt-1.5 space-y-0.5">
                    <div class="text-[7.5px] font-mono text-stone-500 truncate">${frag.type.toUpperCase()}</div>
                    <div class="text-[9px] font-sans text-stone-300 truncate font-medium">${frag.placeCandidate || "待安放"}</div>
                    <div class="text-[7px] font-mono text-stone-600">${datePart}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- 7. Save Option & Name Customizer (命名与保存) -->
        <div class="px-6 space-y-4">
          <span class="text-[8px] font-mono text-stone-500 uppercase tracking-widest block">5. 时空逻辑校准与回忆命名 (Calibration & Customization)</span>
          
          <div class="space-y-3.5 bg-stone-950 p-4 rounded-2xl border border-stone-900">
            <!-- Custom Name input (命名) -->
            <div class="space-y-1">
              <label class="text-[8px] font-mono text-stone-500 uppercase tracking-wider block">1. 修改线索标题 (Rename Discovery)</label>
              <input type="text" id="disc-edit-title" value="${discovery.title || ''}" 
                     class="w-full bg-stone-900/60 border border-stone-850 rounded-xl px-3 py-2 text-xs text-white font-sans focus:outline-none focus:border-amber-500/40" />
            </div>

            <!-- Observations -->
            <div class="space-y-1">
              <label class="text-[8px] font-mono text-stone-500 uppercase tracking-wider block">2. 调整客观因果摘要 (Objective Observation Summary)</label>
              <textarea id="disc-edit-obs" 
                        class="w-full bg-stone-900/60 border border-stone-850 rounded-xl px-3 py-2 text-xs text-stone-300 font-sans focus:outline-none focus:border-amber-500/40 min-h-[40px] leading-relaxed">${discovery.observation || ''}</textarea>
            </div>

            <!-- Notes -->
            <div class="space-y-1">
              <label class="text-[8px] font-mono text-stone-500 uppercase tracking-wider block">3. 补充私人心境心迹 (Personal Emotional Reflection)</label>
              <textarea id="disc-edit-note" 
                        placeholder="在此写下只属于你个人的记忆笔迹... AI无法感知雨声，唯有你可以填补文字缺憾。"
                        class="w-full bg-stone-900/60 border border-stone-850 rounded-xl px-3 py-2 text-xs text-stone-300 font-serif focus:outline-none focus:border-amber-500/40 min-h-[80px] leading-relaxed">${relatedNote.text || ""}</textarea>
            </div>
            
            <button onclick="window.saveDiscoveryAction('${discId}')" 
                    class="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-sans font-medium text-xs rounded-xl transition-colors uppercase tracking-wider">
              确认并保存此线索命名
            </button>
          </div>
        </div>

        <!-- 8. Return to World Deep Links (回到世界深链检索) -->
        <div class="px-6 space-y-3">
          <span class="text-[8px] font-mono text-stone-500 uppercase tracking-widest block">6. 时空拓扑深链检索 (Deep-Link World Retrievals)</span>
          <p class="text-[10px] text-stone-500 font-sans leading-relaxed">
            回到世界的不同维度：通过场景详情、时间、空间和底层证据重新审视你与世界相连的轨迹。
          </p>

          <div class="grid grid-cols-2 gap-2 text-[10px] font-mono">
            <!-- Deep Link 1: 时间视角 -->
            <button onclick="window.location.hash='#/world/city/bangkok/explore?view=time'" 
                    class="p-3 bg-stone-950 hover:bg-stone-900 border border-stone-900 rounded-xl text-left flex flex-col justify-between h-14 transition-colors">
              <span class="text-[7.5px] text-stone-500">CHRONOLOGICAL</span>
              <span class="text-stone-300 font-sans">🕒 进入时间视角 Explore</span>
            </button>

            <!-- Deep Link 2: 地点视角 -->
            <button onclick="window.location.hash='#/world/city/bangkok/explore?view=place'" 
                    class="p-3 bg-stone-950 hover:bg-stone-900 border border-stone-900 rounded-xl text-left flex flex-col justify-between h-14 transition-colors">
              <span class="text-[7.5px] text-stone-500">GEOGRAPHIC</span>
              <span class="text-stone-300 font-sans">📍 进入地点视角 Explore</span>
            </button>

            <!-- Deep Link 3: 底层连接 -->
            <button onclick="window.location.hash='#/world/city/bangkok/explore?view=connection'" 
                    class="p-3 bg-stone-950 hover:bg-stone-900 border border-stone-900 rounded-xl text-left flex flex-col justify-between h-14 transition-colors">
              <span class="text-[7.5px] text-stone-500">TOPOLOGICAL</span>
              <span class="text-stone-300 font-sans">🔗 进入底层连接 Explore</span>
            </button>

            <!-- Deep Link 4: 场景 -->
            <button onclick="window.location.hash='#/world/scene/scene-common-grounds-morning'" 
                    class="p-3 bg-stone-950 hover:bg-stone-900 border border-stone-900 rounded-xl text-left flex flex-col justify-between h-14 transition-colors">
              <span class="text-[7.5px] text-stone-500">CHRONOTOPE SCENE</span>
              <span class="text-stone-300 font-sans">🎬 进入「Ari早晨」场景</span>
            </button>

            <!-- Deep Link 5: Fragment Lens -->
            <button onclick="window.openLensFromDiscover('frag-ari-1016-receipt')" 
                    class="col-span-2 p-3 bg-stone-950 hover:bg-stone-900 border border-stone-900 rounded-xl text-left flex flex-col justify-between h-14 transition-colors">
              <span class="text-[7.5px] text-stone-500">FRAGMENT EXIF METADATA LENS</span>
              <span class="text-stone-300 font-sans">🔬 唤起「Common Grounds 小票」Fragment Lens</span>
            </button>
          </div>
        </div>

        <!-- Back to World home -->
        <div class="px-6 pt-1">
          <a href="#/world" 
             class="w-full py-3 bg-stone-900 hover:bg-stone-850 border border-stone-800 text-stone-300 font-sans font-medium text-xs rounded-xl transition-colors uppercase tracking-wider text-center block">
            返回旅行世界首页
          </a>
        </div>
      </div>
    `;
  }

  return `<div class="p-4">Unknown Discover route ${pageId}</div>`;
}
