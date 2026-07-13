import './styles/layout.css';
import './styles/shell.css';
import { renderAppShell, renderElseOrb } from './components/app-shell.js';
import { renderNavigation } from './components/navigation.js';
import { escapeHtml } from './components/primitives.js';
import { createActionController } from './controllers/action-controller.js';
import { renderFragmentLens } from './overlays/fragment-lens.js';
import { renderOriginalViewer } from './overlays/original-viewer.js';
import { renderSharePreview } from './overlays/share-preview.js';
import { matchRoute } from './router.js';
import { getFragmentContext } from './selectors.js';
import { createInitialState, createStore } from './store.js';

const root = document.querySelector('#app-root');
const initialHash = window.location.hash || '#/onboarding';
const store = createStore(createInitialState({ route: initialHash }));

function renderPlaceholderPage(route) {
  const contract = route.contract;
  return `<main class="page page--placeholder" data-page-id="${escapeHtml(route.pageId)}">
    <div class="page-placeholder__content">
      <p class="eyebrow">${escapeHtml(contract.objectType)} · ${escapeHtml(contract.intensity)} 级体验</p>
      <h1>${escapeHtml(contract.focus)}</h1>
      <p>${escapeHtml(contract.purpose)}</p>
      <button class="primary-action" type="button" data-action="navigate" data-route="#/world">${escapeHtml(contract.primaryAction)}</button>
    </div>
  </main>`;
}

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
  const pageHtml = renderPlaceholderPage(route);
  const overlayHtml = renderOverlays(state);
  const viewport = root.querySelector('.app-viewport');

  if (!viewport) {
    root.innerHTML = renderAppShell({ pageHtml, route, state, overlayHtml });
    return;
  }

  viewport.dataset.intensity = route.contract.intensity;
  viewport.dataset.sceneMode = route.contract.sceneMode;
  root.querySelector('#page-content-layer').innerHTML = pageHtml;
  root.querySelector('#app-navigation-host').innerHTML = renderNavigation(route);
  root.querySelector('#else-orb-host').innerHTML = renderElseOrb(state, route);
  root.querySelector('#overlay-root').innerHTML = overlayHtml;
}

store.subscribe(updateShell);
createActionController({ root, store });
window.addEventListener('hashchange', () => {
  const route = window.location.hash || '#/world';
  window.sessionStorage.setItem('elsewhere:navigated', 'true');
  store.dispatch({ type: 'NAVIGATE', route });
});

updateShell();
