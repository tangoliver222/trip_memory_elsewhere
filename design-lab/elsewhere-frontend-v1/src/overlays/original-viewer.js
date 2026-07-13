import { store } from "../store.js";

export function renderOriginalViewerOverlay(state) {
  const isOpen = state.overlays.originalViewer;
  const fragId = state.selectedFragment;
  if (!isOpen || !fragId) return "";

  const frag = state.fragments.find(f => f.id === fragId) || {};
  const isPhoto = frag.type === "photo";

  // Bind close globally
  window.closeOriginalViewer = () => {
    store.setOverlay("originalViewer", false);
  };

  return `
    <div class="fixed inset-0 z-50 bg-black flex flex-col justify-between p-6 fade-in" onclick="window.closeOriginalViewer()">
      <!-- Header -->
      <div class="flex justify-between items-center w-full text-stone-400" onclick="event.stopPropagation()">
        <span class="font-mono text-xs">${frag.id} · ORIGINAL</span>
        <button class="p-2 rounded-full hover:bg-stone-900 text-stone-200" onclick="window.closeOriginalViewer()">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Main Visual Representation -->
      <div class="flex-1 flex items-center justify-center p-4" onclick="event.stopPropagation()">
        ${isPhoto && frag.asset ? `
          <img src="${frag.asset}" class="max-w-full max-h-[70vh] object-contain rounded border border-stone-900 shadow-2xl" onerror="this.src='https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=800&auto=format&fit=crop&q=60'"/>
        ` : `
          <!-- Mock narrow ticket paper / screenshot ratio based on PRD v3.0 -->
          <div class="w-[280px] min-h-[420px] bg-stone-100 text-stone-950 font-mono p-6 border border-stone-300 shadow-2xl flex flex-col justify-between" style="font-family: 'Courier New', Courier, monospace;">
            <div class="space-y-4">
              <div class="text-center border-b border-dashed border-stone-400 pb-4">
                <h3 class="text-xs font-bold font-mono tracking-widest uppercase">ELSEWHERE RECEIPT</h3>
                <span class="text-[9px] text-stone-500">${frag.date || '10-18-2024'}</span>
              </div>
              
              <div class="space-y-2 text-[10px]">
                <div class="flex justify-between">
                  <span>MERCHANT:</span>
                  <span class="font-bold">${frag.merchant || 'UNKNOWN'}</span>
                </div>
                <div class="flex justify-between">
                  <span>TRANS ID:</span>
                  <span>TXN-93820193</span>
                </div>
                <div class="flex justify-between border-t border-dashed border-stone-305 pt-2">
                  <span>${frag.evidencePreview || '1 LATTE'}</span>
                  <span>${frag.amount || '124 THB'}</span>
                </div>
              </div>
            </div>

            <div class="text-center border-t border-dashed border-stone-400 pt-4 text-[9px] text-stone-500">
              * DEMO ARCHAEOLOGICAL ORIGINAL *
            </div>
          </div>
        `}
      </div>

      <!-- Footer / Context -->
      <div class="text-center text-xs text-stone-500 font-mono py-2" onclick="event.stopPropagation()">
        点击任意空白区域或右上角关闭，返回细节镜头 (Lens)。
      </div>
    </div>
  `;
}
