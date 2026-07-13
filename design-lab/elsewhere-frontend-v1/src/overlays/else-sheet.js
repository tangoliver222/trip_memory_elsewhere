import { store } from "../store.js";
import { renderBottomSheet } from "../components/bottom-sheet.js";

export function renderElseSheetOverlay(state) {
  const isOpen = state.overlays.elseSheet;
  if (!isOpen) return "";

  // Set up global triggers for Else chat
  window.submitElseQuery = (query) => {
    store.triggerElse("answer", query);
  };

  window.clearElseChat = () => {
    store.closeAllOverlays();
  };

  const isIdle = state.elseState === "idle" || state.elseState === "quick-sheet";
  const isAnswer = state.elseState === "answer" || state.elseState === "uncertain";

  const contentHtml = `
    <div class="space-y-6 text-stone-200">
      <!-- Title -->
      <div class="flex justify-between items-center">
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
          <h2 class="text-lg font-display font-medium text-white">Else 跨层助理</h2>
        </div>
        <button class="p-1.5 rounded-full bg-stone-900 border border-stone-850 text-stone-400 hover:text-white" onclick="window.clearElseChat()">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Quick prompts if idle -->
      ${isIdle ? `
        <div class="space-y-4">
          <p class="text-xs text-stone-400 leading-relaxed">
            我是 Else。我只依据你的真实照片 EXIF 坐标、小票 OCR 文本、船票时间等客观证据推断事实。你可以在下方提出你的时空疑问：
          </p>

          <div class="space-y-2">
            <button class="w-full text-left p-3.5 bg-stone-900/60 hover:bg-stone-900 border border-stone-850 rounded-xl text-xs text-stone-300 font-mono transition-all" 
                    onclick="window.submitElseQuery('我在 Ari 区度过了几个早晨？')">
              "我在 Ari 区度过了几个早晨？" →
            </button>
            <button class="w-full text-left p-3.5 bg-stone-900/60 hover:bg-stone-900 border border-stone-850 rounded-xl text-xs text-stone-300 font-mono transition-all" 
                    onclick="window.submitElseQuery('10月18日的渡船有什么线索？')">
              "10月18日的渡船有什么线索？" →
            </button>
            <button class="w-full text-left p-3.5 bg-stone-900/60 hover:bg-stone-900 border border-stone-850 rounded-xl text-xs text-stone-300 font-mono transition-all" 
                    onclick="window.submitElseQuery('我在老城区吃了什么饭？')">
              "我在老城区吃了什么饭？" →
            </button>
          </div>
        </div>
      ` : ''}

      <!-- Chat Answer with reactive outcomes -->
      ${isAnswer ? `
        <div class="space-y-4">
          <!-- User Question -->
          <div class="flex justify-end">
            <div class="px-4 py-2.5 rounded-2xl bg-stone-800 text-xs text-stone-200 font-sans max-w-[85%]">
              ${state.elseQuery}
            </div>
          </div>

          <!-- Else Reply -->
          <div class="space-y-3">
            <div class="p-4 bg-stone-950 border border-stone-900 rounded-2xl space-y-3">
              <span class="text-[9px] font-mono tracking-wider text-amber-500 uppercase">时空事实溯源</span>
              <p class="text-xs text-stone-300 leading-relaxed">
                ${state.elseAnswerText}
              </p>
            </div>

            <!-- Linked Evidence Nodes -->
            ${state.elseAnswerSources.length > 0 ? `
              <div class="space-y-2">
                <span class="text-[9px] font-mono text-stone-500 uppercase tracking-widest block">关联支撑证据</span>
                <div class="flex gap-2 overflow-x-auto pb-1">
                  ${state.elseAnswerSources.map(srcId => `
                    <button class="px-3 py-2 rounded-lg bg-stone-900 hover:bg-stone-850 border border-stone-850 text-[11px] font-mono text-stone-300 whitespace-nowrap" 
                            onclick="window.openFragmentLens('${srcId}')">
                      📄 ${srcId}
                    </button>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </div>

          <button class="w-full py-2 bg-stone-900 border border-stone-850 text-xs font-mono rounded-lg hover:bg-stone-800 text-stone-400 mt-2" 
                  onclick="store.triggerElse('quick-sheet')">
            询问其他问题
          </button>
        </div>
      ` : ''}

      <!-- Chat input field placeholder -->
      <div class="pt-2">
        <div class="flex items-center gap-2 bg-stone-950 rounded-xl border border-stone-850 px-3 py-2">
          <input type="text" id="else-chat-input" class="w-full bg-transparent border-0 outline-none text-xs text-stone-200 placeholder-stone-600 focus:ring-0" placeholder="键入你的时空记忆疑问..." onkeydown="if(event.key==='Enter') window.submitElseQuery(this.value)">
          <button class="p-1.5 rounded-lg bg-stone-800 text-stone-400 hover:text-white" onclick="window.submitElseQuery(document.getElementById('else-chat-input').value)">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;

  return renderBottomSheet(state, contentHtml, "elseSheet", isOpen);
}
