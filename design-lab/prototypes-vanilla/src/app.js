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
import { matchRoute } from './router.js';
import { getFragmentContext } from './selectors.js';
import { createInitialState, createStore } from './store.js';
import { MemorySceneManager } from './visual/scene-manager.js';
import { renderRoute as renderPageRoute } from './pages/render-route.js';

const root = document.querySelector('#app-root');
const initialHash = window.location.hash || '#/onboarding';
const store = createStore(createInitialState({ route: initialHash }));
const sceneManager = new MemorySceneManager();
let sceneKey = '';

function renderOverlays(state) {
  return state.overlays.map((overlay) => {
    if (overlay.name === 'fragmentLens') return renderFragmentLens(getFragmentContext(overlay.payload.fragmentId));
    if (overlay.name === 'originalViewer') return renderOriginalViewer(getFragmentContext(overlay.payload.fragmentId));
    if (overlay.name === 'sharePreview') return renderSharePreview(overlay.payload);
    return '';
  }).join('');
}

function updateShell() {
  const state = store.getState();
  const route = matchRoute(state.route);
  const view = renderPageRoute(route, state);
  const pageHtml = view.html;
  const overlayHtml = renderOverlays(state);
  const viewport = root.querySelector('.app-viewport');

  if (!viewport) {
    root.innerHTML = renderAppShell({ pageHtml, route, state, overlayHtml });
    try {
      sceneManager.mount(root.querySelector('#memory-canvas'));
    } catch (error) {
      root.querySelector('.app-viewport')?.classList.add('is-static-visual');
      console.warn('Memory Scene unavailable; using static depth fallback.', error);
    }
  } else {
    viewport.dataset.intensity = route.contract.intensity;
    viewport.dataset.sceneMode = route.contract.sceneMode;
    root.querySelector('#page-content-layer').innerHTML = pageHtml;
    root.querySelector('#app-navigation-host').innerHTML = renderNavigation(route);
    root.querySelector('#else-orb-host').innerHTML = renderElseOrb(state, route);
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
}

store.subscribe(updateShell);
createActionController({ root, store });
window.addEventListener('hashchange', () => {
  const route = window.location.hash || '#/world';
  window.sessionStorage.setItem('elsewhere:navigated', 'true');
  store.dispatch({ type: 'NAVIGATE', route });
});

updateShell();

window.addEventListener('pagehide', () => sceneManager.dispose(), { once: true });
