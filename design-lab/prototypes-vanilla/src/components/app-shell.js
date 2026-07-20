import { renderNavigation } from './navigation.js';

export function renderElseOrb(state, route) {
  if (state?.else?.hidden || route?.contract?.elseScope === 'none') return '';
  const orbState = state?.else?.state || 'idle';
  const label = state?.else?.open ? '收起 Else' : '询问 Else';
  return `<button class="else-orb else-orb--${orbState}" type="button" data-else-orb data-action="toggle-else" aria-label="${label}" aria-expanded="${Boolean(state?.else?.open)}">
    <span class="else-orb__ip" data-else-lottie data-animation-state="${orbState}" aria-hidden="true"><img src="/assets/else-idle.png" alt=""><span data-else-lottie-player></span></span>
    <span class="else-orb__dust" aria-hidden="true"></span>
  </button>`;
}

export function renderAppShell({ pageHtml = '', route, state, overlayHtml = '', elseHtml = '' }) {
  const intensity = route?.contract?.intensity || 'C';
  const scene = route?.contract?.sceneMode || 'quiet-tool';
  return `<div class="app-viewport" data-intensity="${intensity}" data-scene-mode="${scene}" data-shell-page="${route?.pageId || 'unknown'}">
    <canvas id="memory-canvas" aria-hidden="true"></canvas>
    <div class="memory-vignette" aria-hidden="true"></div>
    <div class="static-visual-fallback" data-visual-fallback hidden aria-hidden="true"><i></i><span>MEMORY SCENE · STATIC</span></div>
    <div id="page-content-layer" class="page-content-layer">${pageHtml}</div>
    <div id="app-navigation-host">${renderNavigation(route)}</div>
    <div id="else-orb-host">${renderElseOrb(state, route)}</div>
    <div id="else-drawer-host">${elseHtml}</div>
    <div id="overlay-root" class="overlay-root" aria-live="polite">${overlayHtml}</div>
  </div>`;
}
