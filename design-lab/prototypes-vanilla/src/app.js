import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/shell.css';
import './styles/motion.css';
import './styles/components.css';
import './styles/pages.css';
import { renderAppShell, renderElseOrb } from './components/app-shell.js';
import { renderNavigation } from './components/navigation.js';
import { createActionController } from './controllers/action-controller.js';
import { renderFragmentLens } from './overlays/fragment-lens.js';
import { renderOriginalViewer } from './overlays/original-viewer.js';
import { renderSharePreview } from './overlays/share-preview.js';
import { renderElseSheet } from './overlays/else-sheet.js';
import { renderDeleteConfirmation } from './overlays/delete-confirmation.js';
import { matchRoute } from './router.js';
import { getFragmentContext } from './selectors.js';
import { createInitialState, createStore } from './store.js';
import { MemorySceneManager } from './visual/scene-manager.js';
import { renderRoute as renderPageRoute } from './pages/render-route.js';
import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
import { createDemoClient, demoClientConfigFromEnv } from './data/demo-client.js';
import {
  bootstrapLiveData,
  isLiveDataMode,
  resolveSnapshotMedia,
  runtimeState,
} from './data/runtime.js';

const root = document.querySelector('#app-root');
const initialHash = window.location.hash || '#/onboarding';
const liveDataMode = isLiveDataMode(import.meta.env);
const store = createStore(createInitialState({
  route: initialHash,
  runtime: {
    mode: liveDataMode ? 'live' : 'fixture',
    status: liveDataMode ? 'connecting' : 'ready',
  },
}));
const sceneManager = new MemorySceneManager();
let sceneKey = '';
let pageCleanup = null;
let renderedRoute = null;
let visualReadyTimer = null;
gsap.registerPlugin(Flip);

/**
 * 截图就绪态：字体与关键入场动画稳定后才允许视觉回归截图。
 * Playwright 等待 window.__ELSEWHERE_VISUAL_READY__ === true。
 */
window.__ELSEWHERE_VISUAL_READY__ = false;
function scheduleVisualReady(route, sceneMode) {
  window.__ELSEWHERE_VISUAL_READY__ = false;
  delete document.documentElement.dataset.visualReady;
  clearTimeout(visualReadyTimer);
  const reduced = sceneManager.reducedMotion;
  const firstWorld = route?.pageId === 'world-home' && !window.sessionStorage.getItem('elsewhere:world-formed');
  const wait = reduced ? 160
    : sceneMode === 'else' ? 2000
      : sceneMode === 'lens' ? 1400
        : firstWorld ? 4400
          : route?.pageId === 'discover-detail' ? 4200
            : route?.pageId === 'discover-home' ? 3400
              : route?.pageId === 'world-city-home' ? 3200
                : 1900;
  visualReadyTimer = setTimeout(async () => {
    try { await document.fonts?.ready; } catch { /* noop */ }
    window.__ELSEWHERE_VISUAL_READY__ = true;
    document.documentElement.dataset.visualReady = 'true';
  }, wait);
}

const debugApi = {};
Object.defineProperties(debugApi, {
  rendererCreations: { enumerable: true, get: () => sceneManager.debug().rendererCount },
  activeTimelines: { enumerable: true, get: () => sceneManager.debug().activeTimelines },
  trackedTimelines: { enumerable: true, get: () => sceneManager.debug().trackedTimelines },
  particleCount: { enumerable: true, get: () => sceneManager.debug().particleCount },
  profile: { enumerable: true, get: () => sceneManager.debug().profile },
  paused: { enumerable: true, get: () => sceneManager.debug().paused },
  mode: { enumerable: true, get: () => sceneManager.debug().mode },
});
debugApi.snapshot = () => sceneManager.debug();
debugApi.loseContext = () => sceneManager.loseContext();
Object.freeze(debugApi);
window.__ELSEWHERE_DEBUG__ = debugApi;

function syncElseOrbPlacement(state) {
  const orb = root.querySelector('[data-else-orb]');
  const target = state.else.open
    ? root.querySelector('[data-else-orb-slot]')
    : root.querySelector('#else-orb-host');
  if (!orb || !target || orb.parentElement === target) return;
  const snapshot = Flip.getState(orb);
  target.append(orb);
  Flip.from(snapshot, { duration: 0.58, ease: 'power3.inOut', absolute: true });
}

function updateElseOrb(state, route) {
  const host = root.querySelector('#else-orb-host');
  let orb = root.querySelector('[data-else-orb]');
  const shouldShow = !state.else.hidden && route.contract.elseScope !== 'none';
  if (!shouldShow) {
    orb?.remove();
    return;
  }
  if (!orb) {
    host.insertAdjacentHTML('beforeend', renderElseOrb(state, route));
    orb = root.querySelector('[data-else-orb]');
  }
  orb.className = `else-orb else-orb--${state.else.state || 'idle'}`;
  orb.setAttribute('aria-label', state.else.open ? '收起 Else' : '询问 Else');
  orb.setAttribute('aria-expanded', String(Boolean(state.else.open)));
}

function renderOverlays(state) {
  return state.overlays.map((overlay) => {
    if (overlay.name === 'fragmentLens') return renderFragmentLens(getFragmentContext(overlay.payload.fragmentId));
    if (overlay.name === 'originalViewer') return renderOriginalViewer(getFragmentContext(overlay.payload.fragmentId));
    if (overlay.name === 'sharePreview') return renderSharePreview(overlay.payload);
    if (overlay.name === 'deleteImpact') return renderDeleteConfirmation(overlay.payload.targetId);
    return '';
  }).join('');
}

function updateShell() {
  const state = store.getState();
  const routeChanged = renderedRoute !== state.route;
  const route = matchRoute(state.route);
  const view = renderPageRoute(route, state);
  const pageHtml = view.html;
  const overlayHtml = renderOverlays(state);
  const elseHtml = renderElseSheet(state, route.path);
  const viewport = root.querySelector('.app-viewport');
  pageCleanup?.();
  pageCleanup = null;
  sceneManager.clearPageSpace();

  if (!viewport) {
    root.innerHTML = renderAppShell({ pageHtml, route, state, overlayHtml, elseHtml });
    try {
      sceneManager.mount(root.querySelector('#memory-canvas'));
    } catch (error) {
      root.querySelector('.app-viewport')?.classList.add('is-static-visual');
      console.warn('Memory Scene unavailable; using static depth fallback.', error);
    }
  } else {
    viewport.dataset.intensity = route.contract.intensity;
    viewport.dataset.sceneMode = route.contract.sceneMode;
    viewport.dataset.shellPage = route.pageId;
    root.querySelector('#page-content-layer').innerHTML = pageHtml;
    root.querySelector('#app-navigation-host').innerHTML = renderNavigation(route);
    const orb = root.querySelector('[data-else-orb]');
    if (orb && orb.parentElement !== root.querySelector('#else-orb-host')) root.querySelector('#else-orb-host').append(orb);
    updateElseOrb(state, route);
    root.querySelector('#else-drawer-host').innerHTML = elseHtml;
    root.querySelector('#overlay-root').innerHTML = overlayHtml;
  }

  const topOverlay = state.overlays.at(-1)?.name || '';
  const desiredMode = topOverlay === 'fragmentLens' ? 'lens'
    : (state.else.open ? 'else' : view.sceneMode);
  const nextSceneKey = `${route.path}|${desiredMode}|${topOverlay}|${state.else.state}|${state.field.filters.query}`;
  const sceneChanged = sceneKey !== nextSceneKey;
  if (sceneChanged && sceneManager.debug().particlePoolId) {
    const isFirstWorld = route.pageId === 'world-home' && !window.sessionStorage.getItem('elsewhere:world-formed');
    const mode = isFirstWorld ? 'world-intro' : desiredMode;
    const transition = route.pageId === 'world-city-home' && window.sessionStorage.getItem('elsewhere:previous-page') === 'world-home'
      ? 'globeToCity'
      : undefined;
    sceneManager.setMode(mode, {
      ...route.params,
      ...view.scenePayload,
      transition,
      query: state.field.filters.query,
      fragmentId: state.selectedFragmentId,
      state: state.else.state,
      onComplete: () => window.sessionStorage.setItem('elsewhere:world-formed', 'true'),
    });
    sceneKey = nextSceneKey;
    window.sessionStorage.setItem('elsewhere:previous-page', route.pageId);
  }
  if (routeChanged) root.querySelector('#page-content-layer')?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  const routeCleanup = view.afterRender?.({
    pageRoot: root.querySelector('#page-content-layer'),
    store,
    sceneManager,
    route,
  });
  const pageLayer = root.querySelector('#page-content-layer');
  const overlayLayer = topOverlay
    ? root.querySelector('#overlay-root')
    : (state.else.open ? root.querySelector('#else-drawer-host') : null);
  const spatialRoot = overlayLayer || pageLayer;
  const spatialElements = spatialRoot?.querySelectorAll?.('[data-particle-anchor]') || [];
  let spatialCleanup = null;
  if (spatialElements.length && sceneManager.debug().particlePoolId) {
    const overlayItems = [...spatialElements].map((element) => ({
      id: element.dataset.particleId,
      role: element.dataset.particleRole,
      status: element.dataset.particleStatus,
    }));
    const firstWorld = route.pageId === 'world-home' && !window.sessionStorage.getItem('elsewhere:world-formed');
    spatialCleanup = sceneManager.bindPageSpace({
      elements: spatialElements,
      scrollRoot: spatialRoot?.querySelector?.('[data-particle-scroll-root]') || (overlayLayer || pageLayer),
      mode: firstWorld ? 'deep-scatter' : (overlayLayer ? desiredMode : (view.scenePayload.target || desiredMode)),
      payload: overlayLayer
        ? { itemCount: overlayItems.length, items: overlayItems, state: state.else.state }
        : view.scenePayload,
    });
  }
  if (typeof routeCleanup === 'function' || typeof spatialCleanup === 'function') {
    pageCleanup = () => {
      if (typeof routeCleanup === 'function') routeCleanup();
      if (typeof spatialCleanup === 'function') spatialCleanup();
    };
  }
  if (routeChanged || renderedRoute === null || sceneChanged) scheduleVisualReady(route, desiredMode);
  renderedRoute = state.route;
  syncElseOrbPlacement(state);
}

store.subscribe((_state, action) => {
  if (action?.silentRender) return;
  if ((action?.type === 'SET_FIELD_FILTERS' || action?.type === 'SET_FIELD_CAMERA') && store.getState().route.startsWith('#/world/fragments')) return;
  updateShell();
});
createActionController({ root, store });
window.addEventListener('hashchange', () => {
  const route = window.location.hash || '#/world';
  window.sessionStorage.setItem('elsewhere:navigated', 'true');
  store.dispatch({ type: 'NAVIGATE', route });
});

async function bootApplication() {
  if (!liveDataMode) {
    updateShell();
    return;
  }

  root.innerHTML = `<main class="runtime-gate" aria-live="polite">
    <span class="world-brand__mark">Elsewhere</span>
    <p>正在连接你的记忆空间</p>
  </main>`;
  try {
    const client = createDemoClient(demoClientConfigFromEnv(import.meta.env));
    const snapshot = await bootstrapLiveData({
      client,
      fetchSnapshot: async () => {
        await client.signIn();
        const snapshot = await client.getSnapshot();
        return resolveSnapshotMedia(snapshot, client);
      },
    });
    if (snapshot.fragments.length === 0) {
      window.history.replaceState(null, '', '#/world/import');
      store.dispatch({ type: 'NAVIGATE', route: '#/world/import', silentRender: true });
    }
    store.dispatch({
      type: 'SET_RUNTIME',
      value: { mode: 'live', status: 'ready', client, error: null },
      silentRender: true,
    });
    updateShell();
  } catch {
    store.dispatch({
      type: 'SET_RUNTIME',
      value: { mode: 'live', status: 'error', client: null, error: runtimeState.error },
      silentRender: true,
    });
    root.innerHTML = `<main class="runtime-gate runtime-gate--error" role="alert">
      <span class="world-brand__mark">Elsewhere</span>
      <h1>真实数据服务尚未连接</h1>
      <p>请先启动 Firebase Emulator 与本地 demo server，再刷新此页面。</p>
    </main>`;
    window.__ELSEWHERE_VISUAL_READY__ = true;
    document.documentElement.dataset.visualReady = 'true';
  }
}

void bootApplication();

const syncVisualViewport = () => document.documentElement.style.setProperty('--visual-viewport-height', `${window.visualViewport?.height || window.innerHeight}px`);
syncVisualViewport();
window.visualViewport?.addEventListener('resize', syncVisualViewport);

window.addEventListener('pagehide', () => { pageCleanup?.(); window.visualViewport?.removeEventListener('resize', syncVisualViewport); sceneManager.dispose(); }, { once: true });
