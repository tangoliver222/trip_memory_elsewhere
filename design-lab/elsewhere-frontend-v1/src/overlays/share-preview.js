import { store } from "../store.js";
import { renderBottomSheet } from "../components/bottom-sheet.js";

export function renderSharePreviewOverlay(state) {
  const isOpen = state.overlays.sharePreview;
  if (!isOpen) return "";

  const contentHtml = `
    <div class="space-y-6 text-stone-200">
      <!-- Title -->
      <div class="flex justify-between items-center">
        <h2 class="text-lg font-display font-medium text-white">分享旅行胶囊</h2>
        <button class="p-1.5 rounded-full bg-stone-900 border border-stone-850 text-stone-400 hover:text-white" onclick="window.closeBottomSheet('sharePreview')">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Simulated Share Card Preview -->
      <div class="p-6 bg-gradient-to-b from-stone-900 to-stone-950 rounded-2xl border border-stone-850 text-center space-y-4">
        <span class="text-[9px] font-mono tracking-widest text-stone-500 uppercase">ELSEWHERE EXPORT</span>
        <h3 class="text-xl font-serif italic text-stone-100">曼谷的侧影 · 2024 秋</h3>
        <p class="text-xs text-stone-400 max-w-[240px] mx-auto leading-relaxed">
          "离开 Bangkok 以后，我最常想起的是河上的风。"
        </p>
        <div class="w-full aspect-video bg-stone-800 rounded-lg overflow-hidden border border-stone-700/50 flex items-center justify-center relative">
          <span class="text-[10px] font-mono text-stone-500">照片与小票时空编织预览</span>
        </div>
        <div class="flex justify-center text-[10px] text-stone-500 font-mono gap-4">
          <span>28 证据</span>
          <span>·</span>
          <span>1 私人日记</span>
        </div>
      </div>

      <!-- Action items -->
      <div class="space-y-2">
        <button class="w-full py-3 bg-stone-200 text-stone-950 font-sans font-medium text-xs rounded-xl hover:bg-white transition-all shadow-md" onclick="window.closeBottomSheet('sharePreview')">
          生成海报并保存到本地
        </button>
        <button class="w-full py-3 bg-stone-900 border border-stone-850 text-stone-400 font-mono text-xs rounded-xl hover:bg-stone-850 transition-all" onclick="window.closeBottomSheet('sharePreview')">
          复制加密分享链接 (100% 隐私)
        </button>
      </div>
    </div>
  `;

  return renderBottomSheet(state, contentHtml, "sharePreview", isOpen);
}
