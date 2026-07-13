import { store } from "../store.js";

export function renderOnboardingPage(route, state) {
  const pageId = route.pageId;

  if (pageId === "onboarding-intro") {
    return `
      <div class="onboarding-screen fade-in text-stone-200">
        <div class="flex flex-col items-center mt-12 text-center">
          <span class="onboarding-badge mb-4">Elsewhere</span>
          <h1 class="text-3xl font-display font-medium tracking-tight text-white mb-6">私人旅行档案馆</h1>
          <p class="text-sm leading-relaxed text-stone-400 max-w-[280px] mb-8">
            这是一处安静、私密的空间。<br>你的照片、小票、船票、截图和时间，在这里慢慢靠近并形成连接。
          </p>
          <div class="w-full aspect-[4/3] bg-stone-900/40 rounded-xl border border-stone-800/40 p-4 relative overflow-hidden flex items-center justify-center">
            <!-- Simulated floating visualizer -->
            <div class="absolute inset-0 bg-radial from-stone-800/20 via-transparent to-transparent"></div>
            <div class="flex gap-4 items-center scale-90">
              <div class="w-16 h-24 bg-stone-800/60 rounded border border-stone-700/50 flex flex-col justify-between p-2 shadow-xl">
                <div class="w-4 h-4 rounded-full bg-stone-700"></div>
                <div class="h-1 w-full bg-stone-700"></div>
              </div>
              <svg class="w-4 h-4 text-stone-600 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
              <div class="w-20 h-16 bg-stone-800/90 rounded border border-stone-600 flex flex-col justify-between p-2 shadow-2xl relative">
                <div class="w-2 h-2 rounded bg-amber-500/80"></div>
                <div class="h-1.5 w-1/2 bg-stone-600"></div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="flex flex-col gap-4 w-full mt-8">
          <a href="#/onboarding/permissions" class="w-full py-4 rounded-xl bg-stone-200 text-stone-950 font-sans font-medium text-sm text-center hover:bg-white transition-all shadow-lg">
            开启我的旅行宇宙
          </a>
          <span class="text-xs text-stone-500 text-center">Elsewhere 不推断情绪，保留你最真实的原件。</span>
        </div>
      </div>
    `;
  }

  if (pageId === "onboarding-permissions") {
    // Bind change settings globally
    window.toggleOnboardingPerm = (key) => {
      store.updateSetting(key, !store.state.settings[key]);
    };

    return `
      <div class="onboarding-screen fade-in text-stone-200">
        <div class="mt-8">
          <span class="onboarding-badge">Step 02</span>
          <h2 class="text-2xl font-display font-medium text-white mt-2 mb-4">授予存储与读取权限</h2>
          <p class="text-sm text-stone-400 leading-relaxed mb-8">
            Elsewhere 在本地运行，所有原始照片和小票均保存在你的设备中。我们通过客观的 OCR、位置与时间差自动建立连接，决不上传到第三方。
          </p>
          
          <div class="flex flex-col gap-4">
            <div class="flex items-center justify-between p-4 bg-stone-900/60 border border-stone-800/60 rounded-xl">
              <div>
                <h4 class="text-sm font-medium text-white">本地相册及文件读取</h4>
                <p class="text-xs text-stone-500 mt-1">自动搜寻旅行期间的照片、小票及截图</p>
              </div>
              <input type="checkbox" checked class="accent-stone-200 w-5 h-5 cursor-pointer">
            </div>

            <div class="flex items-center justify-between p-4 bg-stone-900/60 border border-stone-800/60 rounded-xl">
              <div>
                <h4 class="text-sm font-medium text-white">高精度 GPS 提取</h4>
                <p class="text-xs text-stone-500 mt-1">从原件 EXIF 中提取真实的坐标，用于地点匹配</p>
              </div>
              <input type="checkbox" ${state.settings.highAccuracyGPS ? 'checked' : ''} onchange="window.toggleOnboardingPerm('highAccuracyGPS')" class="accent-stone-200 w-5 h-5 cursor-pointer">
            </div>

            <div class="flex items-center justify-between p-4 bg-stone-900/60 border border-stone-800/60 rounded-xl">
              <div>
                <h4 class="text-sm font-medium text-white">小票 OCR 内容理解</h4>
                <p class="text-xs text-stone-500 mt-1">本地提取商户、时间与金额，拒绝伪造</p>
              </div>
              <input type="checkbox" ${state.settings.sensitiveBlur ? 'checked' : ''} onchange="window.toggleOnboardingPerm('sensitiveBlur')" class="accent-stone-200 w-5 h-5 cursor-pointer">
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-3 w-full mt-8">
          <a href="#/onboarding/first-import" class="w-full py-4 rounded-xl bg-stone-200 text-stone-950 font-sans font-medium text-sm text-center hover:bg-white transition-all shadow-lg">
            同意并授权
          </a>
          <a href="#/world" class="text-xs text-stone-500 text-center hover:text-stone-300 transition-colors">
            手动整理，暂不授权
          </a>
        </div>
      </div>
    `;
  }

  if (pageId === "onboarding-first-import") {
    return `
      <div class="onboarding-screen fade-in text-stone-200">
        <div class="mt-8">
          <span class="onboarding-badge">Step 03</span>
          <h2 class="text-2xl font-display font-medium text-white mt-2 mb-2">找到一些原始碎片</h2>
          <p class="text-sm text-stone-400 mb-6">
            系统在你的相册中检测到 10 个来自 <strong>曼谷 (2024 秋)</strong> 的待整理原件。
          </p>

          <div class="grid grid-cols-3 gap-3">
            <div class="aspect-square bg-stone-800 rounded border border-stone-700 overflow-hidden relative shadow-lg">
              <div class="absolute top-1 left-1 w-2 h-2 rounded bg-amber-400"></div>
              <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
              <span class="absolute bottom-1 right-1 font-mono text-[8px] text-stone-400">照片</span>
            </div>
            <div class="aspect-square bg-stone-200 rounded border border-stone-300 overflow-hidden relative shadow-lg">
              <div class="absolute top-1 left-1 w-2 h-2 rounded bg-green-400"></div>
              <div class="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent"></div>
              <span class="absolute bottom-1 right-1 font-mono text-[8px] text-stone-600">小票</span>
            </div>
            <div class="aspect-square bg-stone-800 rounded border border-stone-700 overflow-hidden relative shadow-lg">
              <div class="absolute top-1 left-1 w-2 h-2 rounded bg-amber-400"></div>
              <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
              <span class="absolute bottom-1 right-1 font-mono text-[8px] text-stone-400">照片</span>
            </div>
            <div class="aspect-square bg-stone-800 rounded border border-stone-700 overflow-hidden relative shadow-lg">
              <div class="absolute top-1 left-1 w-2 h-2 rounded bg-stone-500"></div>
              <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
              <span class="absolute bottom-1 right-1 font-mono text-[8px] text-stone-400">截图</span>
            </div>
            <div class="aspect-square bg-stone-100 rounded border border-stone-300 overflow-hidden relative shadow-lg">
              <div class="absolute top-1 left-1 w-2 h-2 rounded bg-green-400"></div>
              <div class="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent"></div>
              <span class="absolute bottom-1 right-1 font-mono text-[8px] text-stone-600">船票</span>
            </div>
            <div class="aspect-square bg-stone-800 rounded border border-stone-700 overflow-hidden relative shadow-lg">
              <div class="absolute top-1 left-1 w-2 h-2 rounded bg-stone-500"></div>
              <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
              <span class="absolute bottom-1 right-1 font-mono text-[8px] text-stone-400">菜单</span>
            </div>
            <div class="aspect-square col-span-3 bg-stone-900/60 rounded-xl border border-stone-800/60 flex items-center justify-center p-4 mt-2">
              <span class="text-xs text-stone-500 font-mono">共选中 10 个碎片 · 曼谷秋季旅程</span>
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-3 w-full mt-8">
          <a href="#/onboarding/processing" class="w-full py-4 rounded-xl bg-stone-200 text-stone-950 font-sans font-medium text-sm text-center hover:bg-white transition-all shadow-lg">
            开始整理这 10 个碎片
          </a>
        </div>
      </div>
    `;
  }

  if (pageId === "onboarding-processing") {
    // Automatically trigger next route after 3 seconds for simulated progress
    setTimeout(() => {
      if (window.location.hash === "#/onboarding/processing") {
        window.location.hash = "#/world/inbox/receipt/batch-bangkok-backfill";
      }
    }, 2800);

    return `
      <div class="onboarding-screen justify-center items-center fade-in text-stone-200">
        <div class="flex flex-col items-center text-center">
          <!-- Central Pulse -->
          <div class="w-24 h-24 rounded-full border border-stone-800 flex items-center justify-center relative mb-8">
            <div class="absolute inset-2 rounded-full border border-stone-700 animate-ping"></div>
            <svg class="w-8 h-8 text-amber-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          </div>
          
          <h3 class="text-lg font-display font-medium text-white mb-4 animate-pulse">正在安全导入与整理...</h3>
          
          <div class="w-64 space-y-3 text-left">
            <div class="flex items-center gap-3">
              <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              <span class="text-xs text-stone-400 font-mono">1. 读取元数据与 EXIF GPS (10/10)</span>
            </div>
            <div class="flex items-center gap-3">
              <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              <span class="text-xs text-stone-400 font-mono">2. 本地 OCR 商户与细节提取 (10/10)</span>
            </div>
            <div class="flex items-center gap-3">
              <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
              <span class="text-xs text-stone-200 font-mono">3. 聚类到访与计算时间差连接中...</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  if (pageId === "onboarding-first-connection") {
    return `
      <div class="onboarding-screen fade-in text-stone-200">
        <div class="mt-6 flex-1 flex flex-col justify-between">
          <div>
            <span class="onboarding-badge">发现一条重要连接</span>
            <h2 class="text-2xl font-display font-medium text-white mt-2 mb-4">时间与地点的默契</h2>
            <p class="text-sm text-stone-400 leading-relaxed mb-6">
              系统对比了购票小票和傍晚照片。它们的时空痕迹完美对齐：
            </p>

            <!-- Dual cards split -->
            <div class="space-y-4">
              <div class="p-4 bg-stone-900 border border-stone-800 rounded-xl relative overflow-hidden">
                <div class="absolute right-4 top-4 font-mono text-[10px] text-stone-600">小票</div>
                <div class="font-mono text-xs text-stone-400">CHAO PHRAYA RIVER CROSSING</div>
                <div class="text-[10px] text-stone-500 mt-1">10月18日 · 17:42</div>
              </div>

              <!-- Connection indicator line -->
              <div class="flex flex-col items-center">
                <div class="w-px h-8 bg-dashed border-stone-700 border-l"></div>
                <div class="px-3 py-1 rounded-full bg-stone-800 text-[10px] text-stone-400 font-mono my-1">
                  17 分钟间隔 · 码头附近
                </div>
                <div class="w-px h-8 bg-dashed border-stone-700 border-l"></div>
              </div>

              <div class="p-4 bg-stone-900 border border-stone-800 rounded-xl relative overflow-hidden">
                <div class="absolute right-4 top-4 font-mono text-[10px] text-stone-600">照片</div>
                <div class="font-mono text-xs text-stone-400">渡口傍晚的金色余晖</div>
                <div class="text-[10px] text-stone-500 mt-1">10月18日 · 17:59</div>
              </div>
            </div>

            <!-- AI objective observation -->
            <div class="p-4 bg-stone-900/40 border border-stone-800/40 rounded-xl mt-6">
              <span class="text-[10px] font-mono tracking-wider text-amber-500 uppercase">AI 客观观察</span>
              <p class="text-xs text-stone-400 leading-relaxed mt-2">
                纸质船票的时间是 17:42，你拍下波光照片的时间是 17:59，在黑夜合拢前，你曾在这里停留了 17 分钟。
              </p>
            </div>
          </div>

          <div class="flex flex-col gap-3 w-full mt-8">
            <a href="#/world/city/bangkok" class="w-full py-4 rounded-xl bg-stone-200 text-stone-950 font-sans font-medium text-sm text-center hover:bg-white transition-all shadow-lg">
              确认这段记忆，进入曼谷
            </a>
            <a href="#/world" class="text-xs text-stone-500 text-center hover:text-stone-300 transition-colors">
              不建立此关联
            </a>
          </div>
        </div>
      </div>
    `;
  }

  return `<div class="p-4">Unknown Onboarding state</div>`;
}
