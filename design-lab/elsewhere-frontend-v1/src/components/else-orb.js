import { store } from "../store.js";

export function renderElseOrb(state) {
  const elseState = state.elseState || "idle";
  
  const currentRoute = state.currentRoute;
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

  return `
    <div class="else-orb-container fade-in">
      <div id="else-orb-trigger" class="else-orb ${elseState}" onclick="window.triggerElseOrb()">
        <!-- Fallback representation if local asset else-idle.png is missing -->
        <div class="absolute inset-0 rounded-full bg-gradient-to-tr from-stone-900 to-stone-800 opacity-20"></div>
        <svg class="w-5 h-5 text-stone-200" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="4" class="animate-pulse" />
        </svg>
      </div>
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
