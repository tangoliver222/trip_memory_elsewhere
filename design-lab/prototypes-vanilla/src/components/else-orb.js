import { store } from "../store.js";

// Global input listener to support smooth keyboard evasion (键盘避让机制)
if (!window.__inputFocusBound) {
  window.__inputFocusBound = true;
  document.addEventListener("focusin", (e) => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) {
      window.__inputFocused = true;
      // Re-trigger render through store notification if loaded
      if (typeof store !== "undefined" && store.notify) {
        store.notify();
      }
    }
  });
  document.addEventListener("focusout", (e) => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) {
      window.__inputFocused = false;
      if (typeof store !== "undefined" && store.notify) {
        store.notify();
      }
    }
  });
}

export function renderElseOrb(state) {
  const currentRoute = state.currentRoute;
  const elseState = state.elseState || "idle";

  // 1. Hidden State (隐藏状态)
  const hideRoutes = [
    "#/onboarding", 
    "#/onboarding/permissions", 
    "#/onboarding/first-import", 
    "#/onboarding/processing",
    "#/me/writing-detail",
    "#/me/export"
  ];
  
  const isDetailEditor = currentRoute.startsWith("#/me/writing/") && currentRoute !== "#/me/writing";
  const shouldHide = hideRoutes.some(r => currentRoute === r) || 
                     state.overlays.originalViewer || 
                     isDetailEditor;
  
  if (shouldHide) return "";

  // 2. Compute dynamic positioning classes reflecting context (位置状态系统)
  const isWorldHome = currentRoute === "#/world";
  const hasOverlayOpen = state.overlays.fragmentLens || 
                         state.overlays.elseSheet || 
                         state.overlays.editMetadata || 
                         state.overlays.filters;

  let positionClass = "left-1/2 -translate-x-1/2 bottom-[14px]";
  let shapeClass = "w-11 h-11 border border-stone-850 bg-stone-950 shadow-lg";

  // Determine State Coordinate Transition
  if (window.__inputFocused) {
    // 5. Keyboard Evasion (键盘避让 - Shift high up out of field blockages)
    positionClass = "right-6 bottom-[480px] translate-x-0";
    shapeClass = "w-9 h-9 border border-amber-500/30 bg-stone-950/90 shadow-2xl scale-95";
  } else if (state.overlays.elseSheet) {
    // 4a. Else Sheet Evasion (避让 Else 抽屉 - Floating right above the active sheet)
    positionClass = "right-6 bottom-[410px] translate-x-0";
    shapeClass = "w-10 h-10 border border-amber-500/50 bg-stone-900 shadow-[0_0_15px_rgba(245,158,11,0.25)]";
  } else if (state.overlays.fragmentLens) {
    // 4b. Fragment Lens Evasion (避让 Lens 抽屉 - Floating high)
    positionClass = "right-6 bottom-[530px] translate-x-0";
    shapeClass = "w-10 h-10 border border-stone-800 bg-stone-950/95 shadow-2xl";
  } else if (hasOverlayOpen) {
    // 4c. Other Overlays
    positionClass = "right-6 bottom-[260px] translate-x-0";
    shapeClass = "w-10 h-10 border border-stone-800 bg-stone-950/90 shadow-2xl";
  } else if (!isWorldHome) {
    // 3. Second-level Page Edge (二级页面边缘 - Docked to right side)
    positionClass = "right-6 bottom-[104px] translate-x-0";
    shapeClass = "w-10 h-10 border border-stone-850 bg-stone-950/90 shadow-xl";
  } else {
    // 2. Home Center (一级页面中央 - World Home primary focus anchor)
    positionClass = "left-1/2 -translate-x-1/2 bottom-[14px]";
    shapeClass = "w-11 h-11 border border-stone-850 bg-stone-950 shadow-md";
  }

  // Dynamic coloring & outer ping animation indicators representing active computing
  let glowClasses = "text-stone-400 hover:text-white border-stone-850 hover:border-stone-700";
  if (elseState === "quick-sheet" || state.overlays.elseSheet) {
    glowClasses = "border-amber-500/50 text-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)] bg-stone-900";
  }

  return `
    <div class="fixed ${positionClass} z-50 transition-all duration-500 ease-out flex items-center justify-center">
      <button id="else-orb-trigger" 
              class="${shapeClass} ${glowClasses} rounded-full flex items-center justify-center focus:outline-none hover:scale-105 active:scale-95 group relative transition-all" 
              onclick="window.triggerElseOrb()"
              title="询问 Elsewhere 智能机">
              
        <!-- Ambient outer rings during computational active state -->
        <span class="absolute inset-0 rounded-full bg-gradient-to-tr from-stone-900 to-stone-850 opacity-20"></span>
        ${state.overlays.elseSheet || elseState !== 'idle' ? `
          <span class="absolute inset-[-4px] rounded-full border border-amber-500/10 animate-ping"></span>
        ` : ''}
        
        <!-- Rotating physical gyroscope vector paths -->
        <div class="relative w-full h-full flex items-center justify-center">
          <svg class="w-5 h-5 ${state.overlays.elseSheet || elseState !== 'idle' ? 'animate-spin' : ''}" style="animation-duration: 10s;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="9" stroke-dasharray="3,3" class="opacity-30" />
            <circle cx="12" cy="12" r="5" class="${state.overlays.elseSheet ? 'stroke-amber-500/60' : 'stroke-current'}" />
            <circle cx="12" cy="12" r="1.5" class="fill-current ${state.overlays.elseSheet || elseState !== 'idle' ? 'text-amber-500' : 'text-stone-400'}" />
          </svg>
        </div>
      </button>
    </div>
  `;
}

window.triggerElseOrb = () => {
  const state = store.state;
  if (state.overlays.elseSheet) {
    store.closeAllOverlays();
  } else {
    store.triggerElse("quick-sheet");
  }
};
