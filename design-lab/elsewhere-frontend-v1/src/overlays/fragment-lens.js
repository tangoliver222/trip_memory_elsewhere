import { store } from "../store.js";
import { renderBottomSheet } from "../components/bottom-sheet.js";

export function renderFragmentLensOverlay(state) {
  const isOpen = state.overlays.fragmentLens;
  const fragId = state.selectedFragment;
  if (!isOpen || !fragId) return "";

  const frag = state.fragments.find(f => f.id === fragId);
  if (!frag) return "";

  const isPhoto = frag.type === "photo";
  const nameLabel = frag.type.toUpperCase();

  // Create overlay content
  const contentHtml = `
    <div class="space-y-6 text-stone-200">
      <!-- Title -->
      <div class="flex justify-between items-start">
        <div>
          <span class="px-2 py-0.5 rounded bg-stone-900 border border-stone-850 text-[9px] font-mono tracking-wider text-amber-500 uppercase">${nameLabel}</span>
          <h2 class="text-xl font-display font-medium text-white mt-2">${frag.id}</h2>
        </div>
        <button class="p-1.5 rounded-full bg-stone-900 border border-stone-850 text-stone-400 hover:text-white" onclick="window.closeBottomSheet('fragmentLens')">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Evidence / OCR Display -->
      <div class="archive-card p-4 bg-stone-950 space-y-3 font-mono">
        <span class="text-[9px] text-stone-500 block uppercase tracking-wider">OCR / EXIF METADATA EXTRACTED</span>
        
        <div class="space-y-1.5 text-xs">
          <div class="flex justify-between border-b border-stone-900 pb-1.5">
            <span class="text-stone-500">落点时间 (EXIF/OCR)</span>
            <span class="text-stone-300">${frag.date || '未知时间'}</span>
          </div>

          ${frag.merchant ? `
            <div class="flex justify-between border-b border-stone-900 pb-1.5">
              <span class="text-stone-500">提取商户 (OCR)</span>
              <span class="text-stone-300 font-sans">${frag.merchant}</span>
            </div>
          ` : ''}

          ${frag.amount ? `
            <div class="flex justify-between border-b border-stone-900 pb-1.5">
              <span class="text-stone-500">消费总计 (OCR)</span>
              <span class="text-stone-300 font-sans">${frag.amount}</span>
            </div>
          ` : ''}

          ${frag.location ? `
            <div class="flex justify-between border-b border-stone-900 pb-1.5">
              <span class="text-stone-500">经纬度坐标 (EXIF)</span>
              <span class="text-stone-300">${frag.location}</span>
            </div>
          ` : ''}
        </div>

        ${frag.ocrText ? `
          <div class="text-[10px] text-stone-400 bg-stone-900/60 p-3 rounded border border-stone-900 mt-2 leading-relaxed whitespace-pre-line">
            ${frag.ocrText}
          </div>
        ` : ''}
      </div>

      <!-- Original Viewer Button -->
      <div class="space-y-3">
        <button class="w-full py-3 rounded-xl bg-stone-900 border border-stone-850 hover:bg-stone-800 transition-all text-stone-300 font-sans text-xs font-medium" onclick="window.viewOriginalFile()">
          查看无损本地原件 ${isPhoto ? '(照片)' : '(票据)'}
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
