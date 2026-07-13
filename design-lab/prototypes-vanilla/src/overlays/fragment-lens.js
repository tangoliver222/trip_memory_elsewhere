import { store } from "../store.js";
import { renderBottomSheet } from "../components/bottom-sheet.js";

function getFragmentInfo(frag) {
  const info = {
    cityId: "bangkok",
    cityName: "曼谷 Bangkok",
    journeyName: "2024 秋季 · 曼谷记忆合流",
    sceneName: "咖啡街角微景",
    placeName: frag.placeCandidate || "Common Grounds · Ari",
    humanName: "时空探索原件",
    connectionsCount: 3,
    userText: "在异乡的日常里，一些细微的瞬间被光影和温热的票据封存。",
    history: "2024-10-12 导入本原件 · 2024-10-12 自动对齐空间拓扑",
    source: "Apple Camera EXIF · 本地安全沙盒提取"
  };

  if (frag.id.includes("chiang-mai")) {
    info.cityId = "chiang-mai";
    info.cityName = "清迈 Chiang Mai";
    info.journeyName = "2024 夏季 · 清迈雨季停留";
    info.sceneName = "尼曼路古城探索";
    info.connectionsCount = 2;
    info.history = "2024-08-12 导入本原件 · 2024-08-12 自动对准 Graph Cafe";
    info.source = frag.type === "photo" ? "Camera RAW EXIF · 物理光影捕获" : "OCR 消费单据提取 · 本地记账归入";
  } else if (frag.id.includes("tokyo")) {
    info.cityId = "tokyo";
    info.cityName = "东京 Tokyo";
    info.journeyName = "2023 冬季 · 新宿与下北泽";
    info.sceneName = "新宿微醺之夜";
    info.connectionsCount = 4;
    info.history = "2023-12-05 导入本原件 · 2023-12-05 关联 Bar Ben Fiddich 空间";
    info.source = frag.type === "photo" ? "Camera RAW EXIF · 物理光影捕获" : "OCR 消费单据提取 · 本地记账归入";
  }

  // Handle specific fragments
  if (frag.id === "frag-ari-1012-photo") {
    info.humanName = "📸 Ari 咖啡馆树影折射 (照片)";
    info.sceneName = "Ari Cafe · 街角微景";
    info.userText = "雨季过后的早晨，Common Grounds 的光线穿过树叶落在大理石桌面上。空气里泛着面包房刚烤好司康的香甜。";
    info.history = "2024-10-12 08:42 拍摄原件 · 2024-10-12 08:50 自动对齐曼谷群落 · 2024-10-13 确认归档";
  } else if (frag.id === "frag-ari-1016-receipt") {
    info.humanName = "📄 Common Grounds 冰拿铁账单";
    info.sceneName = "Ari Cafe · 街角微景";
    info.userText = "点了一杯冰拿铁 124 泰铢。票据上的热敏纸字迹非常清晰。等雨停的时候，看纸上的数字发呆。";
    info.history = "2024-10-16 08:47 消费生成 · 2024-10-16 09:12 本地智能OCR对齐至 Common Grounds";
    info.source = "OCR 热敏纸扫描引擎 · 100% 本地脱敏提取";
  } else if (frag.id === "frag-ari-1016-photo") {
    info.humanName = "📸 Common Grounds 门前落雨 (照片)";
    info.sceneName = "Ari Cafe · 街角微景";
    info.userText = "咖啡馆外的树影摇晃，几点落雨把石板路润得发亮。等雨停的时候，我随手拍下了这个画面。";
    info.history = "2024-10-16 08:56 拍摄原件 · 2024-10-16 09:15 自动与前10分钟小票物理合流";
  } else if (frag.id === "frag-ari-1019-visit") {
    info.humanName = "📄 Common Grounds 手冲咖啡账单";
    info.sceneName = "Ari Cafe · 街角微景";
    info.userText = "第三次来到这家咖啡馆。手冲咖啡微酸，带着柑橘的香气。和老板打了个招呼，他似乎认得我了。";
    info.history = "2024-10-19 09:03 消费生成 · 2024-10-19 09:30 自动与历史到访轨迹发生合并";
    info.source = "OCR 热敏纸扫描引擎 · 100% 本地脱敏提取";
  } else if (frag.id === "frag-river-1018-ticket") {
    info.humanName = "🎟️ 昭披耶河通勤渡轮票根";
    info.sceneName = "Riverside · 渡口合流";
    info.userText = "渡轮票只要 5 泰铢。小小的红色纸片，被风吹得有些发皱。它记录了落日之前我的航行。";
    info.history = "2024-10-18 17:42 购票打卡 · 2024-10-18 17:50 对齐至 Chao Phraya River 渡口";
    info.source = "物理票据扫描仪 · 掌上微景对齐";
  } else if (frag.id === "frag-river-1018-photo") {
    info.humanName = "📸 昭披耶河金色落日 (照片)";
    info.sceneName = "Riverside · 渡口合流";
    info.userText = "傍晚的昭披耶河金光闪闪。渡轮发动机在轰鸣，风里全都是水汽的味道。这是我最常想起的风景。";
    info.history = "2024-10-18 17:59 拍摄原件 · 2024-10-18 18:12 自动对位到前17分钟购买的船票";
  } else if (frag.id === "frag-old-town-1017-photo") {
    info.humanName = "📸 老城区红色通勤巴士 (照片)";
    info.sceneName = "Old Town · 城市微景";
    info.userText = "路过的红蓝色巴士上，满载着放学的中学生。他们在大声笑着。没有 GPS 坐标，但我记得那个炎热的下午。";
    info.history = "2024-10-17 15:31 拍摄原件 · 因 EXIF 缺失 GPS，当前处于散落粒子状态";
  } else if (frag.id === "frag-old-town-1017-menu") {
    info.humanName = "📄 泰式炒粉与芒果糯米饭菜单";
    info.sceneName = "Old Town · 城市微景";
    info.userText = "菜单上印着Pad Thai的字样，价格很实惠。隔壁桌飘来冬阴功汤的味道，酸辣温热。";
    info.history = "2024-10-17 16:08 拍摄截图 · 处于散落状态，正等待关联至老城区餐馆";
    info.source = "相册屏幕截图 OCR 自动分析";
  }

  return info;
}

export function renderFragmentLensOverlay(state) {
  const isOpen = state.overlays.fragmentLens;
  const fragId = state.selectedFragment;
  if (!isOpen || !fragId) return "";

  const frag = state.fragments.find(f => f.id === fragId);
  if (!frag) return "";

  const info = getFragmentInfo(frag);
  const isConfirmed = frag.status === "confirmed";

  // Thumbnail rendering logic
  let thumbnailHtml = "";
  if (frag.asset) {
    thumbnailHtml = `
      <img src="${frag.asset}" 
           class="w-20 h-20 rounded-xl object-cover border border-stone-850 hover:opacity-90 transition-opacity cursor-pointer shadow-md" 
           onclick="window.viewOriginalFile()" 
           referrerPolicy="no-referrer">
    `;
  } else {
    // Elegant CSS placeholder for tickets/receipts
    const isReceipt = frag.type === "receipt";
    const bgGrad = isReceipt ? "from-stone-900 to-stone-950" : "from-stone-900 to-amber-950/20";
    thumbnailHtml = `
      <div onclick="window.viewOriginalFile()" 
           class="w-20 h-20 rounded-xl bg-gradient-to-br ${bgGrad} border border-stone-850 flex flex-col justify-between p-2 font-mono cursor-pointer select-none shadow-md">
        <div class="flex justify-between items-start text-[7px] text-stone-500 uppercase">
          <span>${frag.type}</span>
          <span>FACT</span>
        </div>
        <div class="text-[8px] text-amber-500/80 font-bold tracking-tight truncate">${frag.id}</div>
        <div class="text-[6px] text-stone-600 uppercase">OCR SAFE</div>
      </div>
    `;
  }

  // Associated discovery logic
  const associatedDisc = state.discoveries.find(d => {
    const list = d.supportingFragments || d.fragmentIds || [];
    return list.includes(fragId);
  });

  const discoveryLinkHtml = associatedDisc 
    ? `
      <div class="p-3 bg-amber-500/[0.03] border border-amber-500/15 rounded-xl flex items-center justify-between text-xs">
        <div class="flex items-center gap-2">
          <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
          <span class="text-stone-400">支撑发现:</span>
          <span class="text-white font-medium font-sans">${associatedDisc.title}</span>
        </div>
        <a href="#/discover/${associatedDisc.id}" onclick="window.closeBottomSheet('fragmentLens')" class="text-[10px] font-mono text-amber-500 hover:underline">
          查看拓扑线索 →
        </a>
      </div>
    `
    : `
      <div class="p-3 bg-stone-900/40 border border-stone-900 rounded-xl text-stone-500 text-[10px] font-mono flex items-center gap-1.5">
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        散落时空粒子 · 暂无显影线索关联
      </div>
    `;

  // Define global contextual asking action
  window.askElseAboutFragment = (id) => {
    store.closeAllOverlays();
    const targetFrag = store.state.fragments.find(f => f.id === id);
    const targetInfo = getFragmentInfo(targetFrag);
    // Open Else helper with query about it
    store.triggerElse("answer", `关于 ${targetInfo.humanName} 的背景和它在 ${targetInfo.cityName} 的线索`);
  };

  const contentHtml = `
    <div class="space-y-5 text-stone-200">
      <!-- Top Title Block with Thumbnail -->
      <div class="flex gap-4 items-start pb-4 border-b border-stone-900">
        ${thumbnailHtml}
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded bg-stone-950 border border-stone-900 text-[8px] font-mono tracking-wider text-amber-500 uppercase">
              ${frag.type.toUpperCase()}
            </span>
            <span class="text-[9px] font-mono text-stone-500 uppercase">${info.cityName}</span>
          </div>
          <h2 class="text-sm font-sans font-medium text-white mt-1.5 leading-snug">${info.humanName}</h2>
          <p class="text-[10px] font-mono text-stone-500 mt-1 select-all">${frag.id}</p>
        </div>
        <button class="p-1.5 rounded-full bg-stone-950 border border-stone-900 text-stone-500 hover:text-white transition-colors" onclick="window.closeBottomSheet('fragmentLens')">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- User Thoughts Diary Section -->
      <div class="p-4 bg-amber-500/[0.01] border border-stone-900 rounded-xl space-y-1.5">
        <span class="text-[8px] font-mono text-amber-500/60 uppercase tracking-widest block">📝 旅行日常随笔</span>
        <p class="text-[11.5px] text-stone-300 font-sans leading-relaxed italic">
          "${info.userText}"
        </p>
      </div>

      <!-- Spatiotemporal Parent Identifiers (所属旅程, 场景, 地点) -->
      <div class="grid grid-cols-3 gap-3">
        <div class="p-3 bg-stone-950 rounded-xl border border-stone-900 text-left space-y-1">
          <span class="text-[8px] font-mono text-stone-500 uppercase block">所属旅程</span>
          <span class="text-[10px] text-stone-300 font-sans font-medium line-clamp-1">${info.journeyName}</span>
        </div>
        <div class="p-3 bg-stone-950 rounded-xl border border-stone-900 text-left space-y-1">
          <span class="text-[8px] font-mono text-stone-500 uppercase block">场景微景</span>
          <span class="text-[10px] text-stone-300 font-sans font-medium line-clamp-1">${info.sceneName}</span>
        </div>
        <div class="p-3 bg-stone-950 rounded-xl border border-stone-900 text-left space-y-1">
          <span class="text-[8px] font-mono text-stone-500 uppercase block">关联地点</span>
          <span class="text-[10px] text-stone-300 font-sans font-medium line-clamp-1">${info.placeName}</span>
        </div>
      </div>

      <!-- Core Identity Metadata Panel -->
      <div class="p-4 bg-stone-950 rounded-xl border border-stone-900 space-y-3 font-mono">
        <div class="flex justify-between items-center border-b border-stone-900 pb-1.5">
          <span class="text-[8px] text-stone-500 uppercase tracking-widest">EXIF / OCR FACT CORE</span>
          <span class="text-[8px] px-1.5 py-0.2 rounded ${isConfirmed ? 'bg-green-500/10 text-green-500 border border-green-500/15' : 'bg-amber-500/10 text-amber-500 border border-amber-500/15'} uppercase font-bold text-center">
            ${isConfirmed ? "已确认原件" : "未确定对齐"}
          </span>
        </div>
        
        <div class="space-y-1.5 text-[10.5px]">
          <!-- Temporal Anchor -->
          <div class="flex justify-between border-b border-stone-900/40 pb-1.5">
            <span class="text-stone-500">时空时间 (EXIF)</span>
            <span class="text-stone-300 font-sans">${frag.capturedAt ? frag.capturedAt.replace('T', ' ').substring(0, 16) : '未知时间'}</span>
          </div>

          <!-- Spatial Anchor -->
          <div class="flex justify-between border-b border-stone-900/40 pb-1.5">
            <span class="text-stone-500">定位坐标 (EXIF)</span>
            <span class="text-stone-300 select-all">${frag.id.includes("old-town") ? "未标定 GPS 坐标" : "13.7563° N, 100.5018° E"}</span>
          </div>

          <!-- Merchant Anchor if present -->
          <div class="flex justify-between border-b border-stone-900/40 pb-1.5">
            <span class="text-stone-500">实体商户 (OCR)</span>
            <span class="text-stone-300 font-sans">${frag.placeCandidate || '提取匹配中'}</span>
          </div>

          <!-- Financial Amount if present -->
          ${frag.type === 'receipt' ? `
            <div class="flex justify-between border-b border-stone-900/40 pb-1.5">
              <span class="text-stone-500">记账金额 (OCR)</span>
              <span class="text-stone-300 font-sans">${frag.id.includes('1016') ? '124.00 THB' : '150.00 THB'}</span>
            </div>
          ` : ''}

          <!-- Physical Device metadata context -->
          <div class="flex justify-between pb-0.5">
            <span class="text-stone-500">数据来源 / 分析</span>
            <span class="text-stone-400 font-sans text-[10px]">${info.source}</span>
          </div>
        </div>

        <!-- OCR Text Block -->
        ${frag.ocrText ? `
          <div class="text-[9.5px] text-stone-400 bg-stone-900/30 p-2.5 rounded-lg border border-stone-900/60 leading-relaxed whitespace-pre-line">
            <span class="text-[7.5px] text-stone-600 uppercase block mb-1">OCR EXTRACTED PLAIN TEXT</span>
            ${frag.ocrText}
          </div>
        ` : ''}

        <!-- Modification History -->
        <div class="text-[8px] text-stone-600 border-t border-stone-900 pt-2 flex items-center gap-1">
          <span class="w-1 h-1 bg-stone-700 rounded-full"></span>
          <span>历史: ${info.history}</span>
        </div>
      </div>

      <!-- Spatiotemporal Deep-links & Connections -->
      <div class="space-y-2.5">
        <span class="text-[8px] font-mono text-stone-500 uppercase tracking-widest block">时空深链与交叉关联</span>
        
        <!-- Discoveries Connection -->
        ${discoveryLinkHtml}

        <!-- Interactive Navigation Deep Links -->
        <div class="grid grid-cols-4 gap-2 pt-1 font-mono text-[9px]">
          <button onclick="window.location.hash='#/world/fragments'; window.closeBottomSheet('fragmentLens')" 
                  class="p-2.5 bg-stone-950 hover:bg-stone-900 border border-stone-900 text-stone-300 rounded-xl transition-colors text-left flex flex-col justify-between h-[56px]">
            <span class="text-stone-500">TIMELINE</span>
            <span class="text-stone-200">🕒 在时间中 →</span>
          </button>
          
          <button onclick="window.location.hash='#/world/city/${info.cityId}/explore?view=place'; window.closeBottomSheet('fragmentLens')" 
                  class="p-2.5 bg-stone-950 hover:bg-stone-900 border border-stone-900 text-stone-300 rounded-xl transition-colors text-left flex flex-col justify-between h-[56px]">
            <span class="text-stone-500">SPATIAL</span>
            <span class="text-stone-200">📍 在地点中 →</span>
          </button>

          <button onclick="window.location.hash='#/discover'; window.closeBottomSheet('fragmentLens')" 
                  class="p-2.5 bg-stone-950 hover:bg-stone-900 border border-stone-900 text-stone-300 rounded-xl transition-colors text-left flex flex-col justify-between h-[56px]">
            <span class="text-stone-500">TOPOLOGY</span>
            <span class="text-stone-200">🔗 底层连接 →</span>
          </button>

          <button onclick="window.askElseAboutFragment('${frag.id}')" 
                  class="p-2.5 bg-stone-950 hover:bg-stone-900 border border-stone-900 text-amber-500/80 rounded-xl transition-colors text-left flex flex-col justify-between h-[56px] hover:border-amber-500/20 shadow-[0_0_8px_rgba(245,158,11,0.05)]">
            <span class="text-amber-500/40">ASK ELSE</span>
            <span class="text-amber-400 font-medium">🔮 问 Else →</span>
          </button>
        </div>
      </div>

      <!-- High-res Original Viewer Control -->
      <div class="pt-1.5">
        <button class="w-full py-3 rounded-xl bg-stone-100 hover:bg-white text-stone-950 font-sans text-xs font-semibold uppercase tracking-wider transition-colors shadow-lg flex items-center justify-center gap-1.5" onclick="window.viewOriginalFile()">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          查看无损物理原件
        </button>
      </div>
    </div>
  `;

  // Helper inside window to open high-res original modal
  window.viewOriginalFile = () => {
    store.setOverlay("originalViewer", true);
  };

  return renderBottomSheet(state, contentHtml, "fragmentLens", isOpen);
}
