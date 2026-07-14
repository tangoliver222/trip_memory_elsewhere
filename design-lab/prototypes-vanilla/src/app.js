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
import { createVisualReadyController } from './visual/visual-ready.js';
import { renderRoute as renderPageRoute } from './pages/render-route.js';
import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';

const root = document.querySelector('#app-root');
const initialHash = window.location.hash || '#/onboarding';
const store = createStore(createInitialState({ route: initialHash }));
const sceneManager = new MemorySceneManager();
const visualReady = createVisualReadyController({ window, document });
let sceneKey = '';
let lastScenePromise = Promise.resolve();
let pageCleanup = null;
let renderedRoute = null;
gsap.registerPlugin(Flip);

const debugApi = {};
Object.defineProperties(debugApi, {
  rendererCreations: { enumerable: true, get: () => sceneManager.debug().rendererCount },
  activeTimelines: { enumerable: true, get: () => sceneManager.debug().activeTimelines },
  trackedTimelines: { enumerable: true, get: () => sceneManager.debug().trackedTimelines },
  particleCount: { enumerable: true, get: () => sceneManager.debug().particleCount },
  activeParticleCount: { enumerable: true, get: () => sceneManager.debug().activeCount },
  anchorCount: { enumerable: true, get: () => sceneManager.debug().anchorCount },
  sceneDefinition: { enumerable: true, get: () => sceneManager.debug().definition },
  profile: { enumerable: true, get: () => sceneManager.debug().profile },
  paused: { enumerable: true, get: () => sceneManager.debug().paused },
  mode: { enumerable: true, get: () => sceneManager.debug().mode },
  visualReady: { enumerable: true, get: () => visualReady.debug().ready },
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
  const visualToken = visualReady.begin(`${state.route}|${state.overlays.map((overlay) => overlay.name).join(',')}|${state.else.state}`);
  const routeChanged = renderedRoute !== state.route;
  const route = matchRoute(state.route);
  const view = renderPageRoute(route, state);
  const pageHtml = view.html;
  const overlayHtml = renderOverlays(state);
  const elseHtml = renderElseSheet(state, route.path);
  const viewport = root.querySelector('.app-viewport');
  pageCleanup?.();
  pageCleanup = null;

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
  if (sceneKey !== nextSceneKey && sceneManager.debug().particlePoolId) {
    const isFirstWorld = route.pageId === 'world-home' && !window.sessionStorage.getItem('elsewhere:world-formed');
    const mode = isFirstWorld ? 'world-intro' : desiredMode;
    const transition = route.pageId === 'world-city-home' && window.sessionStorage.getItem('elsewhere:previous-page') === 'world-home'
      ? 'globeToCity'
      : undefined;
    lastScenePromise = sceneManager.transitionTo(mode, {
      root: root.querySelector('#page-content-layer'),
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
  const cleanup = view.afterRender?.({
    pageRoot: root.querySelector('#page-content-layer'),
    store,
    sceneManager,
    route,
  });
  if (typeof cleanup === 'function') pageCleanup = cleanup;
  if (routeChanged) root.querySelector('#page-content-layer')?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  renderedRoute = state.route;
  syncElseOrbPlacement(state);
  void visualReady.settle({
    token: visualToken,
    root: root.querySelector('#page-content-layer'),
    scenePromise: lastScenePromise.catch((error) => {
      console.warn('Memory Scene transition did not settle cleanly.', error);
    }),
  });
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

updateShell();

const syncVisualViewport = () => document.documentElement.style.setProperty('--visual-viewport-height', `${window.visualViewport?.height || window.innerHeight}px`);
syncVisualViewport();
window.visualViewport?.addEventListener('resize', syncVisualViewport);

window.addEventListener('pagehide', () => { pageCleanup?.(); window.visualViewport?.removeEventListener('resize', syncVisualViewport); sceneManager.dispose(); }, { once: true });
