import { store } from "../store.js";

export function renderWorldPage(route, state) {
  const pageId = route.pageId;
  const params = route.params || {};
  const query = route.query || {};

  // HELPER to draw custom mock interactive nodes
  function renderFragmentNode(frag) {
    const isPhoto = frag.type === "photo";
    const bgStyle = isPhoto && frag.asset 
      ? `background-image: url('${frag.asset}'); background-size: cover; background-position: center;` 
      : '';
    const name = frag.type.toUpperCase();
    const borderClass = frag.status === 'confirmed' ? 'border-stone-800' : 'border-amber-700/60';

    return `
      <div class="fragment-node ${frag.type} flex flex-col justify-between p-1.5 border ${borderClass} shadow-md relative" 
           style="${bgStyle}" 
           onclick="window.openFragmentLens('${frag.id}')">
        ${!isPhoto ? `
          <div class="flex justify-between items-start">
            <span class="text-[5px] font-mono leading-none tracking-tighter text-stone-600">${name}</span>
            <span class="text-[4px] font-mono leading-none text-stone-400">10-18</span>
          </div>
          <div class="text-[5px] font-mono line-clamp-3 leading-tight overflow-hidden mt-1 opacity-80 select-none">
            ${frag.evidencePreview || frag.ocrText || ''}
          </div>
          <div class="text-[4px] font-mono text-stone-500 text-right mt-auto">${frag.id}</div>
        ` : `
          <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
          <span class="absolute bottom-1 right-1 text-[5px] font-mono text-stone-300">PHOTO</span>
        `}
      </div>
    `;
  }

  // 1. WORLD HOME VIEW
  if (pageId === "world-home") {
    const bangkokCity = state.cities.find(c => c.id === "bangkok") || {};
    return `
      <div class="p-6 space-y-6 fade-in text-stone-200">
        <!-- Brand & Context Header -->
        <div class="flex justify-between items-end">
          <div>
            <span class="text-[10px] font-mono tracking-widest text-stone-500 uppercase">Archive Space</span>
            <h1 class="text-2xl font-display font-medium text-white mt-1">旅行档案馆</h1>
          </div>
          <div class="text-right">
            <span class="text-[10px] font-mono text-stone-400">${state.fragments.length} 个原件</span>
          </div>
        </div>

        <!-- Mini Globe / Geography Widget -->
        <div class="p-5 bg-stone-900/40 rounded-xl border border-stone-800/60 relative overflow-hidden flex flex-col justify-between aspect-[16/10]" onclick="window.location.hash='#/world/cities'">
          <div class="absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px]"></div>
          <div class="flex justify-between items-start z-10">
            <div>
              <span class="text-[10px] font-mono text-amber-500/80">3D GLOBE ACTIVED</span>
              <h2 class="text-lg font-display text-white">时空地球</h2>
            </div>
            <span class="px-2 py-0.5 rounded bg-stone-800 border border-stone-700 text-[9px] font-mono text-stone-400">切换列表</span>
          </div>
          <!-- Static representation of Globe -->
          <div class="flex justify-center items-center h-20 relative">
            <div class="w-16 h-16 rounded-full border border-stone-800/80 bg-stone-900 flex items-center justify-center">
              <span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
            </div>
          </div>
          <div class="flex justify-between text-[10px] text-stone-500 z-10">
            <span>坐标对齐: 32 点</span>
            <span>未决边界: 2 处</span>
          </div>
        </div>

        <!-- Recommended / Current City -->
        <div class="space-y-3">
          <h3 class="text-xs font-mono tracking-wider text-stone-500 uppercase">当前焦点城市</h3>
          <div class="archive-card p-4 relative overflow-hidden flex flex-col justify-between min-h-[140px]" 
               style="background-image: linear-gradient(to right, rgba(10,10,10,0.95), rgba(10,10,10,0.4)), url('${bangkokCity.representativeAsset}'); background-size: cover; background-position: center;"
               onclick="window.location.hash='#/world/city/bangkok'">
            <div>
              <span class="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[9px] font-mono">新发现已显影</span>
              <h2 class="text-xl font-display font-medium text-white mt-2">${bangkokCity.name}</h2>
              <p class="text-xs text-stone-400 mt-1">${bangkokCity.period} · ${bangkokCity.placeCount} 地点 · ${bangkokCity.fragmentCount} 碎片</p>
            </div>
            <div class="mt-4 flex justify-between items-center">
              <span class="text-xs text-stone-300 font-sans italic">"${bangkokCity.narrative}"</span>
              <svg class="w-4 h-4 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </div>

        <!-- Global Database Entry -->
        <div class="grid grid-cols-2 gap-4">
          <div class="archive-card p-4 flex flex-col justify-between" onclick="window.location.hash='#/world/fragments'">
            <div>
              <svg class="w-5 h-5 text-stone-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <h4 class="text-sm font-medium text-white mt-2">全部碎片</h4>
              <p class="text-[11px] text-stone-500 mt-1">全局 172 原件字段</p>
            </div>
            <span class="text-xs text-amber-500/80 mt-4 font-mono">进入 Fragment Field →</span>
          </div>

          <div class="archive-card p-4 flex flex-col justify-between" onclick="window.location.hash='#/world/inbox'">
            <div class="relative">
              <div class="absolute right-0 top-0 w-2 h-2 rounded-full bg-amber-500"></div>
              <svg class="w-5 h-5 text-stone-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-3.586a1 1 0 00-.707.293l-1.414 1.414a1 1 0 01-.707.293h-2.122a1 1 0 01-.707-.293l-1.414-1.414A1 1 0 009.586 13H4" />
              </svg>
              <h4 class="text-sm font-medium text-white mt-2">收件箱</h4>
              <p class="text-[11px] text-stone-500 mt-1">2 个待判断问题</p>
            </div>
            <span class="text-xs text-stone-400 mt-4 font-mono">快速解决问题 →</span>
          </div>
        </div>

        <!-- Floating Add Button -->
        <div class="flex justify-center py-4">
          <button class="px-6 py-3 rounded-full bg-stone-800 border border-stone-700 text-xs font-mono flex items-center gap-2 hover:bg-stone-700 hover:border-stone-600 transition-all text-white shadow-xl" onclick="window.location.hash='#/world/import'">
            <svg class="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            放入新的旅行碎片
          </button>
        </div>
      </div>
    `;
  }

  // 2. WORLD CITIES LIST VIEW
  if (pageId === "world-cities") {
    return `
      <div class="p-6 space-y-6 fade-in text-stone-200">
        <div class="flex items-center gap-3">
          <button onclick="history.back()" class="p-1 rounded hover:bg-stone-800 text-stone-400 hover:text-white">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 class="text-xl font-display font-medium text-white">城市与阶段</h1>
        </div>

        <div class="space-y-4">
          ${state.cities.map(city => `
            <div class="archive-card p-4 flex justify-between items-center" onclick="window.location.hash='#/world/city/${city.id}'">
              <div>
                <h3 class="text-lg font-display text-white">${city.name} <span class="text-xs text-stone-500 font-sans">${city.localizedName}</span></h3>
                <p class="text-xs text-stone-400 mt-1">${city.period} · ${city.placeCount} 个地点 · ${city.fragmentCount} 碎片</p>
                <div class="flex gap-2 mt-2">
                  ${city.status.includes("has_new_discovery") ? `<span class="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 text-[9px] border border-amber-500/20 font-mono">新发现已显影</span>` : ''}
                  <span class="px-1.5 py-0.5 rounded bg-stone-900 text-stone-500 text-[9px] border border-stone-800 font-mono">
                    ${city.status.includes("current") ? "当前正在收集" : "记忆已定型"}
                  </span>
                </div>
              </div>
              <svg class="w-5 h-5 text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // 3. WORLD CITY HOME VIEW (BANGKOK CANVASES)
  if (pageId === "world-city-home") {
    const cityId = params.id || "bangkok";
    const city = state.cities.find(c => c.id === cityId) || {};
    const cityFrags = state.fragments.filter(f => {
      if (cityId === "bangkok") {
        return f.id.includes("ari") || f.id.includes("river") || f.id.includes("old-town");
      } else if (cityId === "chiang-mai") {
        return f.id.includes("chiang-mai");
      } else if (cityId === "tokyo") {
        return f.id.includes("tokyo");
      }
      return false;
    });

    return `
      <div class="p-6 space-y-6 fade-in text-stone-200">
        <div class="flex items-center gap-3">
          <a href="#/world" class="p-1 rounded hover:bg-stone-800 text-stone-400 hover:text-white">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </a>
          <div>
            <span class="text-[9px] font-mono tracking-widest text-stone-500 uppercase">${city.period}</span>
            <h1 class="text-xl font-display font-medium text-white">${city.name} <span class="text-xs text-stone-400 font-sans">${city.localizedName}</span></h1>
          </div>
        </div>

        <!-- Segment 1: City Fragment Field -->
        <div class="space-y-3">
          <div class="flex justify-between items-end">
            <h3 class="text-xs font-mono tracking-wider text-stone-500 uppercase">City Fragment Field (主群落)</h3>
            <span class="text-[10px] font-mono text-stone-400">${cityFrags.length} 个典型碎片已对齐</span>
          </div>
          <div class="fragment-field-canvas p-4 relative" style="height: 320px;">
            <!-- Simple simulated positioning of nodes on canvas -->
            ${cityFrags.map((frag, idx) => {
              const positions = [
                { left: "10%", top: "15%" },
                { left: "35%", top: "8%" },
                { left: "65%", top: "20%" },
                { left: "15%", top: "50%" },
                { left: "45%", top: "45%" },
                { left: "70%", top: "60%" },
                { left: "5%", top: "75%" },
                { left: "38%", top: "78%" },
                { left: "72%", top: "40%" }
              ];
              const pos = positions[idx % positions.length];
              return `<div style="position: absolute; left: ${pos.left}; top: ${pos.top};">${renderFragmentNode(frag)}</div>`;
            }).join('')}
          </div>
        </div>

        <!-- Objective Narrative -->
        <div class="space-y-1">
          <span class="text-[9px] font-mono tracking-widest text-stone-500 uppercase">时空纪实综述</span>
          <p class="text-xs font-sans leading-relaxed text-stone-400 border-l-2 border-stone-800 pl-4 py-1 italic">
            "${city.narrative}"
          </p>
        </div>

        <!-- Pending State Warning Badge (待判断状态) -->
        ${cityId === "bangkok" ? `
        <div class="p-3.5 bg-amber-500/5 border border-amber-500/20 rounded-xl flex justify-between items-center cursor-pointer" onclick="window.location.hash='#/world/inbox'">
          <div class="space-y-0.5">
            <span class="text-[9px] font-mono text-amber-500 uppercase">Pending Review · 待判断状态</span>
            <p class="text-xs text-stone-300">系统发现 2 个未决时空对齐问题，需要你判断</p>
          </div>
          <svg class="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </div>
        ` : ''}

        <!-- Segment 2: Dual Entryways -->
        <div class="space-y-4">
          <div class="archive-card p-5 border-amber-800/20 bg-stone-900/20 flex justify-between items-center cursor-pointer" onclick="window.location.hash='#/world/city/${cityId}/capsule'">
            <div class="space-y-1">
              <span class="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[9px] font-mono uppercase">Timeline Story</span>
              <h3 class="text-lg font-display text-white mt-1">City Capsule (回望)</h3>
              <p class="text-xs text-stone-400">用已确认事实与私人文字编织的相册章节</p>
            </div>
            <svg class="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>

          <div class="archive-card p-5 flex justify-between items-center cursor-pointer" onclick="window.location.hash='#/world/city/${cityId}/explore'">
            <div class="space-y-1">
              <span class="px-1.5 py-0.5 rounded bg-stone-800 text-stone-400 border border-stone-700 text-[9px] font-mono uppercase">Explore Core</span>
              <h3 class="text-lg font-display text-white mt-1">Explore (三视角探索)</h3>
              <p class="text-xs text-stone-400">时间、地点与连接客观证据探索系统</p>
            </div>
            <svg class="w-6 h-6 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
          </div>
        </div>

        <!-- Action Links: View All & Continue Adding -->
        <div class="grid grid-cols-2 gap-3 pt-2">
          <button class="py-3 px-4 rounded-xl bg-stone-900 border border-stone-850 hover:bg-stone-800 text-stone-300 text-xs font-mono transition-all" onclick="window.location.hash='#/world/fragments'">
            🔍 查看全部 ${city.fragmentCount} 个碎片
          </button>
          <button class="py-3 px-4 rounded-xl bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-100 text-xs font-mono transition-all" onclick="window.location.hash='#/world/import'">
            ➕ 继续放入新的旅行碎片
          </button>
        </div>
      </div>
    `;
  }

  // 4. WORLD ALL FRAGMENTS VIEW (FRAGMENT FIELD)
  if (pageId === "world-fragments") {
    return `
      <div class="p-6 space-y-6 fade-in text-stone-200">
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-3">
            <a href="#/world" class="p-1 rounded hover:bg-stone-800 text-stone-400 hover:text-white">
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
              </svg>
            </a>
            <h1 class="text-xl font-display font-medium text-white">全部碎片</h1>
          </div>
          <span class="text-xs font-mono text-stone-400">172 原始原件</span>
        </div>

        <!-- Filter bar -->
        <div class="flex gap-2 pb-2 overflow-x-auto border-b border-stone-850">
          <button class="px-3 py-1.5 rounded-full bg-stone-200 text-stone-900 text-xs font-mono font-medium whitespace-nowrap">全部群落</button>
          <button class="px-3 py-1.5 rounded-full bg-stone-900 border border-stone-800 text-stone-400 text-xs font-mono whitespace-nowrap" onclick="alert('曼谷子群已高亮展示')">曼谷子群 (Bangkok)</button>
          <button class="px-3 py-1.5 rounded-full bg-stone-900 border border-stone-800 text-stone-400 text-xs font-mono whitespace-nowrap" onclick="alert('清迈群落检索中')">清迈群落 (Chiang Mai)</button>
          <button class="px-3 py-1.5 rounded-full bg-stone-900 border border-stone-800 text-stone-400 text-xs font-mono whitespace-nowrap" onclick="alert('东京群落检索中')">东京群落 (Tokyo)</button>
        </div>

        <!-- The Boundless Fragment Field with City-Clusters and Sub-clusters -->
        <div class="fragment-field-canvas relative overflow-hidden" style="height: 480px; background-size: 20px 20px; background-image: radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px);">
          
          <!-- Cluster 1: Bangkok Cluster (曼谷城市群) -->
          <div class="absolute border border-dashed border-stone-800/80 rounded-2xl p-3" style="left: 4%; top: 4%; width: 92%; height: 62%;">
            <div class="flex justify-between items-center mb-2 px-1">
              <span class="text-[9px] font-mono tracking-wider text-amber-500 uppercase">City Cluster: Bangkok (2024 秋)</span>
              <span class="text-[8px] font-mono text-stone-500">63 碎片已对齐</span>
            </div>

            <!-- Sub-cluster 1.1: Ari Cafe Sub-cluster (Ari 子群) -->
            <div class="absolute border border-stone-900 bg-stone-950/30 rounded-xl p-2" style="left: 4%; top: 32px; width: 45%; height: 80%;">
              <span class="text-[8px] font-mono text-stone-400 block mb-2 px-1">Ari Sub-cluster · 咖啡街区</span>
              
              <div class="grid grid-cols-2 gap-2 h-[82%] overflow-y-auto">
                <div class="transform scale-90 origin-top-left">${renderFragmentNode(state.fragments[0])}</div>
                <div class="transform scale-90 origin-top-left">${renderFragmentNode(state.fragments[1])}</div>
                <div class="transform scale-90 origin-top-left">${renderFragmentNode(state.fragments[2])}</div>
                <div class="transform scale-90 origin-top-left">${renderFragmentNode(state.fragments[3])}</div>
              </div>
            </div>

            <!-- Sub-cluster 1.2: Riverside Ferry Sub-cluster (湄南河子群) -->
            <div class="absolute border border-stone-900 bg-stone-950/30 rounded-xl p-2" style="right: 4%; top: 32px; width: 45%; height: 80%;">
              <span class="text-[8px] font-mono text-stone-400 block mb-2 px-1">Riverside Sub-cluster · 渡口</span>

              <div class="grid grid-cols-2 gap-2 h-[82%] overflow-y-auto">
                <div class="transform scale-90 origin-top-left">${renderFragmentNode(state.fragments[4])}</div>
                <div class="transform scale-90 origin-top-left">${renderFragmentNode(state.fragments[5])}</div>
                <div class="transform scale-90 origin-top-left">${renderFragmentNode(state.fragments[6])}</div>
                <div class="transform scale-90 origin-top-left">${renderFragmentNode(state.fragments[7])}</div>
              </div>
            </div>
          </div>

          <!-- Cluster 2: Tokyo Cluster (东京城市群) -->
          <div class="absolute border border-dashed border-stone-900 rounded-2xl p-3 flex flex-col justify-between" style="left: 4%; bottom: 4%; width: 44%; height: 26%;">
            <div>
              <span class="text-[8px] font-mono tracking-wider text-stone-600 block uppercase">City Cluster: Tokyo</span>
              <span class="text-[10px] text-stone-500 font-sans mt-0.5 block">2023 冬 · 81 碎片</span>
            </div>
            <div class="flex gap-1">
              <div class="w-2 h-2 rounded-full bg-stone-800"></div>
              <div class="w-2 h-2 rounded-full bg-stone-800 animate-pulse"></div>
              <div class="w-2 h-2 rounded-full bg-stone-800"></div>
            </div>
          </div>

          <!-- Cluster 3: Chiang Mai Cluster (清迈城市群) -->
          <div class="absolute border border-dashed border-stone-900 rounded-2xl p-3 flex flex-col justify-between" style="right: 4%; bottom: 4%; width: 44%; height: 26%;">
            <div>
              <span class="text-[8px] font-mono tracking-wider text-stone-600 block uppercase">City Cluster: Chiang Mai</span>
              <span class="text-[10px] text-stone-500 font-sans mt-0.5 block">2024 夏 · 28 碎片</span>
            </div>
            <div class="flex gap-1">
              <div class="w-2 h-2 rounded-full bg-stone-800"></div>
              <div class="w-2 h-2 rounded-full bg-stone-800"></div>
              <div class="w-2 h-2 rounded-full bg-stone-800"></div>
            </div>
          </div>

        </div>

        <div class="bg-stone-900/30 border border-stone-800/40 p-4 rounded-xl text-center">
          <p class="text-xs text-stone-400 font-mono">你可以双指缩放、拖拽浏览无边界的记忆群落。</p>
        </div>
      </div>
    `;
  }

  // 5. IMPORT SELECTION VIEW
  if (pageId === "world-import") {
    // Initialize or read step state
    window.__importStep = window.__importStep || "select";

    window.goToImportStep = (step) => {
      window.__importStep = step;
      store.notify();
    };

    window.startProcessingImport = () => {
      window.__importStep = "processing";
      store.notify();
      
      // Simulate real-time progressive logs
      setTimeout(() => {
        const log = document.getElementById("import-log-box");
        if (log) log.innerHTML += `<p class="text-[11px] text-green-500 font-mono">✓ [0.8s] 提取 25 张照片的相机 EXIF 时间与 GPS 经纬度成功...</p>`;
      }, 800);

      setTimeout(() => {
        const log = document.getElementById("import-log-box");
        if (log) log.innerHTML += `<p class="text-[11px] text-green-500 font-mono">✓ [1.6s] 运行本地 OCR 智能识别 3 份账单文本...</p>`;
      }, 1600);

      setTimeout(() => {
        const log = document.getElementById("import-log-box");
        if (log) log.innerHTML += `<p class="text-[11px] text-green-500 font-mono">✓ [2.4s] 计算时空距离，对齐 曼谷 2024 秋 群落...</p>`;
      }, 2400);

      setTimeout(() => {
        const log = document.getElementById("import-log-box");
        if (log) log.innerHTML += `<p class="text-[11px] text-amber-500 font-mono">⚠ [3.2s] 发现 2 个未决时空对齐疑问已归并至收件箱...</p>`;
      }, 3200);

      // Finish and redirect to Receipt
      setTimeout(() => {
        window.__importStep = "select"; // Reset for next time
        window.location.hash = "#/world/receipt/batch-bangkok-backfill";
      }, 4000);
    };

    let stepHtml = "";

    if (window.__importStep === "select") {
      stepHtml = `
        <p class="text-xs text-stone-400">
          Elsewhere 拥有本地沙盒安全性，拖入你的原件（支持照片、纸质票据、微信/谷歌地图截图、文字便签）。我们将在本地完成分析。
        </p>

        <!-- Drop Zone Box -->
        <div class="border-2 border-dashed border-stone-800 rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-4 hover:border-amber-500/40 cursor-pointer transition-all bg-stone-900/10 py-16" 
             onclick="window.goToImportStep('preview')">
          <svg class="w-10 h-10 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          <div>
            <h3 class="text-sm font-medium text-white">选择本地文件或拖到这里</h3>
            <p class="text-xs text-stone-500 mt-1">支持 JPEG, PNG, WEBP, PDF</p>
          </div>
          <span class="px-3 py-1 rounded bg-stone-900 border border-stone-800 text-[10px] font-mono text-stone-400">
            自动匹配: 曼谷 2024 秋
          </span>
        </div>

        <!-- Preset Simulation Button -->
        <div class="space-y-2">
          <span class="text-[9px] font-mono text-stone-500 uppercase tracking-wider block">本地模拟预设包 (用于测试连续流程)</span>
          <button class="w-full p-4 bg-stone-900 hover:bg-stone-850 border border-stone-800 rounded-xl text-left flex justify-between items-center transition-all"
                  onclick="window.goToImportStep('preview')">
            <div>
              <h4 class="text-xs font-mono font-medium text-amber-500">📂 曼谷咖啡与渡船原件包.zip</h4>
              <p class="text-[10px] text-stone-400 mt-1">包含 25 张照片、2 张 Common Grounds 账单、1 张渡船票</p>
            </div>
            <span class="text-xs text-stone-500 font-mono">载入预览 →</span>
          </button>
        </div>
      `;
    } else if (window.__importStep === "preview") {
      stepHtml = `
        <div class="space-y-4">
          <div class="flex justify-between items-center">
            <span class="text-xs font-mono text-stone-400">已选择 28 个原件 (包含 3 种不同的媒介材质)</span>
            <button class="text-xs text-stone-500 hover:text-white font-mono" onclick="window.goToImportStep('select')">重新选择</button>
          </div>

          <!-- Preview Grid with different media styles -->
          <div class="grid grid-cols-2 gap-3 max-h-[320px] overflow-y-auto pr-1">
            
            <!-- Media 1: Photo (Image placeholder) -->
            <div class="p-2 bg-stone-900 border border-stone-800 rounded-xl space-y-2">
              <div class="h-20 bg-cover bg-center rounded" style="background-image: url('https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=150&auto=format&fit=crop&q=60')"></div>
              <div class="flex justify-between text-[8px] font-mono text-stone-500">
                <span>📸 IMG_4821.JPG</span>
                <span>EXIF 10-12</span>
              </div>
            </div>

            <!-- Media 2: Receipt (Receipt text structure) -->
            <div class="p-3 bg-stone-900 border border-stone-800 rounded-xl flex flex-col justify-between h-[108px] font-mono">
              <div class="space-y-1">
                <span class="px-1 py-0.5 bg-green-950/40 text-green-500 text-[8px] rounded border border-green-900/40 uppercase">Receipt</span>
                <span class="text-[8px] text-stone-400 block mt-1">COMMON GROUNDS ARI</span>
              </div>
              <span class="text-[9px] text-stone-200 mt-2 block">LATTE · 124 THB</span>
              <span class="text-[8px] text-stone-500 text-right">10-16 08:47</span>
            </div>

            <!-- Media 3: Ticket (Ticket Stamp style) -->
            <div class="p-3 bg-stone-900 border border-stone-800 rounded-xl flex flex-col justify-between h-[108px] font-mono relative overflow-hidden">
              <div class="absolute -right-3 -top-3 w-8 h-8 rounded-full border border-dashed border-stone-700/60 flex items-center justify-center">
                <span class="text-[6px] text-stone-600">FERRY</span>
              </div>
              <div class="space-y-1">
                <span class="px-1 py-0.5 bg-amber-950/40 text-amber-500 text-[8px] rounded border border-amber-900/40 uppercase">Ticket</span>
                <span class="text-[8px] text-stone-400 block mt-1">CHAO PHRAYA FERRY</span>
              </div>
              <span class="text-[9px] text-stone-200 mt-2 block">17:42 PASS</span>
              <span class="text-[8px] text-stone-500 text-right">10-18 17:42</span>
            </div>

            <!-- More photos -->
            <div class="p-2 bg-stone-900 border border-stone-800 rounded-xl space-y-2">
              <div class="h-20 bg-cover bg-center rounded" style="background-image: url('https://images.unsplash.com/photo-1473116763269-25541579ffbe?w=150&auto=format&fit=crop&q=60')"></div>
              <div class="flex justify-between text-[8px] font-mono text-stone-500">
                <span>📸 IMG_4911.JPG</span>
                <span>EXIF 10-18</span>
              </div>
            </div>

          </div>

          <div class="p-3 bg-stone-950 border border-stone-900 rounded-lg">
            <p class="text-xs text-stone-400 leading-relaxed font-mono">
              ℹ 自动定位引擎：系统检测到 25 个原件具备相同的曼谷区域 GPS 元数据。我们将引导放入 "曼谷 2024 秋" 记忆。
            </p>
          </div>

          <button class="w-full py-4 rounded-xl bg-stone-200 text-stone-950 font-sans font-medium text-sm text-center hover:bg-white transition-all shadow-lg"
                  onclick="window.startProcessingImport()">
            开始对齐整理
          </button>
        </div>
      `;
    } else if (window.__importStep === "processing") {
      stepHtml = `
        <div class="space-y-6 py-8 text-center">
          <!-- Spinner Matrix Loader -->
          <div class="relative w-16 h-16 mx-auto flex items-center justify-center">
            <div class="absolute inset-0 rounded-full border-4 border-stone-900"></div>
            <div class="absolute inset-0 rounded-full border-4 border-t-amber-500 animate-spin"></div>
            <svg class="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          </div>

          <div>
            <h2 class="text-lg font-display text-white">正在进行时空对齐与解构...</h2>
            <p class="text-xs text-stone-500 mt-1">本地安全整理中 · 勿关闭此页面</p>
          </div>

          <!-- Progress bar -->
          <div class="w-full bg-stone-900 rounded-full h-1.5 overflow-hidden">
            <div class="bg-amber-500 h-1.5 rounded-full" style="width: 70%; animation: pulse 1.5s infinite;"></div>
          </div>

          <!-- Progressive log box -->
          <div id="import-log-box" class="p-4 bg-stone-950 border border-stone-900 rounded-xl text-left space-y-2 h-[140px] overflow-y-auto">
            <p class="text-[11px] text-green-500 font-mono">✓ [0.1s] 读取本地沙盒缓存文件列表...</p>
          </div>
        </div>
      `;
    }

    return `
      <div class="p-6 space-y-6 fade-in text-stone-200">
        <div class="flex items-center gap-3">
          <button onclick="history.back()" class="p-1 rounded hover:bg-stone-800 text-stone-400 hover:text-white">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 class="text-xl font-display font-medium text-white">放入碎片</h1>
        </div>

        ${stepHtml}
      </div>
    `;
  }

  // 6. IMPORT RECEIPT VIEW (BATCH DONE SUMMARY)
  if (pageId === "world-receipt") {
    const batchId = params.id || "batch-bangkok-backfill";
    const batch = state.importBatches.find(b => b.id === batchId) || {};
    
    return `
      <div class="p-6 space-y-6 fade-in text-stone-200">
        <div class="space-y-1">
          <span class="onboarding-badge">Archive Receipt</span>
          <h1 class="text-2xl font-display font-medium text-white">整理回执</h1>
          <p class="text-[11px] text-stone-500 font-mono">导入批次: ${batch.id}</p>
        </div>

        <!-- Receipt Card Panel -->
        <div class="archive-card p-5 space-y-4 border-stone-800/80 bg-stone-900/30">
          <div class="flex justify-between border-b border-stone-800 pb-3">
            <span class="text-xs font-mono text-stone-400">导入原件总数</span>
            <span class="text-sm font-mono font-bold text-white">${batch.itemCount}</span>
          </div>

          <div class="grid grid-cols-2 gap-4 border-b border-stone-800 pb-4">
            <div>
              <span class="text-[10px] font-mono text-stone-500 block">对齐至城市</span>
              <span class="text-xs text-stone-300 font-medium">Bangkok 曼谷</span>
            </div>
            <div>
              <span class="text-[10px] font-mono text-stone-500 block">生成新地点</span>
              <span class="text-xs text-stone-300 font-medium">3 咖啡馆 & 渡口</span>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4 border-b border-stone-800 pb-4">
            <div>
              <span class="text-[10px] font-mono text-stone-500 block">自动确认连接</span>
              <span class="text-xs text-green-500 font-medium">+1 已对齐</span>
            </div>
            <div>
              <span class="text-[10px] font-mono text-stone-500 block">待判断关系</span>
              <span class="text-xs text-amber-500 font-medium">+2 未确认</span>
            </div>
          </div>

          <!-- AI observations without emotive prose -->
          <div class="text-xs text-stone-400 leading-relaxed pt-2">
            我们提取了 3 张纸质小票和 18 张照片的 EXIF 坐标。28 张原始碎片均已归入当前世界。
          </div>
        </div>

        <div class="flex flex-col gap-3">
          <a href="#/onboarding/first-connection" class="w-full py-4 rounded-xl bg-stone-200 text-stone-950 font-sans font-medium text-sm text-center hover:bg-white transition-all shadow-lg">
            查看第 1 条显影连接
          </a>
          <a href="#/world/inbox" class="w-full py-4 rounded-xl bg-stone-900 border border-stone-850 text-stone-200 font-sans font-medium text-sm text-center hover:bg-stone-800 transition-all">
            解决 2 个未决问题
          </a>
        </div>
      </div>
    `;
  }

  // 7. INBOX VIEW (FOUR SUBSTATES)
  if (pageId === "world-inbox") {
    const activeTab = query.tab || "questions";
    
    let tabContent = "";
    if (activeTab === "questions") {
      tabContent = `
        <!-- Problem Card 1: One Screen One Question -->
        <div class="space-y-4">
          <div class="archive-card p-5 border-amber-800/30 bg-stone-900/10 space-y-4 relative">
            <span class="px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[9px] font-mono">第 1 / 2 问</span>
            <h3 class="text-lg font-display text-white mt-2">Common Grounds 记录补充</h3>
            <p class="text-xs text-stone-400 leading-relaxed">
              系统发现了你于 10 月 12 日在 Ari 区有一张咖啡照片，EXIF 匹配 Common Grounds，但这天我们缺少支付小票。
            </p>

            <div class="p-3 bg-stone-950 rounded border border-stone-850 flex gap-3 items-center">
              <div class="w-10 h-10 bg-stone-800 rounded"></div>
              <div>
                <span class="text-[10px] font-mono text-stone-500 block">原始照片</span>
                <span class="text-xs text-stone-300">10-12 · 08:42</span>
              </div>
            </div>

            <div class="flex gap-3 pt-2">
              <button class="flex-1 py-2 rounded bg-stone-200 text-stone-950 text-xs font-medium hover:bg-white transition-all" onclick="window.location.hash='#/world/city/bangkok/explore'">
                确认属于此地点
              </button>
              <button class="flex-1 py-2 rounded bg-stone-900 border border-stone-800 text-stone-400 text-xs font-medium hover:bg-stone-800 transition-all">
                不属于
              </button>
            </div>
          </div>
          
          <div class="archive-card p-5 border-stone-800/80 bg-stone-900/10 space-y-4 relative opacity-60">
            <span class="px-2 py-0.5 rounded bg-stone-800 text-stone-400 border border-stone-700/60 text-[9px] font-mono">第 2 / 2 问</span>
            <h3 class="text-lg font-display text-stone-300 mt-2">旧船票时空偏移</h3>
            <p class="text-xs text-stone-500 leading-relaxed">
              有一张 10 月 18 日的 Chao Phraya Ferry 船票（17:42），但 EXIF 匹配的最后一张照片是在 18:26 拍摄，需要关联。
            </p>
          </div>
        </div>
      `;
    } else if (activeTab === "recent") {
      tabContent = `
        <div class="space-y-3">
          <span class="text-[10px] font-mono text-stone-500 uppercase tracking-widest block mb-1">最近入库的 28 个原件（部分展示）</span>
          <div class="grid grid-cols-2 gap-3">
            ${state.fragments.map(frag => {
              const typeLabel = frag.type.toUpperCase();
              const assetPreview = frag.asset 
                ? `<div class="h-24 bg-cover bg-center rounded border border-stone-800 mb-1.5" style="background-image: url('${frag.asset}')"></div>`
                : `<div class="h-24 bg-stone-950 flex items-center justify-center rounded border border-stone-850 mb-1.5"><span class="text-[9px] text-stone-600 font-mono">${typeLabel}</span></div>`;
              return `
                <div class="archive-card p-3 flex flex-col justify-between cursor-pointer animate-fade-in" onclick="window.openFragmentLens('${frag.id}')">
                  <div>
                    ${assetPreview}
                    <h4 class="text-xs font-mono text-stone-300 truncate">${frag.id}</h4>
                    <p class="text-[10px] text-stone-500 mt-1 line-clamp-2">${frag.evidencePreview || frag.ocrText || 'EXIF 原件数据'}</p>
                  </div>
                  <span class="text-[8px] font-mono text-stone-600 text-right mt-2 block">${frag.capturedAt ? frag.capturedAt.split('T')[0] : '10-18'}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    } else if (activeTab === "processing") {
      tabContent = `
        <div class="p-8 text-center border border-dashed border-stone-800 rounded-2xl bg-stone-900/10">
          <div class="w-8 h-8 rounded-full border-2 border-stone-700 border-t-amber-500 animate-spin mx-auto mb-3"></div>
          <h3 class="text-sm font-mono text-stone-300">暂无正在整理的原件</h3>
          <p class="text-xs text-stone-500 mt-1">当您放置新碎片时，本地分析队列会在此处显示实时显影状态。</p>
        </div>
      `;
    } else {
      tabContent = `
        <div class="p-8 text-center border border-dashed border-stone-800 rounded-2xl bg-stone-900/10">
          <svg class="w-8 h-8 text-stone-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3 class="text-sm font-mono text-stone-300">未发现异常或重复碎片</h3>
          <p class="text-xs text-stone-500 mt-1">系统会自动剔除完全相同的原件哈希，并归集时空重叠的多次连拍。</p>
        </div>
      `;
    }

    return `
      <div class="p-6 space-y-6 fade-in text-stone-200">
        <div class="flex items-center gap-3">
          <a href="#/world" class="p-1 rounded hover:bg-stone-800 text-stone-400 hover:text-white">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </a>
          <h1 class="text-xl font-display font-medium text-white">收件箱</h1>
        </div>

        <!-- Horizontal Tabs -->
        <div class="flex gap-2 border-b border-stone-850 pb-2 overflow-x-auto">
          <a href="#/world/inbox?tab=questions" class="px-3 py-1.5 rounded-full text-xs font-mono whitespace-nowrap transition-all ${activeTab === 'questions' ? 'bg-stone-200 text-stone-950 font-medium' : 'bg-stone-900 border border-stone-800 text-stone-400'}">待判断 (2)</a>
          <a href="#/world/inbox?tab=recent" class="px-3 py-1.5 rounded-full text-xs font-mono whitespace-nowrap transition-all ${activeTab === 'recent' ? 'bg-stone-200 text-stone-950 font-medium' : 'bg-stone-900 border border-stone-800 text-stone-400'}">最近入库 (28)</a>
          <a href="#/world/inbox?tab=processing" class="px-3 py-1.5 rounded-full text-xs font-mono whitespace-nowrap transition-all ${activeTab === 'processing' ? 'bg-stone-200 text-stone-950 font-medium' : 'bg-stone-900 border border-stone-800 text-stone-400'}">正在整理 (0)</a>
          <a href="#/world/inbox?tab=duplicates" class="px-3 py-1.5 rounded-full text-xs font-mono whitespace-nowrap transition-all ${activeTab === 'duplicates' ? 'bg-stone-200 text-stone-950 font-medium' : 'bg-stone-900 border border-stone-800 text-stone-400'}">异常或重复</a>
        </div>

        <div class="space-y-4">
          ${tabContent}
        </div>
      </div>
    `;
  }

  // 8. CITY CAPSULE VIEW
  if (pageId === "world-capsule") {
    const cityId = params.id || "bangkok";
    const city = state.cities.find(c => c.id === cityId) || state.cities.find(c => c.id === "bangkok") || {};
    
    // Customize stories for each city beautifully!
    let chapters = [];
    if (cityId === "bangkok") {
      chapters = [
        {
          chapterNum: "I",
          title: "等雨停的清晨",
          quote: "那天其实只是为了找一个能坐很久的位置，雨下得太大了，咖啡馆里的音乐很低。",
          img: "../../assets/bangkok-photo-01-ari-morning.jpg",
          fallbackImg: "https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=300&auto=format&fit=crop&q=60",
          cardTitle: "Common Grounds Receipt",
          cardTime: "10-16 08:47",
          cardDetail: "1 ICE LATTE - 124 THB"
        },
        {
          chapterNum: "II",
          title: "河上的夕阳",
          quote: "离开 Bangkok 以后，我最常想起的是河上的风。",
          img: "../../assets/bangkok-photo-02-riverside.jpg",
          fallbackImg: "https://images.unsplash.com/photo-1473116763269-25541579ffbe?w=500&auto=format&fit=crop&q=60",
          cardTitle: null
        }
      ];
    } else if (cityId === "chiang-mai") {
      chapters = [
        {
          chapterNum: "I",
          title: "古城清晨的慢咖啡",
          quote: "古城的清晨空气微凉，巷子口的野猫和磨豆机的声音一样，有着某种固定的韵律。",
          img: "https://images.unsplash.com/photo-1541167760496-1628856ab772?w=500&auto=format&fit=crop&q=60",
          fallbackImg: "https://images.unsplash.com/photo-1541167760496-1628856ab772?w=500&auto=format&fit=crop&q=60",
          cardTitle: "Graph Cafe Receipt",
          cardTime: "08-12 09:15",
          cardDetail: "1 ESPRESSO - 95 THB"
        },
        {
          chapterNum: "II",
          title: "无名寺庙的雨声",
          quote: "在无名神庙前的雨棚下坐了两个小时。满眼都是绿色，泥土和青苔的味道被风卷上来。",
          img: "https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=500&auto=format&fit=crop&q=60",
          fallbackImg: "https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=500&auto=format&fit=crop&q=60",
          cardTitle: null
        }
      ];
    } else { // tokyo
      chapters = [
        {
          chapterNum: "I",
          title: "新宿雨夜的酒香",
          quote: "深冬的东京，霓虹在潮湿的地面晕开。小酒馆门帘掀起的时候，带出一阵白汽和柑橘般的草药香气。",
          img: "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=500&auto=format&fit=crop&q=60",
          fallbackImg: "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=500&auto=format&fit=crop&q=60",
          cardTitle: "Ben Fiddich Slip",
          cardTime: "12-05 21:30",
          cardDetail: "2 CUSTOM DRINKS - 4400 JPY"
        },
        {
          chapterNum: "II",
          title: "神田川的冬落叶",
          quote: "阳光落在这条穿过高架桥和民居的水道上。叶子掉得很慢，像是这个快节奏城市里的一个休止符。",
          img: "https://images.unsplash.com/photo-1542051841857-5f90071e7989?w=500&auto=format&fit=crop&q=60",
          fallbackImg: "https://images.unsplash.com/photo-1542051841857-5f90071e7989?w=500&auto=format&fit=crop&q=60",
          cardTitle: null
        }
      ];
    }

    return `
      <div class="p-6 space-y-6 fade-in text-stone-200">
        <div class="flex items-center gap-3">
          <a href="#/world/city/${cityId}" class="p-1 rounded hover:bg-stone-800 text-stone-400 hover:text-white">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </a>
          <h1 class="text-xl font-display font-medium text-white">City Capsule</h1>
        </div>

        <div class="text-center py-8 border-b border-stone-850">
          <span class="onboarding-badge text-amber-500">${city.name} ${city.period}</span>
          <h2 class="text-2xl font-serif italic text-stone-100 mt-2">${city.localizedName}的侧影</h2>
          <p class="text-xs text-stone-500 mt-2 font-mono">${city.period === "2024 秋" ? "10 月 12 日 — 10 月 22 日" : (city.period === "2024 夏" ? "08 月 10 日 — 08 月 18 日" : "12 月 01 日 — 12 月 10 日")}</p>
        </div>

        ${chapters.map((chap, idx) => `
          <!-- Capsule Narrative Chapter ${chap.chapterNum} -->
          <div class="space-y-4 ${idx > 0 ? 'py-8 border-t border-stone-900' : 'py-4'}">
            <div class="text-[10px] font-mono text-stone-500 uppercase tracking-widest">CHAPTER ${chap.chapterNum} · ${chap.title}</div>
            
            <p class="serif-quote my-4">
              "${chap.quote}"
            </p>

            ${chap.cardTitle ? `
              <div class="grid grid-cols-2 gap-4">
                <img src="${chap.img}" class="rounded-xl border border-stone-800 max-h-[160px] object-cover" onerror="this.src='${chap.fallbackImg}'"/>
                <div class="p-3 bg-stone-900 border border-stone-800 rounded-xl flex flex-col justify-between font-mono">
                  <span class="text-[9px] text-stone-500">${chap.cardTime}</span>
                  <span class="text-xs text-stone-200">${chap.cardTitle}</span>
                  <span class="text-[10px] text-stone-400 mt-1">${chap.cardDetail}</span>
                </div>
              </div>
            ` : `
              <div class="grid grid-cols-1 gap-4">
                <img src="${chap.img}" class="rounded-xl border border-stone-800 max-h-[180px] w-full object-cover" onerror="this.src='${chap.fallbackImg}'"/>
              </div>
            `}
          </div>
        `).join('')}

        <div class="pt-6 flex flex-col gap-3">
          <button class="w-full py-3.5 rounded-xl bg-stone-200 text-stone-950 font-sans font-medium text-sm text-center hover:bg-white transition-all shadow-lg" onclick="store.setOverlay('sharePreview', true)">
            分享这段 Capsule 记忆
          </button>
          <a href="#/world/city/${cityId}/explore" class="text-xs text-stone-500 text-center hover:text-stone-300 transition-colors">
            去往三视角探索 (Explore) →
          </a>
        </div>
      </div>
    `;
  }

  // 9. CITY EXPLORE (THREE TABS: TIME, PLACE, CONNECTION)
  if (pageId === "world-explore") {
    const activeView = query.view || "time";
    const cityId = params.id || "bangkok";
    const city = state.cities.find(c => c.id === cityId) || state.cities.find(c => c.id === "bangkok") || {};

    let displayScenes = [];
    if (cityId === "bangkok") {
      displayScenes = [
        {
          id: "scene-common-grounds-morning",
          time: "10-12 08:42",
          label: "Ari 的第一个早晨",
          detail: "Common Grounds · 4 个碎片已确认",
          dotClass: "confirmed"
        },
        {
          id: "scene-river-evening",
          time: "10-18 17:42",
          label: "河岸候船",
          detail: "Chao Phraya Ferry · 2 个碎片已支撑",
          dotClass: "confirmed"
        },
        {
          id: "scene-old-town-walk",
          time: "10-17 15:31",
          label: "未定落点老城慢行",
          detail: "缺少 EXIF GPS 坐标 · 2 个未决原件",
          dotClass: "unresolved"
        }
      ];
    } else if (cityId === "chiang-mai") {
      displayScenes = [
        {
          id: "scene-chiang-mai-graph",
          time: "08-12 09:15",
          label: "古城清晨慢饮",
          detail: "Graph Cafe · 3 个碎片已对齐",
          dotClass: "confirmed"
        },
        {
          id: "scene-chiang-mai-temple",
          time: "08-14 14:00",
          label: "素贴山古刹探秘",
          detail: "Wat Pha Lat · 2 个碎片已归档",
          dotClass: "confirmed"
        }
      ];
    } else { // tokyo
      displayScenes = [
        {
          id: "scene-tokyo-ben-fiddich",
          time: "12-05 21:30",
          label: "新宿微醺药草香",
          detail: "Bar Ben Fiddich · 2 个小票碎片已合并",
          dotClass: "confirmed"
        },
        {
          id: "scene-tokyo-daikanyama",
          time: "12-08 10:15",
          label: "代官山书香冬日",
          detail: "Daikanyama T-Site · 3 个影像证据",
          dotClass: "confirmed"
        }
      ];
    }

    let displayPlaces = [];
    if (cityId === "bangkok") {
      displayPlaces = [
        {
          id: "place-common-grounds",
          statusLabel: "已对齐 3 次到访",
          statusClass: "text-green-500",
          name: "Common Grounds · Ari",
          desc: "12 — 19 OCT 2024 · 4 关联小票与照片"
        },
        {
          id: "place-chao-phraya-ferry",
          statusLabel: "已支撑 3 次到访",
          statusClass: "text-green-500",
          name: "Chao Phraya Ferry · Riverside",
          desc: "14 — 22 OCT 2024 · 5 关联碎片"
        },
        {
          id: "place-old-town",
          statusLabel: "待确定 (1 次到访候选)",
          statusClass: "text-amber-500",
          name: "Old Town Walk · Phra Nakhon",
          desc: "17 OCT 2024 · 3 漂浮无坐标碎片"
        }
      ];
    } else if (cityId === "chiang-mai") {
      displayPlaces = [
        {
          id: "place-chiang-mai-graph",
          statusLabel: "已对齐 2 次到访",
          statusClass: "text-green-500",
          name: "Graph Cafe · Chiang Mai",
          desc: "12 — 15 AUG 2024 · 3 关联小票"
        },
        {
          id: "place-chiang-mai-temple",
          statusLabel: "已支撑 1 次到访",
          statusClass: "text-green-500",
          name: "Wat Pha Lat · Suthep Hill",
          desc: "14 AUG 2024 · 2 关联照片"
        }
      ];
    } else { // tokyo
      displayPlaces = [
        {
          id: "place-tokyo-ben-fiddich",
          statusLabel: "已对齐 1 次到访",
          statusClass: "text-green-500",
          name: "Bar Ben Fiddich · Shinjuku",
          desc: "05 DEC 2023 · 2 关联纸质账单"
        },
        {
          id: "place-tokyo-daikanyama",
          statusLabel: "已支撑 2 次到访",
          statusClass: "text-green-500",
          name: "Daikanyama T-Site · Shibuya",
          desc: "07 — 08 DEC 2023 · 3 关联碎片"
        }
      ];
    }

    let displayConns = [];
    if (cityId === "bangkok") {
      displayConns = [
        {
          id: "rel-river-ticket-photo",
          badge: "同一行程",
          badgeClass: "bg-green-500/10 border border-green-500/20 text-green-500",
          title: "渡船小票 → 河岸余晖照片",
          time: "10-18 17:42 — 17:59 · 17 分钟间隔",
          percent: "100% 对齐"
        },
        {
          id: "rel-river-1022-suggestion",
          badge: "时空邻近建议",
          badgeClass: "bg-amber-500/10 border border-amber-500/20 text-amber-500",
          title: "地图路线截图 ↔ Chao Phraya Ferry",
          time: "10-22 18:04 · 缺少同日直接对齐证据",
          percent: "75% 建议"
        }
      ];
    } else if (cityId === "chiang-mai") {
      displayConns = [
        {
          id: "rel-chiang-mai-receipt-photo",
          badge: "同一行程",
          badgeClass: "bg-green-500/10 border border-green-500/20 text-green-500",
          title: "Graph Cafe 账单 → 露台咖啡照片",
          time: "08-12 09:15 — 09:24 · 9 分钟间隔",
          percent: "100% 对齐"
        }
      ];
    } else { // tokyo
      displayConns = [
        {
          id: "rel-tokyo-bar-slip-photo",
          badge: "同一行程",
          badgeClass: "bg-green-500/10 border border-green-500/20 text-green-500",
          title: "药草鸡尾酒小票 → 调酒师特写照片",
          time: "12-05 21:30 — 21:42 · 12 分钟间隔",
          percent: "100% 对齐"
        }
      ];
    }

    return `
      <div class="p-6 space-y-6 fade-in text-stone-200">
        <div class="flex items-center gap-3">
          <a href="#/world/city/${cityId}" class="p-1 rounded hover:bg-stone-800 text-stone-400 hover:text-white">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </a>
          <h1 class="text-xl font-display font-medium text-white">${city.name}探索</h1>
        </div>

        <!-- Vertical tab slider -->
        <div class="grid grid-cols-3 gap-2 bg-stone-950 p-1 rounded-lg border border-stone-900">
          <a href="#/world/city/${cityId}/explore?view=time" class="py-2 text-center rounded text-xs font-mono ${activeView === 'time' ? 'bg-stone-900 text-white' : 'text-stone-500'}">时间视角</a>
          <a href="#/world/city/${cityId}/explore?view=place" class="py-2 text-center rounded text-xs font-mono ${activeView === 'place' ? 'bg-stone-900 text-white' : 'text-stone-500'}">地点视角</a>
          <a href="#/world/city/${cityId}/explore?view=connection" class="py-2 text-center rounded text-xs font-mono ${activeView === 'connection' ? 'bg-stone-900 text-white' : 'text-stone-500'}">连接视角</a>
        </div>

        <!-- TIME VIEW -->
        ${activeView === 'time' ? `
          <div class="space-y-4 fade-in">
            <h3 class="text-xs font-mono tracking-wider text-stone-500 uppercase">时间场景链 (${cityId === 'bangkok' ? '10月12日 — 22日' : (cityId === 'chiang-mai' ? '08月12日 — 14日' : '12月05日 — 08日')})</h3>
            <div class="vertical-timeline">
              ${displayScenes.map((scene, idx) => `
                <div class="relative ${idx === displayScenes.length - 1 ? 'pb-4' : 'pb-8'} cursor-pointer" onclick="window.location.hash='#/world/scene/${scene.id}'">
                  <span class="timeline-dot ${scene.dotClass}"></span>
                  <div class="space-y-1">
                    <span class="text-[10px] font-mono text-stone-500 block">${scene.time}</span>
                    <h4 class="text-sm font-medium ${scene.dotClass === 'unresolved' ? 'text-amber-500/90' : 'text-white'} hover:text-amber-500 transition-colors">${scene.label}</h4>
                    <p class="text-xs text-stone-400">${scene.detail}</p>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- PLACE VIEW -->
        ${activeView === 'place' ? `
          <div class="space-y-4 fade-in">
            <h3 class="text-xs font-mono tracking-wider text-stone-500 uppercase">足迹商户</h3>
            <div class="space-y-3">
              ${displayPlaces.map(place => `
                <div class="archive-card p-4 cursor-pointer hover:border-stone-700 transition-all" onclick="window.location.hash='#/world/place/${place.id}'">
                  <span class="text-[10px] font-mono ${place.statusClass}">${place.statusLabel}</span>
                  <h4 class="text-base font-display text-white mt-1">${place.name}</h4>
                  <p class="text-xs text-stone-400 mt-1">${place.desc}</p>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- CONNECTION VIEW -->
        ${activeView === 'connection' ? `
          <div class="space-y-4 fade-in">
            <h3 class="text-xs font-mono tracking-wider text-stone-500 uppercase">计算连接网</h3>
            <div class="space-y-3">
              ${displayConns.map(conn => `
                <div class="archive-card p-4 flex justify-between items-start cursor-pointer hover:border-stone-700 transition-all" onclick="window.location.hash='#/world/connection/${conn.id}'">
                  <div>
                    <span class="px-1.5 py-0.5 rounded bg-stone-900 border border-stone-850 text-[9px] font-mono ${conn.badgeClass.includes('green') ? 'text-green-500 border-green-500/20 bg-green-500/10' : 'text-amber-500 border-amber-500/20 bg-amber-500/10'} uppercase">${conn.badge}</span>
                    <h4 class="text-sm font-medium text-white mt-2">${conn.title}</h4>
                    <p class="text-xs text-stone-400 mt-1">${conn.time}</p>
                  </div>
                  <span class="text-xs ${conn.badge.includes('建议') ? 'text-amber-500' : 'text-stone-500'} font-mono">${conn.percent}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  // 10. SCENE DETAIL VIEW
  if (pageId === "world-scene-detail") {
    const sceneId = params.id || "scene-common-grounds-morning";
    const scene = state.scenes.find(s => s.id === sceneId) || {};
    const placeOfScene = state.places.find(p => p.id === scene.placeId) || {};
    const sceneFragments = (scene.fragmentIds || []).map(id => state.fragments.find(f => f.id === id)).filter(Boolean);
    const relatedNotes = state.userNotes.filter(note => (note.related || []).includes(sceneId));

    return `
      <div class="p-6 space-y-6 fade-in text-stone-200">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <button onclick="history.back()" class="p-1 rounded hover:bg-stone-800 text-stone-400 hover:text-white">
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <span class="text-[9px] font-mono tracking-wider text-stone-500 uppercase">${scene.date || ''} · ${scene.timeRange || ''}</span>
              <h1 class="text-xl font-display font-medium text-white">${scene.label || '场景详情'}</h1>
            </div>
          </div>
          <span class="px-2 py-0.5 rounded text-[9px] font-mono uppercase ${scene.status === 'confirmed' ? 'bg-green-500/10 border border-green-500/20 text-green-500' : 'bg-amber-500/10 border border-amber-500/20 text-amber-500'}">
            ${scene.status === 'confirmed' ? '已确认场景' : '待确定场景'}
          </span>
        </div>

        ${scene.primaryAsset ? `
          <div class="rounded-xl overflow-hidden border border-stone-800 shadow-md">
            <img src="${scene.primaryAsset}" class="w-full h-44 object-cover animate-fade-in" onerror="this.src='https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=500&auto=format&fit=crop&q=60'"/>
          </div>
        ` : ''}

        <div class="archive-card p-4 bg-stone-900/40">
          <span class="text-[9px] font-mono text-amber-500 block uppercase">AI 观察 (时空对齐解构)</span>
          <p class="text-xs text-stone-300 leading-relaxed mt-2 font-serif italic">
            "${scene.observation || ''}"
          </p>
        </div>

        <!-- Personal Diary Reflection Notes -->
        ${relatedNotes.length > 0 ? `
          <div class="archive-card p-4 border-amber-500/10 bg-amber-500/[0.02]">
            <span class="text-[9px] font-mono text-stone-500 uppercase block">私人笔谈心境</span>
            ${relatedNotes.map(note => `
              <p class="text-xs text-stone-300 font-serif leading-relaxed mt-2 italic">
                "${note.text}"
              </p>
            `).join('')}
          </div>
        ` : `
          <div class="p-4 bg-stone-900/20 border border-stone-850 rounded-xl flex items-center justify-between">
            <div>
              <h4 class="text-xs font-mono text-stone-400 uppercase">私人回忆笔谈</h4>
              <p class="text-[10px] text-stone-500 mt-1">记录你在此场景下的深刻细节和心情感悟...</p>
            </div>
            <button class="px-2.5 py-1.5 rounded bg-stone-800 text-stone-300 border border-stone-700 hover:bg-stone-750 transition-all text-xs font-mono flex-shrink-0" 
                    onclick="window.location.hash='#/me/writing/new'">
              + 记录
            </button>
          </div>
        `}

        ${placeOfScene.name ? `
          <div class="archive-card p-4 flex justify-between items-center cursor-pointer hover:border-stone-700 transition-all" onclick="window.location.hash='#/world/place/${placeOfScene.id}'">
            <div>
              <span class="text-[9px] font-mono text-stone-500 uppercase">对齐地点实体</span>
              <h4 class="text-sm font-medium text-white mt-1">${placeOfScene.name}</h4>
              <p class="text-xs text-stone-400">${placeOfScene.area}</p>
            </div>
            <svg class="w-4 h-4 text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        ` : ''}

        <div class="space-y-3">
          <h3 class="text-xs font-mono tracking-wider text-stone-500 uppercase">场景所含原件 (${sceneFragments.length})</h3>
          <div class="space-y-3">
            ${sceneFragments.map(frag => {
              const typeLabel = frag.type.toUpperCase();
              const imgHtml = frag.type === 'photo' && frag.asset 
                ? `<div class="w-10 h-10 rounded border border-stone-800 bg-cover bg-center flex-shrink-0" style="background-image: url('${frag.asset}')"></div>`
                : `<div class="w-10 h-10 rounded border border-stone-850 bg-stone-950 flex items-center justify-center flex-shrink-0">
                     <span class="text-[8px] font-mono text-stone-500">${frag.type.toUpperCase().substring(0,3)}</span>
                   </div>`;
              return `
                <div class="p-3 bg-stone-900 border border-stone-800 rounded-xl flex justify-between items-center gap-3 cursor-pointer hover:border-stone-700 transition-all" onclick="window.openFragmentLens('${frag.id}')">
                  <div class="flex items-center gap-3 min-w-0">
                    ${imgHtml}
                    <div class="min-w-0">
                      <span class="text-[9px] font-mono text-stone-400">${typeLabel}</span>
                      <h4 class="text-xs font-medium text-white truncate mt-0.5">${frag.id}</h4>
                      <p class="text-[11px] text-stone-500 truncate mt-0.5">${frag.evidencePreview || frag.ocrText || '时空原件数据'}</p>
                    </div>
                  </div>
                  <span class="text-[10px] text-stone-500 font-mono flex-shrink-0">${frag.status === 'confirmed' ? '已确认' : '待确定'}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // 11. PLACE DETAIL VIEW
  if (pageId === "world-place-detail") {
    const placeId = params.id || "place-common-grounds";
    const place = state.places.find(p => p.id === placeId) || {};
    
    // Dynamically query fragments belonging to this place candidate or confirmed location
    const relatedFrags = state.fragments.filter(f => {
      if (f.placeCandidate === place.name || (f.placeCandidate && f.placeCandidate.startsWith(place.name))) return true;
      if (placeId === "place-common-grounds" && f.id.includes("ari")) return true;
      if (placeId === "place-chao-phraya-ferry" && f.id.includes("river")) return true;
      if (placeId === "place-old-town" && f.id.includes("old-town")) return true;
      if (placeId === "place-chiang-mai-graph" && f.id.includes("chiang-mai-1")) return true;
      if (placeId === "place-chiang-mai-temple" && f.id.includes("chiang-mai-2")) return true;
      if (placeId === "place-tokyo-ben-fiddich" && f.id.includes("tokyo-1")) return true;
      if (placeId === "place-tokyo-daikanyama" && f.id.includes("tokyo-2")) return true;
      return false;
    });

    const relatedScenes = state.scenes.filter(s => s.placeId === placeId);
    const relatedNotes = state.userNotes.filter(note => (note.related || []).includes(placeId));

    return `
      <div class="p-6 space-y-6 fade-in text-stone-200">
        <div class="flex items-center gap-3">
          <button onclick="history.back()" class="p-1 rounded hover:bg-stone-800 text-stone-400 hover:text-white">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <span class="text-[9px] font-mono tracking-wider text-stone-500 uppercase">${place.area || ''} · 地点</span>
            <h1 class="text-xl font-display font-medium text-white">${place.name || '地点详情'}</h1>
          </div>
        </div>

        ${place.representativeAsset ? `
          <div class="rounded-xl overflow-hidden border border-stone-800 shadow-md">
            <img src="${place.representativeAsset}" class="w-full h-40 object-cover" onerror="this.src='https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=500&auto=format&fit=crop&q=60'"/>
          </div>
        ` : ''}

        <!-- EXIF coordinates telemetry card -->
        <div class="p-3.5 bg-stone-950 rounded-xl border border-stone-900 flex justify-between items-center text-xs font-mono text-stone-500">
          <span class="flex items-center gap-1.5 text-[10px]">
            <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            EXIF GEOGRAPHY COORDS
          </span>
          <span class="text-stone-300 text-[10px]">
            ${place.coordinates ? `${place.coordinates.lat.toFixed(4)}° N, ${place.coordinates.lng.toFixed(4)}° E` : 'NO COORDINATES'}
          </span>
        </div>

        <div class="archive-card p-4 bg-stone-900/20">
          <span class="text-[9px] font-mono text-stone-500 uppercase block">地理实体概述</span>
          <p class="text-xs text-stone-300 leading-relaxed mt-2">${place.fact || '暂无相关事实综述。'}</p>
        </div>

        <!-- Personal notes related to place -->
        ${relatedNotes.length > 0 ? `
          <div class="archive-card p-4 border-amber-500/10 bg-amber-500/[0.02]">
            <span class="text-[9px] font-mono text-stone-500 uppercase block">私人笔记感悟</span>
            ${relatedNotes.map(note => `
              <p class="text-xs text-stone-300 font-serif leading-relaxed mt-2 italic">
                "${note.text}"
              </p>
            `).join('')}
          </div>
        ` : ''}

        <!-- Related Scenes happening at this place -->
        ${relatedScenes.length > 0 ? `
          <div class="space-y-3">
            <h3 class="text-xs font-mono tracking-wider text-stone-500 uppercase">在此发生的场景 (${relatedScenes.length})</h3>
            <div class="space-y-2.5">
              ${relatedScenes.map(scene => `
                <div class="archive-card p-3.5 flex justify-between items-center cursor-pointer hover:border-stone-700 transition-all" onclick="window.location.hash='#/world/scene/${scene.id}'">
                  <div class="space-y-0.5">
                    <span class="text-[9px] font-mono text-stone-500">${scene.date} · ${scene.timeRange}</span>
                    <h4 class="text-xs font-medium text-white">${scene.label}</h4>
                  </div>
                  <svg class="w-4 h-4 text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div class="space-y-3">
          <h3 class="text-xs font-mono tracking-wider text-stone-500 uppercase">关联旅行原件 (${relatedFrags.length})</h3>
          <div class="space-y-3">
            ${relatedFrags.map(frag => {
              const typeLabel = frag.type.toUpperCase();
              const imgHtml = frag.type === 'photo' && frag.asset 
                ? `<div class="w-10 h-10 rounded border border-stone-800 bg-cover bg-center flex-shrink-0" style="background-image: url('${frag.asset}')"></div>`
                : `<div class="w-10 h-10 rounded border border-stone-850 bg-stone-950 flex items-center justify-center flex-shrink-0">
                     <span class="text-[8px] font-mono text-stone-500">${frag.type.toUpperCase().substring(0,3)}</span>
                   </div>`;
              return `
                <div class="p-3 bg-stone-900 border border-stone-800 rounded-xl flex justify-between items-center gap-3 cursor-pointer hover:border-stone-700 transition-all" onclick="window.openFragmentLens('${frag.id}')">
                  <div class="flex items-center gap-3 min-w-0">
                    ${imgHtml}
                    <div class="min-w-0">
                      <span class="text-[9px] font-mono text-stone-400">${typeLabel}</span>
                      <h4 class="text-xs font-medium text-white truncate mt-0.5">${frag.id}</h4>
                      <p class="text-[11px] text-stone-500 truncate mt-0.5">${frag.evidencePreview || frag.ocrText || '时空原件数据'}</p>
                    </div>
                  </div>
                  <span class="text-xs text-stone-500 font-mono flex-shrink-0">${frag.status === 'confirmed' ? '已确认' : '待确定'}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // 12. CONNECTION DETAIL VIEW
  if (pageId === "world-connection-detail") {
    const connId = params.id || "rel-river-ticket-photo";
    const conn = state.connections.find(c => c.id === connId) || {};

    const fromId = Array.isArray(conn.from) ? conn.from[0] : conn.from;
    const toId = conn.to;
    const fromFrag = state.fragments.find(f => f.id === fromId) || {};
    const toFrag = state.fragments.find(f => f.id === toId) || {};
    const toEntity = conn.toEntity;

    const fromLabel = fromFrag.id ? `${fromFrag.type ? fromFrag.type.toUpperCase() : '原件'} (${fromId})` : "未知源头原件";
    const toLabel = toFrag.id 
      ? `${toFrag.type ? toFrag.type.toUpperCase() : '原件'} (${toId})` 
      : (toEntity ? `地点实体 (${toEntity})` : "未知去向实体");

    // Dynamically determine the associated city ID for this connection
    let cityId = "bangkok";
    const refId = fromId || toId;
    if (refId) {
      if (refId.includes("chiang-mai")) {
        cityId = "chiang-mai";
      } else if (refId.includes("tokyo")) {
        cityId = "tokyo";
      }
    } else if (toEntity) {
      if (toEntity.includes("Chiang Mai")) {
        cityId = "chiang-mai";
      } else if (toEntity.includes("Shinjuku") || toEntity.includes("Shibuya")) {
        cityId = "tokyo";
      }
    }

    // Attempt to match toEntity with place detail if present
    let targetPlace = null;
    if (toEntity) {
      targetPlace = state.places.find(p => p.name === toEntity || toEntity.startsWith(p.name));
    }

    const fromImgHtml = fromFrag.type === 'photo' && fromFrag.asset 
      ? `<div class="h-24 w-full rounded-lg border border-stone-800 bg-cover bg-center mb-2" style="background-image: url('${fromFrag.asset}')"></div>` 
      : '';
    const toImgHtml = toFrag.type === 'photo' && toFrag.asset 
      ? `<div class="h-24 w-full rounded-lg border border-stone-800 bg-cover bg-center mb-2" style="background-image: url('${toFrag.asset}')"></div>` 
      : '';

    let destClickHtml = "";
    if (toId) {
      destClickHtml = `window.openFragmentLens('${toId}')`;
    } else if (targetPlace) {
      destClickHtml = `window.location.hash='#/world/place/${targetPlace.id}'`;
    } else {
      destClickHtml = `window.location.hash='#/world/city/${cityId}/explore?view=place'`;
    }

    return `
      <div class="p-6 space-y-6 fade-in text-stone-200">
        <div class="flex items-center gap-3">
          <button onclick="history.back()" class="p-1 rounded hover:bg-stone-800 text-stone-400 hover:text-white">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <span class="text-[9px] font-mono tracking-wider text-stone-500 uppercase">Connection · 关联解构</span>
            <h1 class="text-xl font-display font-medium text-white">连接详情</h1>
          </div>
        </div>

        <div class="space-y-6">
          <div class="p-5 bg-amber-500/5 border border-amber-500/20 rounded-xl relative overflow-hidden">
            <div class="absolute top-0 right-0 p-3 text-[10px] text-amber-500 font-mono">
              ${conn.status === 'confirmed' ? '✓ CONFIRMED' : '⚡ SUGGESTED'}
            </div>
            <span class="text-[9px] font-mono text-amber-500 uppercase tracking-widest block">CONNECTION BASIS</span>
            <h2 class="text-base font-display text-white mt-1">
              ${conn.type === 'same_visit' ? '同一行程落点对齐' : (conn.type === 'repeated_place' ? '地点多时空收敛' : '时空邻近建议')}
            </h2>
            <div class="text-xs text-stone-400 mt-3 space-y-1.5">
              ${(conn.evidence || []).map(ev => `<p class="flex items-center gap-2"><span>·</span> <span>${ev}</span></p>`).join('')}
              ${conn.uncertainty ? `<p class="text-amber-500/80 mt-2 font-mono text-[11px]">疑问: ${conn.uncertainty}</p>` : ''}
            </div>
            ${conn.visualRule ? `
              <div class="border-t border-stone-800/60 mt-4 pt-3 text-[10px] font-mono text-stone-500 flex justify-between">
                <span>粒子渲染物理机制:</span>
                <span>${conn.visualRule}</span>
              </div>
            ` : ''}
          </div>

          <div class="grid grid-cols-2 gap-4">
            <!-- Source Node -->
            <div class="p-3.5 bg-stone-900 border border-stone-850 rounded-xl hover:border-stone-700 transition-all cursor-pointer flex flex-col justify-between" 
                 onclick="if ('${fromId}') window.openFragmentLens('${fromId}')">
              <div>
                <span class="text-[8px] font-mono text-stone-500 block mb-1">SOURCE ANCHOR (源头)</span>
                ${fromImgHtml}
                <h4 class="text-xs font-medium text-white truncate">${fromLabel}</h4>
                <p class="text-[10px] text-stone-500 mt-1 line-clamp-2">${fromFrag.ocrText || fromFrag.evidencePreview || '时空对齐锚点'}</p>
              </div>
              <span class="text-[9px] font-mono text-stone-600 block mt-3">点击解构原件 →</span>
            </div>

            <!-- Destination Node -->
            <div class="p-3.5 bg-stone-900 border border-stone-850 rounded-xl hover:border-stone-700 transition-all cursor-pointer flex flex-col justify-between" 
                 onclick="${destClickHtml}">
              <div>
                <span class="text-[8px] font-mono text-stone-500 block mb-1">DESTINATION (去向)</span>
                ${toImgHtml}
                <h4 class="text-xs font-medium text-white truncate">${toLabel}</h4>
                <p class="text-[10px] text-stone-500 mt-1 line-clamp-2">${toFrag.ocrText || toFrag.evidencePreview || toEntity || '去向实体'}</p>
              </div>
              <span class="text-[9px] font-mono text-stone-600 block mt-3">
                ${toId ? '点击解构原件 →' : (targetPlace ? '点击查看地点 →' : '点击前往探索 →')}
              </span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  return `<div class="p-4">Unknown World route ${pageId}</div>`;
}

// Global click binders for world page navigation
window.openFragmentLens = (id) => {
  store.selectFragment(id);
  store.setOverlay("fragmentLens", true);
};
