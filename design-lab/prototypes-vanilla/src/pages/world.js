import { store } from "../store.js";

// Mount global tap listener for mobile-friendly calibration
window.focusFragmentAction = function(id) {
  store.selectFragment(id);
  store.setOverlay("fragmentLens", true);
};

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
    
    // State-aware particle dimming and focusing
    const isSelected = state.selectedFragment === frag.id;
    const fadeClass = state.selectedFragment && !isSelected ? "opacity-25" : "opacity-100";
    const highlightBorder = isSelected 
      ? "border-amber-500 ring-2 ring-amber-500/30 scale-105 shadow-[0_0_15px_rgba(245,158,11,0.4)] z-50" 
      : "border-stone-800";

    return `
      <div class="fragment-node ${frag.type} flex flex-col justify-between p-1.5 border ${highlightBorder} ${fadeClass} shadow-md relative transition-all duration-300" 
           style="${bgStyle}" 
           onclick="window.focusFragmentAction('${frag.id}')"
           ondblclick="window.viewOriginalFile()">
        ${isSelected ? `
          <!-- Scanning target line indicator representing lens focus calibration -->
          <div class="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-amber-500/65 animate-pulse z-10"></div>
        ` : ""}
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
    const activeCityId = state.selectedCity || "bangkok";
    const activeCity = state.cities.find(c => c.id === activeCityId) || state.cities[0];

    // Determine vertical connector alignment based on selected city on globe
    let connectorLeft = "45%";
    let connectorHeight = "45px";
    if (activeCityId === "chiang-mai") {
      connectorLeft = "32%";
      connectorHeight = "75px";
    } else if (activeCityId === "tokyo") {
      connectorLeft = "74%";
      connectorHeight = "110px";
    }

    // Dynamic collage rendering based on currently selected city for un-card-like heterogeneous compositions
    let collageHtml = "";
    if (activeCityId === "bangkok") {
      collageHtml = `
        <!-- Polaroid Photo -->
        <div class="absolute -right-2 top-2 w-28 h-28 bg-stone-900 border-[3px] border-stone-800 p-1 pb-3 shadow-2xl rotate-[3.5deg] group-hover:rotate-[1deg] transition-all z-10">
          <div class="w-full h-20 bg-stone-950 overflow-hidden">
            <img src="https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=300" class="w-full h-full object-cover grayscale opacity-80 group-hover:grayscale-0 group-hover:opacity-100 transition-all" />
          </div>
          <span class="text-[6px] font-mono text-stone-500 block text-center mt-1">ARI APARTMENT</span>
        </div>
        <!-- Thermal Receipt Stub -->
        <div class="absolute right-16 top-8 w-20 h-28 bg-[#121211] border border-stone-800 p-2 font-mono text-[7px] text-stone-500 shadow-xl rotate-[-4.5deg] group-hover:rotate-[-1deg] transition-all z-20">
          <div class="border-b border-dashed border-stone-800 pb-1 mb-1 font-bold text-[8px] text-stone-400">COMMON GROUNDS</div>
          <p class="truncate uppercase">10/16 08:42</p>
          <p class="font-bold text-stone-300 mt-1">THB 185.00</p>
          <div class="w-full h-3 bg-stone-900 mt-4 opacity-30 flex items-center justify-between">
            <div class="w-0.5 h-full bg-stone-600"></div>
            <div class="w-1 h-full bg-stone-600"></div>
            <div class="w-0.5 h-full bg-stone-600"></div>
          </div>
        </div>
        <!-- Ticket Stub -->
        <div class="absolute right-4 top-24 w-28 h-12 bg-amber-950/10 border border-amber-900/30 p-1.5 font-mono text-[6px] text-amber-500/80 rounded shadow-md rotate-[1deg] group-hover:-translate-y-1 transition-all z-30 flex flex-col justify-between">
          <div class="flex justify-between font-bold">
            <span>CHAO PHRAYA</span>
            <span>5 THB</span>
          </div>
          <span class="text-[5px] text-stone-600">STUB #1018傍晚</span>
        </div>
      `;
    } else if (activeCityId === "chiang-mai") {
      collageHtml = `
        <!-- Polaroid Photo -->
        <div class="absolute -right-2 top-2 w-28 h-28 bg-stone-900 border-[3px] border-stone-800 p-1 pb-3 shadow-2xl rotate-[2deg] group-hover:rotate-[-1deg] transition-all z-10">
          <div class="w-full h-20 bg-stone-950 overflow-hidden">
            <img src="https://images.unsplash.com/photo-1542640244-7e672d6cef21?w=300" class="w-full h-full object-cover grayscale opacity-80 group-hover:grayscale-0 group-hover:opacity-100 transition-all" />
          </div>
          <span class="text-[6px] font-mono text-stone-500 block text-center mt-1">NIGHT BAZAAR</span>
        </div>
        <!-- Ticket Stub -->
        <div class="absolute right-14 top-10 w-24 h-24 bg-[#141413] border border-stone-800 p-2 font-mono text-[7px] text-stone-500 shadow-xl rotate-[-3deg] group-hover:rotate-[1deg] transition-all z-20 flex flex-col justify-between">
          <div>
            <div class="border-b border-dashed border-stone-800 pb-1 mb-1 font-bold text-[8px] text-stone-400">TRAIN #09</div>
            <p class="truncate uppercase">BKK → CNX</p>
            <p class="font-bold text-stone-300 mt-1">THB 840.00</p>
          </div>
          <span class="text-[5px] text-stone-600">EXIF: 10/11 20:15</span>
        </div>
      `;
    } else {
      collageHtml = `
        <!-- Polaroid Photo -->
        <div class="absolute -right-2 top-2 w-28 h-28 bg-stone-900 border-[3px] border-stone-800 p-1 pb-3 shadow-2xl rotate-[-4deg] group-hover:rotate-[2deg] transition-all z-10">
          <div class="w-full h-20 bg-stone-950 overflow-hidden">
            <img src="https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=300" class="w-full h-full object-cover grayscale opacity-80 group-hover:grayscale-0 group-hover:opacity-100 transition-all" />
          </div>
          <span class="text-[6px] font-mono text-stone-500 block text-center mt-1">SHINJUKU LANE</span>
        </div>
        <!-- Transit Pass Stub -->
        <div class="absolute right-16 top-10 w-22 h-14 bg-green-950/10 border border-green-900/30 p-2 font-mono text-[6px] text-green-500 rounded shadow-md rotate-[3deg] group-hover:translate-x-1 transition-all z-20 flex flex-col justify-between">
          <div class="flex justify-between font-bold">
            <span>SUICA PASS</span>
            <span>200 JPY</span>
          </div>
          <span class="text-[5px] text-stone-600">YAMANOTE LINE</span>
        </div>
      `;
    }

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

        <!-- Part I: LARGE INTERACTIVE GLOBE WIDGET (42%~48% of screen height in viewport) -->
        <div class="relative h-[290px] bg-gradient-to-b from-stone-950 to-stone-900/30 rounded-2xl border border-stone-900 overflow-hidden flex flex-col justify-between p-5">
          <!-- Animated rotating global grid vectors -->
          <div class="absolute inset-0 opacity-15 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px]"></div>
          
          <div class="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
            <!-- Simulated 3D Orbital wireframes -->
            <div class="w-48 h-48 rounded-full border border-dashed border-stone-800/80 animate-spin" style="animation-duration: 20s;"></div>
            <div class="absolute w-56 h-32 rounded-full border border-stone-850 rotate-[35deg] animate-pulse"></div>
            <div class="absolute w-56 h-32 rounded-full border border-stone-850 rotate-[-15deg] opacity-40"></div>
          </div>

          <div class="flex justify-between items-start z-10">
            <div>
              <span class="text-[9px] font-mono text-amber-500/80 tracking-widest uppercase">SPATIOTEMPORAL GLOBE</span>
              <h2 class="text-base font-display font-medium text-white mt-0.5">时空地球</h2>
            </div>
            <span class="px-2 py-0.5 rounded bg-stone-900 border border-stone-800 text-[8px] font-mono text-stone-400">坐标定位激活</span>
          </div>

          <!-- Interactive City Dots mapped over globe coordinates -->
          <div class="absolute inset-0 z-10">
            <!-- 1. Chiang Mai Dot -->
            <button onclick="window.selectCity('chiang-mai')" 
                    class="absolute group/dot flex flex-col items-center justify-center transition-all focus:outline-none" 
                    style="left: 32%; top: 38%;">
              <span class="absolute w-4 h-4 rounded-full bg-amber-500/25 ${activeCityId === 'chiang-mai' ? 'animate-ping' : 'opacity-0'}"></span>
              <span class="w-2 h-2 rounded-full border border-stone-950 ${activeCityId === 'chiang-mai' ? 'bg-amber-500 scale-125' : 'bg-stone-500 hover:bg-stone-300'} transition-all shadow-md"></span>
              <span class="text-[8px] font-mono text-stone-400 group-hover/dot:text-white mt-1 transition-colors">CHIANG MAI</span>
            </button>

            <!-- 2. Bangkok Dot -->
            <button onclick="window.selectCity('bangkok')" 
                    class="absolute group/dot flex flex-col items-center justify-center transition-all focus:outline-none" 
                    style="left: 45%; top: 48%;">
              <span class="absolute w-4 h-4 rounded-full bg-amber-500/25 ${activeCityId === 'bangkok' ? 'animate-ping' : 'opacity-0'}"></span>
              <span class="w-2 h-2 rounded-full border border-stone-950 ${activeCityId === 'bangkok' ? 'bg-amber-500 scale-125' : 'bg-stone-500 hover:bg-stone-300'} transition-all shadow-md"></span>
              <span class="text-[8px] font-mono text-stone-400 group-hover/dot:text-white mt-1 transition-colors">BANGKOK</span>
            </button>

            <!-- 3. Tokyo Dot -->
            <button onclick="window.selectCity('tokyo')" 
                    class="absolute group/dot flex flex-col items-center justify-center transition-all focus:outline-none" 
                    style="left: 74%; top: 28%;">
              <span class="absolute w-4 h-4 rounded-full bg-amber-500/25 ${activeCityId === 'tokyo' ? 'animate-ping' : 'opacity-0'}"></span>
              <span class="w-2 h-2 rounded-full border border-stone-950 ${activeCityId === 'tokyo' ? 'bg-amber-500 scale-125' : 'bg-stone-500 hover:bg-stone-300'} transition-all shadow-md"></span>
              <span class="text-[8px] font-mono text-stone-400 group-hover/dot:text-white mt-1 transition-colors">TOKYO</span>
            </button>
          </div>

          <!-- Physical cascading connecting line to sew Globe with bottom focus card -->
          <div class="absolute bottom-0 w-[1px] bg-gradient-to-t from-amber-500/60 to-transparent z-10 transition-all duration-300" 
               style="left: ${connectorLeft}; height: ${connectorHeight};">
            <span class="absolute bottom-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-amber-500 shadow-lg shadow-amber-500/50"></span>
          </div>

          <div class="flex justify-between items-end text-[9px] text-stone-500 font-mono z-10 pt-10">
            <span>对齐坐标: 32 点</span>
            <span>时空网络: 互联</span>
          </div>
        </div>

        <!-- Part II: RECOMMENDED FOCUS CITY - HETEROGENEOUS FRAGMENT COLLAGE (城市碎片错落群 - 空间拓扑) -->
        <div class="space-y-3">
          <h3 class="text-xs font-mono tracking-wider text-stone-500 uppercase">时空脉络显影城市 (Active Cities Core)</h3>
          
          <!-- Large uncard-style modular collage container -->
          <div class="relative min-h-[175px] bg-stone-900/10 hover:bg-stone-900/20 border border-stone-900 hover:border-stone-850/60 rounded-2xl p-5 overflow-hidden group transition-all cursor-pointer flex flex-col justify-between" 
               onclick="window.location.hash='#/world/city/${activeCity.id}'">
            
            <!-- Graphic Heterogeneous Collage Background strictly placed on the right -->
            <div class="absolute right-0 inset-y-0 w-[200px] pointer-events-none z-0 overflow-hidden">
              ${collageHtml}
            </div>

            <!-- Content Area strictly aligning text to avoid collisions -->
            <div class="space-y-2 z-10 max-w-[190px]">
              <span class="px-2 py-0.5 rounded text-[8px] font-mono border border-amber-500/20 bg-amber-500/5 text-amber-500 inline-block">
                轨迹规律已锁定 ✓
              </span>
              <h2 class="text-xl font-display font-medium text-white tracking-tight mt-1.5">${activeCity.name}</h2>
              <span class="text-[10px] font-mono text-stone-500 uppercase tracking-wider block">${activeCity.localizedName}</span>
              <p class="text-[11px] text-stone-400 leading-relaxed font-sans">${activeCity.period}</p>
            </div>

            <div class="mt-4 pt-2 border-t border-stone-950 flex justify-between items-center z-10 max-w-[200px]">
              <p class="text-[10px] text-stone-500 font-serif italic line-clamp-1">"${activeCity.narrative}"</p>
              <svg class="w-3.5 h-3.5 text-stone-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </div>

        <!-- Part III: GLOBAL ENTRIES -->
        <div class="grid grid-cols-2 gap-4">
          <div class="archive-card p-4.5 flex flex-col justify-between hover:border-stone-800 transition-all cursor-pointer" onclick="window.location.hash='#/world/fragments'">
            <div>
              <svg class="w-4 h-4 text-stone-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <h4 class="text-sm font-medium text-white mt-2">全部碎片</h4>
              <p class="text-[10px] text-stone-500 mt-1">全局 172 旅行原件事实</p>
            </div>
            <span class="text-xs text-amber-500/80 mt-4 font-mono">进入 Fragment Field →</span>
          </div>

          <div class="archive-card p-4.5 flex flex-col justify-between hover:border-stone-800 transition-all cursor-pointer" onclick="window.location.hash='#/world/inbox'">
            <div class="relative">
              <div class="absolute right-0 top-0 w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></div>
              <svg class="w-4 h-4 text-stone-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-3.586a1 1 0 00-.707.293l-1.414 1.414a1 1 0 01-.707.293h-2.122a1 1 0 01-.707-.293l-1.414-1.414A1 1 0 009.586 13H4" />
              </svg>
              <h4 class="text-sm font-medium text-white mt-2">收件箱</h4>
              <p class="text-[10px] text-stone-500 mt-1">2 个待确认时空问题</p>
            </div>
            <span class="text-xs text-stone-400 mt-4 font-mono">解决边界矛盾 →</span>
          </div>
        </div>

        <!-- Floating Add Button -->
        <div class="flex justify-center py-2">
          <button class="px-5 py-2.5 rounded-full bg-stone-900 border border-stone-800 text-[10px] font-mono flex items-center gap-2 hover:bg-stone-850 hover:border-stone-700 transition-all text-white shadow-xl" onclick="window.location.hash='#/world/import'">
            <svg class="w-3.5 h-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
        <div class="space-y-1.5">
          <h1 class="text-2xl font-display font-medium text-white">${city.name} <span class="text-sm text-stone-400 font-sans">${city.localizedName}</span></h1>
          <div class="text-xs text-stone-400 font-mono flex items-center gap-2">
            <span>${city.period}</span>
            <span>•</span>
            <span>${cityFrags.length} 碎片</span>
            <span>•</span>
            <span>${city.id === "bangkok" ? "3" : "2"} 个核心地点</span>
          </div>
        </div>

        <!-- Segment 1: City Fragment Field -->
        <div class="space-y-3">
          <div class="flex justify-between items-end">
            <h3 class="text-xs font-mono tracking-wider text-stone-400 uppercase">城市碎片场</h3>
            <span class="text-[10px] font-mono text-stone-500">${cityFrags.length} 个原件已对位</span>
          </div>

          <!-- Time-indexed Spatiotemporal Canvas -->
          <div class="fragment-field-canvas p-4 relative bg-stone-950/80 border border-stone-900 rounded-2xl overflow-hidden" style="height: 250px; background-size: 20px 20px; background-image: radial-gradient(circle, rgba(255,255,255,0.015) 1px, transparent 1px);">
            
            <!-- Canvas Grid Overlay & Connecting Time Splines -->
            <div class="absolute inset-0 pointer-events-none z-0">
              <svg class="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                <!-- Vertical Timeline Grid Tracks representing Morning / Afternoon / Evening -->
                <line x1="33%" y1="0" x2="33%" y2="100%" stroke="rgba(245, 158, 11, 0.04)" stroke-width="1" stroke-dasharray="2,4"/>
                <line x1="68%" y1="0" x2="68%" y2="100%" stroke="rgba(245, 158, 11, 0.04)" stroke-width="1" stroke-dasharray="2,4"/>
                
                <text x="3%" y="15" font-family="monospace" font-size="7" fill="rgba(120,113,108,0.4)">MORNING (清晨轨迹)</text>
                <text x="37%" y="15" font-family="monospace" font-size="7" fill="rgba(120,113,108,0.4)">AFTERNOON (午后交织)</text>
                <text x="71%" y="15" font-family="monospace" font-size="7" fill="rgba(120,113,108,0.4)">EVENING (傍晚合流)</text>

                <!-- Connecting spline to link sequential pieces -->
                <path d="M 40 100 Q 140 40 240 160 T 380 220" fill="none" stroke="rgba(255,255,255,0.025)" stroke-width="1"/>
              </svg>
            </div>

            <!-- Positioned Data-Driven Nodes -->
            <div class="relative w-full h-full z-10">
              ${cityFrags.map((frag, idx) => {
                // We map nodes to physical grid tracks based on their type
                let pos = { left: "12%", top: "18%" };
                
                if (frag.type === "photo") {
                  const mPos = [
                    { left: "6%", top: "18%" },
                    { left: "12%", top: "60%" },
                    { left: "5%", top: "40%" }
                  ];
                  pos = mPos[idx % mPos.length];
                } else if (frag.type === "receipt") {
                  const rPos = [
                    { left: "37%", top: "15%" },
                    { left: "46%", top: "42%" },
                    { left: "39%", top: "72%" }
                  ];
                  pos = rPos[idx % rPos.length];
                } else { // ticket / screenshots / other
                  const tPos = [
                    { left: "71%", top: "25%" },
                    { left: "75%", top: "58%" },
                    { left: "68%", top: "75%" }
                  ];
                  pos = tPos[idx % tPos.length];
                }
                
                return `<div style="position: absolute; left: ${pos.left}; top: ${pos.top};" class="transition-all duration-300">${renderFragmentNode(frag)}</div>`;
              }).join('')}
            </div>
          </div>

          <!-- Quick Interactive Guide to avoid empty blank state feeling -->
          <div class="text-center text-[10px] text-stone-500 font-mono py-1.5 bg-stone-900/10 rounded-xl border border-stone-900/40">
            💡 轻点任意粒子聚焦透镜（Lens）· 双击查看无损大图
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

        <!-- Action Links: Go Back to World or Explore -->
        <div class="grid grid-cols-2 gap-3 pt-2">
          <button class="py-3 px-4 rounded-xl bg-stone-900 border border-stone-850 hover:bg-stone-800 text-stone-300 text-xs font-sans font-medium transition-all text-center" onclick="window.location.hash='#/world'">
            回到 World
          </button>
          <button class="py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-sans font-semibold transition-all text-center" onclick="window.location.hash='#/world/city/${cityId}/explore'">
            探索这段旅程
          </button>
        </div>
      </div>
    `;
  }

  // 4. WORLD ALL FRAGMENTS VIEW (FRAGMENT FIELD)
  if (pageId === "world-fragments") {
    // Inject custom client-side search listener specifically for real-time performance
    window.handleFragmentSearch = function(val) {
      const query = val.toLowerCase().trim();
      const particles = document.querySelectorAll(".topology-particle");
      
      particles.forEach(particle => {
        const text = particle.getAttribute("data-search-text").toLowerCase();
        if (!query || text.includes(query)) {
          particle.style.transform = "scale(1)";
          // Retain current opacity if filter matches, else handle search opacity
          particle.classList.remove("brightness-50");
          if (query) {
            particle.classList.add("ring-2", "ring-amber-500/50");
          } else {
            particle.classList.remove("ring-2", "ring-amber-500/50");
          }
        } else {
          particle.style.transform = "scale(0.85)";
          particle.classList.add("brightness-50");
          particle.classList.remove("ring-2", "ring-amber-500/50");
        }
      });
    };

    window.setFragmentFilter = (type) => {
      store.state.filterType = type;
      store.notify();
    };

    window.setupInteractiveCanvas = function() {
      const canvas = document.getElementById("boundless-fragment-canvas");
      const viewport = document.getElementById("canvas-viewport");
      const scaleIndicator = document.getElementById("scale-indicator");
      const panIndicator = document.getElementById("pan-indicator");

      if (!canvas || !viewport) return;

      let isDragging = false;
      let startX = 0;
      let startY = 0;
      let panX = -450;
      let panY = -450;
      let scale = 0.85;

      const updateTransform = () => {
        viewport.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
        if (scaleIndicator) scaleIndicator.innerText = `${Math.round(scale * 100)}%`;
        if (panIndicator) panIndicator.innerText = `X: ${Math.round(panX)}, Y: ${Math.round(panY)}`;
      };

      // Dragging / Panning
      canvas.addEventListener("mousedown", (e) => {
        if (e.target.closest("button") || e.target.closest(".topology-particle")) return;
        isDragging = true;
        canvas.classList.add("cursor-grabbing");
        startX = e.clientX - panX;
        startY = e.clientY - panY;
      });

      const handleMouseMove = (e) => {
        if (!isDragging) return;
        panX = e.clientX - startX;
        panY = e.clientY - startY;
        updateTransform();
      };

      const handleMouseUp = () => {
        isDragging = false;
        canvas.classList.remove("cursor-grabbing");
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);

      // Zoom controls
      window.zoomInCanvas = () => {
        scale = Math.min(1.5, scale + 0.1);
        updateTransform();
      };

      window.zoomOutCanvas = () => {
        scale = Math.max(0.4, scale - 0.1);
        updateTransform();
      };

      window.resetCanvasTransform = () => {
        scale = 0.85;
        panX = -450;
        panY = -450;
        updateTransform();
      };

      // Wheel zoom support
      canvas.addEventListener("wheel", (e) => {
        e.preventDefault();
        const zoomFactor = 0.05;
        if (e.deltaY < 0) {
          scale = Math.min(1.5, scale + zoomFactor);
        } else {
          scale = Math.max(0.4, scale - zoomFactor);
        }
        updateTransform();
      }, { passive: false });
    };

    // Self-initializing trigger to hook up interactive pointer events upon DOM insertion
    setTimeout(() => {
      if (typeof window.setupInteractiveCanvas === "function") {
        window.setupInteractiveCanvas();
      }
    }, 50);

    const isFilterMatch = (fType, fStatus) => {
      const activeFilter = state.filterType || "all";
      if (activeFilter === "all") return true;
      if (activeFilter === "photo") return fType === "photo";
      if (activeFilter === "receipt") return fType === "receipt";
      if (activeFilter === "ticket") return fType === "ticket";
      if (activeFilter === "unresolved") return fStatus === "unresolved" || fStatus === "unplaced" || fStatus === "unplaced-edge";
      return true;
    };

    return `
      <div class="p-6 space-y-5 fade-in text-stone-200">
        <!-- Top Nav Header -->
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-3">
            <a href="#/world" class="p-1 rounded hover:bg-stone-850 text-stone-400 hover:text-white transition-colors">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7" />
              </svg>
            </a>
            <div>
              <span class="text-[9px] font-mono tracking-widest text-stone-500 uppercase">Archive Continuum</span>
              <h1 class="text-base font-display font-medium text-white">全部旅行碎片群落</h1>
            </div>
          </div>
          <span class="text-[10px] font-mono text-stone-500 bg-stone-950 px-2 py-0.5 rounded border border-stone-900/60">${state.fragments.length + 6} 个原件事实已标定</span>
        </div>

        <!-- Real-Time Search-Driven Input -->
        <div class="space-y-2">
          <div class="relative">
            <input type="text" 
                   placeholder="搜索商户、媒介类型、EXIF或原始事实 (例如: Ari, Common, 新宿, Graph)..." 
                   class="w-full bg-stone-950 border border-stone-900 rounded-xl px-4 py-2.5 text-xs text-stone-100 placeholder-stone-700 focus:outline-none focus:border-amber-500/50 font-sans transition-all"
                   oninput="window.handleFragmentSearch(this.value)">
            <div class="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
              <span class="px-1.5 py-0.5 rounded bg-stone-900 border border-stone-850 text-[7px] font-mono text-stone-500 uppercase tracking-widest">SEARCH</span>
            </div>
          </div>
        </div>

        <!-- Multi-Category Filter Row -->
        <div class="flex items-center gap-1.5 pb-1 overflow-x-auto scrollbar-none select-none">
          <button onclick="window.setFragmentFilter('all')" class="px-3 py-1.5 rounded-full text-[11px] font-sans transition-colors border shrink-0 ${state.filterType === 'all' || !state.filterType ? 'bg-amber-500 text-stone-950 border-amber-500 font-medium' : 'bg-stone-950 text-stone-400 border-stone-900 hover:text-white' || 'bg-stone-950 text-stone-400 border-stone-900 hover:text-white'}">
            全部 (${state.fragments.length + 6})
          </button>
          <button onclick="window.setFragmentFilter('photo')" class="px-3 py-1.5 rounded-full text-[11px] font-sans transition-colors border shrink-0 ${state.filterType === 'photo' ? 'bg-amber-500 text-stone-950 border-amber-500 font-medium' : 'bg-stone-950 text-stone-400 border-stone-900 hover:text-white'}">
            📸 照相原件 (${6})
          </button>
          <button onclick="window.setFragmentFilter('receipt')" class="px-3 py-1.5 rounded-full text-[11px] font-sans transition-colors border shrink-0 ${state.filterType === 'receipt' ? 'bg-amber-500 text-stone-950 border-amber-500 font-medium' : 'bg-stone-950 text-stone-400 border-stone-900 hover:text-white'}">
            📄 账单票据 (${5})
          </button>
          <button onclick="window.setFragmentFilter('ticket')" class="px-3 py-1.5 rounded-full text-[11px] font-sans transition-colors border shrink-0 ${state.filterType === 'ticket' ? 'bg-amber-500 text-stone-950 border-amber-500 font-medium' : 'bg-stone-950 text-stone-400 border-stone-900 hover:text-white'}">
            🎫 transit车船票 (${2})
          </button>
          <button onclick="window.setFragmentFilter('unresolved')" class="px-3 py-1.5 rounded-full text-[11px] font-sans transition-colors border shrink-0 ${state.filterType === 'unresolved' ? 'bg-amber-500 text-stone-950 border-amber-500 font-medium' : 'bg-stone-950 text-stone-400 border-stone-900 hover:text-white'}">
            ❓ 待证实/未安放 (${3})
          </button>
        </div>

        <!-- The Boundless Fragment Field Canvas (真正的平移、缩放与过滤对齐) -->
        <div id="boundless-fragment-canvas" class="relative w-full h-[540px] bg-stone-950 border border-stone-900 rounded-2xl overflow-hidden cursor-grab active:cursor-grabbing select-none">
          
          <!-- Interactive Floating Toolbar Overlay -->
          <div class="absolute bottom-4 left-4 z-20 flex items-center gap-1.5 bg-stone-950/90 border border-stone-900 px-3 py-1.5 rounded-xl backdrop-blur">
            <button onclick="window.zoomInCanvas()" class="p-1 rounded hover:bg-stone-900 text-stone-400 hover:text-white transition-colors" title="放大">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <span id="scale-indicator" class="text-[10px] font-mono text-stone-300 font-semibold w-10 text-center">85%</span>
            <button onclick="window.zoomOutCanvas()" class="p-1 rounded hover:bg-stone-900 text-stone-400 hover:text-white transition-colors" title="缩小">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M20 12H4" />
              </svg>
            </button>
            <div class="h-3 w-[1px] bg-stone-900 mx-1"></div>
            <button onclick="window.resetCanvasTransform()" class="p-1 rounded hover:bg-stone-900 text-stone-400 hover:text-white transition-colors" title="重置视角">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H17" />
              </svg>
            </button>
          </div>

          <!-- Dynamic Coords Dashboard -->
          <div class="absolute top-4 left-4 z-20 hidden md:flex items-center gap-2 text-[9px] font-mono text-stone-500 bg-stone-950/85 border border-stone-900 px-2.5 py-1 rounded-lg">
            <span>COORDS:</span>
            <span id="pan-indicator" class="text-stone-300">X: -450, Y: -450</span>
          </div>

          <!-- Instruction Tip Overlay -->
          <div class="absolute top-4 right-4 z-20 flex items-center gap-1.5 text-[9px] font-sans text-stone-500 bg-stone-950/85 border border-stone-900 px-2.5 py-1 rounded-lg">
            <span>🖱️ 拖拽画布可任意平移，滚轮/双指进行缩放</span>
          </div>

          <!-- Viewport Workspace (Inner container translated & scaled dynamically) -->
          <div id="canvas-viewport" class="absolute w-[1800px] h-[1800px] transition-transform duration-75 ease-out origin-center" style="transform: translate(-450px, -450px) scale(0.85); background-size: 24px 24px; background-image: radial-gradient(circle, rgba(255,255,255,0.015) 1px, transparent 1px);">
            
            <!-- Spatiotemporal Connecting Web Structure -->
            <svg class="absolute inset-0 w-full h-full pointer-events-none z-0" xmlns="http://www.w3.org/2000/svg">
              <!-- Grid background alignment rings -->
              <circle cx="900" cy="900" r="450" fill="none" stroke="rgba(245, 158, 11, 0.01)" stroke-width="2" />
              <circle cx="900" cy="900" r="250" fill="none" stroke="rgba(245, 158, 11, 0.015)" stroke-width="1" />

              <!-- Cross-regional memory connections (Bangkok to Tokyo / Chiang Mai) -->
              <path d="M 600 600 Q 850 500 1150 500" fill="none" stroke="rgba(245, 158, 11, 0.05)" stroke-width="1.5" stroke-dasharray="6,6"/>
              <path d="M 600 600 Q 550 850 550 1150" fill="none" stroke="rgba(245, 158, 11, 0.05)" stroke-width="1.5" stroke-dasharray="6,6"/>
              
              <!-- Ambient labels -->
              <text x="600" y="380" font-family="sans-serif" font-size="11" font-weight="500" fill="rgba(255,255,255,0.25)" text-anchor="middle" letter-spacing="1">曼谷群落 · 秋季生活轨迹</text>
              <text x="1150" y="380" font-family="sans-serif" font-size="11" font-weight="500" fill="rgba(255,255,255,0.2)" text-anchor="middle" letter-spacing="1">东京群落 · 异乡漫游冬季</text>
              <text x="550" y="960" font-family="sans-serif" font-size="11" font-weight="500" fill="rgba(255,255,255,0.2)" text-anchor="middle" letter-spacing="1">清迈群落 · 雨季静止停留</text>
              <text x="1150" y="960" font-family="sans-serif" font-size="11" font-weight="500" fill="rgba(255,255,255,0.15)" text-anchor="middle" letter-spacing="1">未安放漂流事实</text>
            </svg>

            <!-- ============================== BANGKOK CLUSTER ============================== -->
            <!-- Bangkok Node 1: 12 Oct Photo -->
            <div class="topology-particle absolute transition-all duration-300 hover:z-50 cursor-pointer ${isFilterMatch('photo', 'confirmed') ? 'opacity-100' : 'opacity-10 pointer-events-none'}" 
                 data-search-text="frag-ari-1012-photo bangkok photo coffee table shadow ari common grounds" 
                 style="left: 450px; top: 460px;"
                 onclick="window.focusFragmentAction('frag-ari-1012-photo')">
              <div class="w-[145px] bg-stone-900 border border-stone-800 p-2 pb-3.5 shadow-xl hover:border-amber-500/40 transition-colors rounded">
                <img src="../../assets/bangkok-photo-04-ari-coffee.png" class="w-full h-24 object-cover rounded-sm border border-stone-950" referrerPolicy="no-referrer">
                <div class="mt-2 space-y-0.5 font-sans">
                  <div class="flex justify-between items-center text-[7px] font-mono text-amber-500/90 font-medium">
                    <span>12 OCT</span>
                    <span>📸 PHOTO</span>
                  </div>
                  <h4 class="text-[9.5px] font-medium text-white truncate">Ari 桌面大理石树影</h4>
                </div>
              </div>
            </div>

            <!-- Bangkok Node 2: 16 Oct Receipt -->
            <div class="topology-particle absolute transition-all duration-300 hover:z-50 cursor-pointer ${isFilterMatch('receipt', 'confirmed') ? 'opacity-100' : 'opacity-10 pointer-events-none'}" 
                 data-search-text="frag-ari-1016-receipt bangkok receipt ice latte breakfast amount 124 thb common grounds ari" 
                 style="left: 420px; top: 620px;"
                 onclick="window.focusFragmentAction('frag-ari-1016-receipt')">
              <div class="w-[125px] bg-[#141413] border border-[#2d2d2c] p-3 shadow-lg hover:border-amber-500/40 transition-colors relative">
                <div class="flex justify-between text-[7px] font-mono text-stone-500 border-b border-dashed border-stone-800 pb-1 mb-1.5">
                  <span>THERMAL</span>
                  <span>16 OCT</span>
                </div>
                <h4 class="text-[9.5px] font-mono text-stone-300 font-bold leading-tight truncate">Common Grounds</h4>
                <p class="text-[8px] font-mono text-stone-500 mt-1 leading-snug">1 ICE LATTE - 124 THB</p>
                <div class="w-full h-3 bg-stone-950 mt-3 opacity-30 flex justify-between">
                  <span class="w-[2px] h-full bg-stone-500"></span>
                  <span class="w-1 h-full bg-stone-500"></span>
                  <span class="w-[2px] h-full bg-stone-500"></span>
                  <span class="w-0.5 h-full bg-stone-500"></span>
                </div>
              </div>
            </div>

            <!-- Bangkok Node 3: 16 Oct Photo -->
            <div class="topology-particle absolute transition-all duration-300 hover:z-50 cursor-pointer ${isFilterMatch('photo', 'confirmed') ? 'opacity-100' : 'opacity-10 pointer-events-none'}" 
                 data-search-text="frag-ari-1016-photo bangkok photo rain door morning common grounds ari" 
                 style="left: 600px; top: 480px;"
                 onclick="window.focusFragmentAction('frag-ari-1016-photo')">
              <div class="w-[145px] bg-stone-900 border border-stone-800 p-2 pb-3.5 shadow-xl hover:border-amber-500/40 transition-colors rounded">
                <img src="../../assets/bangkok-photo-01-ari-morning.jpg" class="w-full h-24 object-cover rounded-sm border border-stone-950" referrerPolicy="no-referrer">
                <div class="mt-2 space-y-0.5 font-sans">
                  <div class="flex justify-between items-center text-[7px] font-mono text-amber-500/90 font-medium">
                    <span>16 OCT</span>
                    <span>📸 PHOTO</span>
                  </div>
                  <h4 class="text-[9.5px] font-medium text-white truncate">咖啡店早晨落雨</h4>
                </div>
              </div>
            </div>

            <!-- Bangkok Node 4: 19 Oct Visit Receipt -->
            <div class="topology-particle absolute transition-all duration-300 hover:z-50 cursor-pointer ${isFilterMatch('receipt', 'confirmed') ? 'opacity-100' : 'opacity-10 pointer-events-none'}" 
                 data-search-text="frag-ari-1019-visit bangkok receipt filter coffee 150 thb cash common grounds ari" 
                 style="left: 620px; top: 620px;"
                 onclick="window.focusFragmentAction('frag-ari-1019-visit')">
              <div class="w-[130px] bg-[#141413] border border-[#2d2d2c] p-3 shadow-lg hover:border-amber-500/40 transition-colors relative">
                <div class="flex justify-between text-[7px] font-mono text-stone-500 border-b border-dashed border-stone-800 pb-1 mb-1.5">
                  <span>CASH REC</span>
                  <span>19 OCT</span>
                </div>
                <h4 class="text-[9.5px] font-mono text-stone-300 font-bold leading-tight truncate">Common Grounds</h4>
                <p class="text-[8px] font-mono text-stone-500 mt-1 leading-snug">FILTER COFFEE - 150 THB</p>
                <div class="w-full h-3 bg-stone-950 mt-3 opacity-30 flex justify-between">
                  <span class="w-[2px] h-full bg-stone-500"></span>
                  <span class="w-[2px] h-full bg-stone-500"></span>
                  <span class="w-1 h-full bg-stone-500"></span>
                </div>
              </div>
            </div>

            <!-- Bangkok Node 5: 18 Oct Ferry Ticket -->
            <div class="topology-particle absolute transition-all duration-300 hover:z-50 cursor-pointer ${isFilterMatch('ticket', 'confirmed') ? 'opacity-100' : 'opacity-10 pointer-events-none'}" 
                 data-search-text="frag-river-1018-ticket bangkok ticket chao phraya ferry boat river crossing 5 thb" 
                 style="left: 450px; top: 760px;"
                 onclick="window.focusFragmentAction('frag-river-1018-ticket')">
              <div class="w-[150px] bg-amber-950/10 border border-amber-900/30 rounded-lg p-2.5 shadow-md hover:border-amber-500/40 transition-colors relative font-mono">
                <!-- Tear-stub dashed visual lines -->
                <div class="absolute right-7 inset-y-0 border-r border-dashed border-amber-900/20"></div>
                <div class="flex justify-between text-[7.5px] text-amber-500 font-semibold mb-1">
                  <span>🎫 TRANSIT TICKET</span>
                  <span>5 THB</span>
                </div>
                <h4 class="text-[9.5px] font-sans font-semibold text-stone-300 truncate mt-1">湄南河渡轮乘船票</h4>
                <span class="text-[7.5px] text-stone-500 block mt-1">18 OCT · 17:42 EXIF</span>
              </div>
            </div>

            <!-- Bangkok Node 6: 18 Oct Sunset Photo -->
            <div class="topology-particle absolute transition-all duration-300 hover:z-50 cursor-pointer ${isFilterMatch('photo', 'confirmed') ? 'opacity-100' : 'opacity-10 pointer-events-none'}" 
                 data-search-text="frag-river-1018-photo bangkok photo sunset boat ferry river crossing chao phraya" 
                 style="left: 630px; top: 740px;"
                 onclick="window.focusFragmentAction('frag-river-1018-photo')">
              <div class="w-[145px] bg-stone-900 border border-stone-800 p-2 pb-3.5 shadow-xl hover:border-amber-500/40 transition-colors rounded">
                <img src="../../assets/bangkok-photo-02-riverside.jpg" class="w-full h-24 object-cover rounded-sm border border-stone-950" referrerPolicy="no-referrer">
                <div class="mt-2 space-y-0.5 font-sans">
                  <div class="flex justify-between items-center text-[7px] font-mono text-amber-500/90 font-medium">
                    <span>18 OCT</span>
                    <span>📸 PHOTO</span>
                  </div>
                  <h4 class="text-[9.5px] font-medium text-white truncate">昭披耶河傍晚渡轮落日</h4>
                </div>
              </div>
            </div>


            <!-- ============================== TOKYO CLUSTER (冬) ============================== -->
            <!-- Tokyo Node 1: Shinjuku Photo -->
            <div class="topology-particle absolute transition-all duration-300 hover:z-50 cursor-pointer ${isFilterMatch('photo', 'confirmed') ? 'opacity-100' : 'opacity-10 pointer-events-none'}" 
                 data-search-text="frag-tokyo-102 tokyo photo shinjuku lane winter" 
                 style="left: 1060px; top: 420px;"
                 onclick="window.focusFragmentAction('frag-tokyo-102')">
              <div class="w-[145px] bg-stone-900 border border-stone-800 p-2 pb-3.5 shadow-xl hover:border-amber-500/40 transition-colors rounded">
                <img src="https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=300" class="w-full h-24 object-cover rounded-sm border border-stone-950" referrerPolicy="no-referrer">
                <div class="mt-2 space-y-0.5 font-sans">
                  <div class="flex justify-between items-center text-[7px] font-mono text-amber-500/90 font-medium">
                    <span>05 DEC</span>
                    <span>📸 照相原件</span>
                  </div>
                  <h4 class="text-[9.5px] font-medium text-stone-300 truncate">新宿街角霓虹寒意</h4>
                </div>
              </div>
            </div>

            <!-- Tokyo Node 2: Shinjuku Bar Receipt -->
            <div class="topology-particle absolute transition-all duration-300 hover:z-50 cursor-pointer ${isFilterMatch('receipt', 'confirmed') ? 'opacity-100' : 'opacity-10 pointer-events-none'}" 
                 data-search-text="frag-tokyo-101 tokyo receipt ben fiddich shinjuku amount 4400 jpy" 
                 style="left: 1240px; top: 450px;"
                 onclick="window.focusFragmentAction('frag-tokyo-101')">
              <div class="w-[125px] bg-[#141413] border border-[#2d2d2c] p-3 shadow-lg hover:border-amber-500/40 transition-colors relative">
                <div class="flex justify-between text-[7px] font-mono text-stone-500 border-b border-dashed border-stone-800 pb-1 mb-1.5">
                  <span>消费账单</span>
                  <span>05 DEC</span>
                </div>
                <h4 class="text-[9.5px] font-mono text-stone-300 font-bold leading-tight truncate">Bar Ben Fiddich 账单</h4>
                <p class="text-[8px] font-mono text-stone-500 mt-1 leading-snug">2 COCKTAILS - 4400 JPY</p>
                <div class="w-full h-3 bg-stone-950 mt-3 opacity-30 flex justify-between">
                  <span class="w-[1px] h-full bg-stone-500"></span>
                  <span class="w-[2px] h-full bg-stone-500"></span>
                  <span class="w-[1px] h-full bg-stone-500"></span>
                </div>
              </div>
            </div>

            <!-- Tokyo Node 3: Daikanyama Bookstore Photo -->
            <div class="topology-particle absolute transition-all duration-300 hover:z-50 cursor-pointer ${isFilterMatch('photo', 'confirmed') ? 'opacity-100' : 'opacity-10 pointer-events-none'}" 
                 data-search-text="frag-tokyo-201 tokyo photo shibuya daikanyama t-site morning" 
                 style="left: 1150px; top: 600px;"
                 onclick="window.focusFragmentAction('frag-tokyo-201')">
              <div class="w-[145px] bg-stone-900 border border-stone-800 p-2 pb-3.5 shadow-xl hover:border-amber-500/40 transition-colors rounded">
                <img src="https://images.unsplash.com/photo-1542051841857-5f90071e7989?w=300" class="w-full h-24 object-cover rounded-sm border border-stone-950" referrerPolicy="no-referrer">
                <div class="mt-2 space-y-0.5 font-sans">
                  <div class="flex justify-between items-center text-[7px] font-mono text-amber-500/90 font-medium">
                    <span>08 DEC</span>
                    <span>📸 照相原件</span>
                  </div>
                  <h4 class="text-[9.5px] font-medium text-stone-300 truncate">代官山书香冬日</h4>
                </div>
              </div>
            </div>


            <!-- ============================== CHIANG MAI CLUSTER (夏) ============================== -->
            <!-- Chiang Mai Node 1: Graph Cafe Handdrip -->
            <div class="topology-particle absolute transition-all duration-300 hover:z-50 cursor-pointer ${isFilterMatch('photo', 'confirmed') ? 'opacity-100' : 'opacity-10 pointer-events-none'}" 
                 data-search-text="frag-chiang-mai-101 chiang mai photo nimman graph cafe handdrip filter" 
                 style="left: 460px; top: 1040px;"
                 onclick="window.focusFragmentAction('frag-chiang-mai-101')">
              <div class="w-[145px] bg-stone-900 border border-stone-800 p-2 pb-3.5 shadow-xl hover:border-amber-500/40 transition-colors rounded">
                <img src="https://images.unsplash.com/photo-1541167760496-1628856ab772?w=300" class="w-full h-24 object-cover rounded-sm border border-stone-950" referrerPolicy="no-referrer">
                <div class="mt-2 space-y-0.5 font-sans">
                  <div class="flex justify-between items-center text-[7px] font-mono text-amber-500/90 font-medium">
                    <span>12 AUG</span>
                    <span>📸 照相原件</span>
                  </div>
                  <h4 class="text-[9.5px] font-medium text-stone-300 truncate">宁曼路小铺手冲咖啡</h4>
                </div>
              </div>
            </div>

            <!-- Chiang Mai Node 2: Graph Cafe Receipt -->
            <div class="topology-particle absolute transition-all duration-300 hover:z-50 cursor-pointer ${isFilterMatch('receipt', 'confirmed') ? 'opacity-100' : 'opacity-10 pointer-events-none'}" 
                 data-search-text="frag-chiang-mai-102 chiang mai receipt graph cafe amount 95 thb" 
                 style="left: 630px; top: 1080px;"
                 onclick="window.focusFragmentAction('frag-chiang-mai-102')">
              <div class="w-[125px] bg-[#141413] border border-stone-850 p-3 shadow-lg hover:border-amber-500/40 transition-colors relative font-mono">
                <div class="flex justify-between text-[7px] font-mono text-stone-500 border-b border-dashed border-stone-800 pb-1 mb-1.5">
                  <span>消费账单</span>
                  <span>12 AUG</span>
                </div>
                <h4 class="text-[9.5px] font-sans font-semibold text-stone-300 truncate">Graph Cafe 账单</h4>
                <p class="text-[8px] font-mono text-stone-500 mt-1 leading-snug">1 ESPRESSO - 95 THB</p>
                <div class="w-full h-3 bg-stone-950 mt-3 opacity-30 flex justify-between">
                  <span class="w-[1px] h-full bg-stone-500"></span>
                  <span class="w-[2px] h-full bg-stone-500"></span>
                  <span class="w-[1px] h-full bg-stone-500"></span>
                </div>
              </div>
            </div>

            <!-- Chiang Mai Node 3: Temple Lanna Photo -->
            <div class="topology-particle absolute transition-all duration-300 hover:z-50 cursor-pointer ${isFilterMatch('photo', 'confirmed') ? 'opacity-100' : 'opacity-10 pointer-events-none'}" 
                 data-search-text="frag-chiang-mai-201 chiang mai photo temple wat pha lat green" 
                 style="left: 540px; top: 1200px;"
                 onclick="window.focusFragmentAction('frag-chiang-mai-201')">
              <div class="w-[145px] bg-stone-900 border border-stone-800 p-2 pb-3.5 shadow-xl hover:border-amber-500/40 transition-colors rounded">
                <img src="https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=300" class="w-full h-24 object-cover rounded-sm border border-stone-950" referrerPolicy="no-referrer">
                <div class="mt-2 space-y-0.5 font-sans">
                  <div class="flex justify-between items-center text-[7px] font-mono text-amber-500/90 font-medium">
                    <span>14 AUG</span>
                    <span>📸 照相原件</span>
                  </div>
                  <h4 class="text-[9.5px] font-medium text-stone-300 truncate">素贴山兰纳古寺</h4>
                </div>
              </div>
            </div>


            <!-- ============================== UNPLACED GAPS (待定漂流Facts) ============================== -->
            <!-- Unplaced 1: Pad Thai Menu -->
            <div class="topology-particle absolute transition-all duration-300 hover:z-50 cursor-pointer ${isFilterMatch('unresolved', 'unresolved') ? 'opacity-100' : 'opacity-10 pointer-events-none'}" 
                 data-search-text="frag-old-town-1017-menu bangkok old town menu pad thai tom yum unplaced unresolved" 
                 style="left: 1040px; top: 1060px;"
                 onclick="window.focusFragmentAction('frag-old-town-1017-menu')">
              <div class="w-[130px] bg-[#141413] border border-[#2d2d2c] border-dashed p-3 shadow-lg hover:border-amber-500/40 transition-colors relative">
                <span class="px-1 py-0.2 rounded bg-amber-500/10 border border-amber-500/20 text-[6px] font-mono text-amber-500 uppercase">UNPLACED MENU</span>
                <h4 class="text-[9.5px] font-mono text-stone-300 mt-2 font-bold leading-tight truncate">Pad Thai 老街纸质菜单</h4>
                <p class="text-[8px] font-mono text-stone-500 mt-1">NO GPS COORDS - 17 OCT</p>
              </div>
            </div>

            <!-- Unplaced 2: Old Town Bus Photo -->
            <div class="topology-particle absolute transition-all duration-300 hover:z-50 cursor-pointer ${isFilterMatch('unresolved', 'unresolved') ? 'opacity-100' : 'opacity-10 pointer-events-none'}" 
                 data-search-text="frag-old-town-1017-photo bangkok old town walk red bus photo walk" 
                 style="left: 1220px; top: 1040px;"
                 onclick="window.focusFragmentAction('frag-old-town-1017-photo')">
              <div class="w-[145px] bg-stone-900 border border-stone-850 border-dashed p-2 pb-3.5 shadow-xl hover:border-amber-500/40 transition-colors rounded">
                <img src="../../assets/bangkok-photo-03-old-town.jpg" class="w-full h-24 object-cover rounded-sm border border-stone-950 opacity-60" referrerPolicy="no-referrer">
                <div class="mt-2 space-y-0.5 font-sans">
                  <div class="flex justify-between items-center text-[7px] font-mono text-amber-500/70 font-medium">
                    <span>17 OCT</span>
                    <span>❓ UNRESOLVED</span>
                  </div>
                  <h4 class="text-[9.5px] font-medium text-stone-400 truncate">老街红色大巴影子</h4>
                </div>
              </div>
            </div>

            <!-- Unplaced 3: Maps Screenshot -->
            <div class="topology-particle absolute transition-all duration-300 hover:z-50 cursor-pointer ${isFilterMatch('unresolved', 'unresolved') ? 'opacity-100' : 'opacity-10 pointer-events-none'}" 
                 data-search-text="frag-river-1022-map bangkok google maps screenshot ferry wharf riverside" 
                 style="left: 1120px; top: 1180px;"
                 onclick="window.focusFragmentAction('frag-river-1022-map')">
              <div class="w-[130px] bg-[#141413] border border-[#2d2d2c] border-dashed p-3 shadow-lg hover:border-amber-500/40 transition-colors relative">
                <span class="px-1 py-0.2 rounded bg-stone-900 border border-stone-800 text-[6px] font-mono text-stone-500 uppercase">❓ SCREENSHOT</span>
                <h4 class="text-[9.5px] font-mono text-stone-300 mt-2 font-bold leading-tight truncate">湄南河码头附近地图</h4>
                <p class="text-[8px] font-mono text-stone-500 mt-1">SCREENSHOT DATE: 22 OCT</p>
              </div>
            </div>

          </div>
        </div>

        <!-- Supportive Bottom Indicator -->
        <div class="p-4 bg-stone-900/10 border border-stone-900 rounded-xl space-y-1.5">
          <span class="text-[8px] font-mono text-stone-500 uppercase tracking-widest block">Topology Calibration Deck</span>
          <p class="text-[11px] text-stone-400 font-sans leading-relaxed">
            此视图汇总了您在曼谷、清迈和东京旅程中落入的所有客观旅行原件。直接通过顶端输入栏搜索商户、媒介类型、小票内容对画布进行实时高亮聚焦。点击任意碎片激活微镜 LENS 溯源底层时空。
          </p>
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
        window.location.hash = "#/world/inbox/receipt/batch-bangkok-backfill";
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
    
    return `
      <div class="p-6 space-y-6 fade-in text-stone-200">
        <div class="space-y-1">
          <span class="px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[9px] font-mono uppercase tracking-wider">Archive Receipt</span>
          <h1 class="text-2xl font-display font-medium text-white">整理回执</h1>
          <p class="text-xs text-stone-500 font-mono">导入批次: ${batchId}</p>
        </div>

        <!-- Receipt Card Panel -->
        <div class="archive-card p-5 space-y-4 border-stone-800/80 bg-stone-900/30 rounded-2xl">
          <div class="flex justify-between border-b border-stone-900 pb-3">
            <span class="text-xs text-stone-400">提取照片原件</span>
            <span class="text-xs font-mono font-bold text-white">25 张照片</span>
          </div>

          <div class="flex justify-between border-b border-stone-900 pb-3">
            <span class="text-xs text-stone-400">识别消费票据</span>
            <span class="text-xs font-mono font-bold text-white">3 份账单小票</span>
          </div>

          <div class="flex justify-between border-b border-stone-900 pb-3">
            <span class="text-xs text-amber-500">待判断的未决问题</span>
            <span class="text-xs font-mono font-bold text-amber-500">2 个未决问题</span>
          </div>

          <!-- AI observations without emotive prose -->
          <div class="text-xs text-stone-400 leading-relaxed pt-2">
            我们提取了 25 张照片的 EXIF 坐标以及 3 份纸质小票的 OCR 数据。全部客观旅行原件已归入当前曼谷世界中。
          </div>
        </div>

        <!-- Styled Tip Box (提示框) -->
        <div class="p-4 bg-amber-500/[0.02] border border-dashed border-amber-500/20 rounded-xl space-y-1">
          <span class="text-[8px] font-mono text-amber-500 uppercase tracking-widest block">💡 温馨提示 (Calibration Guidance)</span>
          <p class="text-[11px] text-stone-400 font-sans leading-relaxed">
            系统检测到有 2 个关于 Common Grounds 及湄南河候船事实的未决对齐关系问题。这些未决问题已经整理归集到了您的收件箱中，及时解答和处理它们可以消除时空缺口，使您的旅行时空轨迹地图更加精确。
          </p>
        </div>

        <div class="flex flex-col gap-3 pt-2">
          <button onclick="window.location.hash='#/world/inbox'" class="w-full py-3.5 rounded-xl bg-amber-500 text-stone-950 font-sans font-semibold text-xs text-center hover:bg-amber-400 transition-all uppercase tracking-wider">
            前往解决 2 个未决问题
          </button>
          <button onclick="window.location.hash='#/world'" class="w-full py-3.5 rounded-xl bg-stone-900 border border-stone-850 text-stone-300 font-sans font-medium text-xs text-center hover:bg-stone-800 transition-all uppercase tracking-wider">
            回到世界
          </button>
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
          <button class="w-full py-3.5 rounded-xl bg-stone-200 text-stone-950 font-sans font-medium text-sm text-center hover:bg-white transition-all shadow-lg" onclick="window.setOverlay('sharePreview', true)">
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
