import { store } from "../store.js";
import { renderBottomSheet } from "../components/bottom-sheet.js";

function getSourceDisplay(srcId, state) {
  const frag = state.fragments.find(f => f.id === srcId);
  if (!frag) return { name: srcId, type: "file", asset: null };
  
  let name = srcId;
  if (srcId === "frag-ari-1012-photo") name = "10月12日的 Ari 咖啡照片";
  else if (srcId === "frag-ari-1016-receipt") name = "Common Grounds · 10月16日小票";
  else if (srcId === "frag-ari-1016-photo") name = "10月16日的 Ari 早晨树影";
  else if (srcId === "frag-ari-1019-visit") name = "Common Grounds · 10月19日小票";
  else if (srcId === "frag-river-1018-ticket") name = "Chao Phraya 船票 · 10月18日";
  else if (srcId === "frag-river-1018-photo") name = "10月18日的渡轮夕阳照片";
  else if (srcId === "frag-old-town-1017-photo") name = "10月17日老街红巴士照片";
  else if (srcId === "frag-old-town-1017-menu") name = "10月17日老城炒粉菜单";

  return {
    name: name,
    type: frag.type,
    asset: frag.asset
  };
}

export function renderElseSheetOverlay(state) {
  const isOpen = state.overlays.elseSheet;
  if (!isOpen) return "";

  // Set up global triggers securely on window
  window.submitElseQuery = (query) => {
    if (!query || !query.trim()) return;
    store.triggerElse("answer", query);
  };

  window.clearElseChat = () => {
    store.closeAllOverlays();
  };

  window.resetElseQuickSheet = () => {
    store.triggerElse("quick-sheet");
  };

  window.openFragmentLensFromElse = (srcId) => {
    store.closeAllOverlays();
    setTimeout(() => {
      store.selectFragment(srcId);
      store.setOverlay("fragmentLens", true);
    }, 150);
  };

  // 5 basic states of Else
  const isIdle = state.elseState === "idle";
  const isQuickSheet = state.elseState === "quick-sheet";
  const isAnswer = state.elseState === "answer";
  const isUncertain = state.elseState === "uncertain";
  const isSourceResults = state.elseState === "source";

  // Dynamic Computing Context & Title Computation (当前计算域与针对性标题)
  let scopeName = "全部旅行世界 / 历史轨迹域";
  let contextTitle = "关于全部旅行世界";
  const currentRoute = state.currentRoute;

  // Determine suggested questions depending on page context
  let suggestedQuestions = [
    "我在 Ari 区度过了几个早晨？",
    "10月18日的渡船有什么线索？",
    "我在老城区吃了什么饭？"
  ];

  if (currentRoute.includes("city/bangkok") || currentRoute.includes("bangkok")) {
    scopeName = "Bangkok 曼谷 / 城市碎片群落";
    contextTitle = "关于曼谷 Bangkok";
    suggestedQuestions = [
      "我在 Ari 区度过了几个早晨？",
      "10月18日的渡船有什么线索？",
      "我在曼谷老城区吃了什么饭？"
    ];
  } else if (currentRoute.includes("fragments")) {
    scopeName = "全部碎片群落 / 跨时空连续场";
    contextTitle = "关于全部碎片群落";
    suggestedQuestions = [
      "怎么筛选出所有的热敏账单？",
      "有没有未安放位置的漂流碎片？",
      "这里一共有多少个标定原件？"
    ];
  } else if (currentRoute.includes("discover")) {
    scopeName = "发现聚合线索 / 时空逻辑推演";
    contextTitle = "关于发现显影证据";
    suggestedQuestions = [
      "如何确认这个时空缺口？",
      "为什么这个线索会显影出来？",
      "这些发现背后有什么未安放的碎片？"
    ];
  } else if (currentRoute.includes("me")) {
    scopeName = "用户安全控制域 / 私人解释层";
    contextTitle = "关于我的与隐私设置";
    suggestedQuestions = [
      "我的数据是完全保存在本地吗？",
      "如何管理我的数据和隐私权限？",
      "怎样导出所有旅行原件数据？"
    ];
  }

  if (state.selectedFragment && state.overlays.fragmentLens) {
    scopeName = `特定碎片: ${state.selectedFragment}`;
    contextTitle = "关于选中碎片";
  }

  // Choose height style according to state
  // Idle or Quick Sheet gets ~40% height, answer-related states get ~75% height
  const heightStyle = (isIdle || isQuickSheet) ? "height: 42%; min-height: 320px;" : "height: 75%; min-height: 540px;";

  let stateHeaderHtml = `
    <div class="flex justify-between items-center pb-3 border-b border-stone-900">
      <div class="space-y-1">
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
          <h2 class="text-sm font-display font-medium text-white">${contextTitle}</h2>
        </div>
        <!-- Current Computing Range Indicator -->
        <div class="flex items-center gap-1.5 text-[9px] font-mono text-stone-500 bg-stone-950 px-2 py-0.5 rounded border border-stone-900/60 w-fit">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          <span class="text-stone-500 uppercase">当前范围:</span>
          <span class="text-stone-300 font-sans">${scopeName}</span>
        </div>
      </div>
      <button class="p-1.5 rounded-full bg-stone-950 border border-stone-900 text-stone-400 hover:text-white transition-colors" onclick="window.clearElseChat()">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  `;

  let contentHtml = "";

  if (isIdle || isQuickSheet) {
    // 1. IDLE & QUICK SHEET (快速抽屉 - ~40% 高度)
    contentHtml = `
      <div class="space-y-4">
        ${stateHeaderHtml}
        <div class="space-y-3">
          <p class="text-xs text-stone-400 leading-relaxed font-sans">
            我是 <span class="text-amber-500 font-mono font-medium">Else</span>。时空智能分析机。已安全挂载至本地。我将严格检索你导入的客观旅行痕迹证据并进行因果回溯。请问：
          </p>

          <div class="space-y-1.5 font-sans">
            <span class="text-[8px] font-mono text-stone-600 uppercase tracking-widest block mb-1">情境建议问题 (Suggested Questions)</span>
            ${suggestedQuestions.map(q => `
              <button class="w-full text-left p-2.5 bg-stone-950 hover:bg-stone-900 border border-stone-900 rounded-xl text-xs text-stone-300 transition-all flex justify-between items-center group" 
                      onclick="window.submitElseQuery('${q}')">
                <span class="truncate font-sans">${q}</span>
                <span class="text-stone-600 group-hover:text-amber-500 shrink-0 ml-2">→</span>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Chat input field inside the drawer -->
        <div class="pt-2">
          <div class="flex items-center gap-2 bg-stone-950 rounded-xl border border-stone-900 px-3 py-2 focus-within:border-amber-500/30 transition-all">
            <input type="text" id="else-chat-input" class="w-full bg-transparent border-0 outline-none text-xs text-stone-200 placeholder-stone-700 focus:ring-0 font-sans" placeholder="键入你的时空记忆疑问..." onkeydown="if(event.key==='Enter') window.submitElseQuery(this.value)">
            <button class="p-1.5 rounded-lg bg-stone-900 border border-stone-850 text-stone-400 hover:text-white transition-colors" onclick="window.submitElseQuery(document.getElementById('else-chat-input').value)">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;
  } else {
    // 2. ANSWER, UNCERTAIN, SOURCE RESULTS STATES (回答态 & 不确定态 - ~75% 高度)
    const isUncertainState = state.elseState === "uncertain";
    const statusText = isUncertainState ? "UNCERTAIN GAPS" : "SPATIOTEMPORAL DEDUCTION";
    const statusColor = isUncertainState ? "text-red-400 border-red-500/15 bg-red-500/[0.03]" : "text-amber-500 border-amber-500/15 bg-amber-500/[0.03]";

    contentHtml = `
      <div class="space-y-4 h-full flex flex-col justify-between">
        <div class="space-y-4">
          ${stateHeaderHtml}

          <!-- User Question -->
          <div class="flex justify-end">
            <div class="px-3.5 py-2 rounded-2xl bg-stone-900 border border-stone-850 text-xs text-stone-200 font-sans max-w-[85%] select-text">
              ${state.elseQuery}
            </div>
          </div>

          <!-- Else Reply -->
          <div class="space-y-3.5">
            <div class="p-4 bg-stone-950 border border-stone-900 rounded-2xl space-y-2.5">
              <div class="flex items-center justify-between">
                <span class="text-[8px] font-mono tracking-wider ${isUncertainState ? 'text-red-400' : 'text-amber-500'} uppercase">🔮 ${statusText}</span>
                <span class="text-[8px] font-mono text-stone-600">CONFIDENCE: ${isUncertainState ? '35%' : '98%'}</span>
              </div>
              <p class="text-xs text-stone-300 leading-relaxed font-sans select-text">
                ${state.elseAnswerText}
              </p>
            </div>

            <!-- Linked Evidence Nodes with rich layout and thumbnails (事实溯源 / Source Results) -->
            ${state.elseAnswerSources.length > 0 ? `
              <div class="space-y-2">
                <span class="text-[8px] font-mono text-stone-500 uppercase tracking-widest block">支撑证据链条的物理原件 (Source Results)</span>
                <div class="flex flex-col gap-1.5">
                  ${state.elseAnswerSources.map(srcId => {
                    const display = getSourceDisplay(srcId, state);
                    const thumbnailIcon = display.asset 
                      ? `<img src="${display.asset}" class="w-6 h-6 rounded object-cover border border-stone-900 shrink-0" referrerPolicy="no-referrer">`
                      : `<div class="w-6 h-6 rounded bg-stone-900 border border-stone-850 flex items-center justify-center text-[10px] text-amber-500/80 font-mono shrink-0">${display.type === 'receipt' ? '📄' : '🎟️'}</div>`;
                    
                    return `
                      <button class="w-full px-3 py-2.5 rounded-xl bg-stone-950 hover:bg-stone-900 border border-stone-900 text-xs font-sans text-stone-300 flex items-center justify-between transition-colors text-left" 
                              onclick="window.openFragmentLensFromElse('${srcId}')">
                        <div class="flex items-center gap-2.5 min-w-0">
                          ${thumbnailIcon}
                          <span class="truncate font-sans font-medium text-stone-200">${display.name}</span>
                        </div>
                        <span class="text-[10px] font-mono text-stone-600 shrink-0 flex items-center gap-1">
                          查看原件 
                          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                          </svg>
                        </span>
                      </button>
                    `;
                  }).join('')}
                </div>
              </div>
            ` : ''}

            <!-- Uncertainty Indicator Section -->
            ${isUncertainState ? `
              <div class="p-3 border border-dashed border-red-950/40 bg-red-950/5 rounded-xl space-y-1">
                <span class="text-[8px] font-mono text-red-400 uppercase tracking-widest block">⚠️ 逻辑推演不确定性说明</span>
                <p class="text-[10px] text-stone-500 font-sans leading-relaxed">
                  以上答案中包含无法直接互证的悬空事实（如丢失GPS的原始照片），缺少物理小票或时间锚点，属于未安放漂流节点。可以通过在世界首页上传补充新证据来闭合。
                </p>
              </div>
            ` : `
              <div class="p-3 border border-stone-900 bg-stone-950/20 rounded-xl space-y-1">
                <span class="text-[8px] font-mono text-stone-500 uppercase tracking-widest block">✓ 事实闭合说明</span>
                <p class="text-[10px] text-stone-500 font-sans leading-relaxed">
                  以上推论完全建立在客观 EXIF 元数据和 OCR 文本互证之上，不包含 AI 对您个人情感、情绪或人格的主观臆测。
                </p>
              </div>
            `}
          </div>
        </div>

        <div class="space-y-3 pt-3 border-t border-stone-900">
          <!-- Next Step Action Button -->
          <div class="flex gap-2">
            ${isUncertainState ? `
              <button onclick="window.location.hash='#/world/inbox'; window.clearElseChat();" class="flex-1 py-2.5 bg-stone-900 hover:bg-stone-850 border border-stone-800 rounded-xl text-xs font-sans text-stone-300 font-medium transition-all text-center">
                前往收件箱处理未决问题
              </button>
            ` : `
              <button onclick="window.location.hash='#/world/city/bangkok/explore?view=connection'; window.clearElseChat();" class="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 rounded-xl text-xs font-sans text-stone-950 font-medium transition-all text-center">
                前往世界查看这段连接
              </button>
            `}
            <button class="px-4 py-2.5 bg-stone-950 border border-stone-900 hover:border-stone-800 text-xs font-mono rounded-xl hover:bg-stone-900 text-stone-400 transition-all text-center" 
                    onclick="window.resetElseQuickSheet()">
              重新追问
            </button>
          </div>
        </div>
      </div>
    `;
  }

  return renderBottomSheet(state, contentHtml, "elseSheet", isOpen, heightStyle);
}
