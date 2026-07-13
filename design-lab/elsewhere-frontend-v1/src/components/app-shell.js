import { renderBottomNavigation } from "./bottom-navigation.js";
import { renderElseOrb } from "./else-orb.js";
import { renderFragmentLensOverlay } from "../overlays/fragment-lens.js";
import { renderElseSheetOverlay } from "../overlays/else-sheet.js";
import { renderSharePreviewOverlay } from "../overlays/share-preview.js";
import { renderOriginalViewerOverlay } from "../overlays/original-viewer.js";

export function renderAppShell(state, activePageHtml) {
  const currentRoute = state.currentRoute;
  
  // Decide whether to show stick-top header
  const isOnboarding = currentRoute.startsWith("#/onboarding");
  const isOriginalView = state.overlays.originalViewer;

  return `
    <div class="viewport-outer">
      <div id="app-viewport">
        
        <!-- Header -->
        ${!isOnboarding && !isOriginalView ? `
          <header class="page-header flex justify-between items-center">
            <div class="flex items-center gap-2" onclick="window.location.hash='#/world'">
              <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              <span class="text-xs font-mono font-medium tracking-widest text-stone-300 uppercase">Elsewhere</span>
            </div>
            <div class="flex items-center gap-4">
              <a href="#/world/inbox" class="p-1 rounded text-stone-400 hover:text-white relative">
                <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <span class="absolute top-0 right-0 w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
              </a>
              <a href="#/me" class="p-1 rounded text-stone-400 hover:text-white">
                <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                </svg>
              </a>
            </div>
          </header>
        ` : ''}

        <!-- Main Page Container -->
        <main class="page-shell">
          ${activePageHtml}
        </main>

        <!-- Global Else Floating Orb -->
        ${renderElseOrb(state)}

        <!-- Bottom Navigation -->
        ${renderBottomNavigation(currentRoute)}

        <!-- Overlays Layer -->
        <div id="overlay-host">
          ${renderFragmentLensOverlay(state)}
          ${renderElseSheetOverlay(state)}
          ${renderSharePreviewOverlay(state)}
          ${renderOriginalViewerOverlay(state)}
        </div>

      </div>
    </div>
  `;
}
