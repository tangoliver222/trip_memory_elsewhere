import { matchRoute } from '../router.js';
import { escapeHtml } from '../components/primitives.js';
import { renderOnboarding } from './onboarding.js';
import { renderCityHome, renderWorldCities, renderWorldHome } from './world.js';
import { renderFragmentField, renderImportPage, renderInboxPage, renderReceiptPage } from './fragments.js';
import { renderCapsule, renderConnectionDetail, renderExplore, renderPlaceDetail, renderSceneDetail } from './explore.js';
import { renderDiscoverHome, renderDiscoveryDetail } from './discover.js';
import { renderExportPage, renderMeHome, renderPreferences, renderPrivacy, renderStorage, renderWritingDetail, renderWritingList } from './me.js';

const generic = (route) => ({
  sceneMode: route.contract.sceneMode,
  scenePayload: { target: route.contract.sceneMode },
  afterRender: null,
  html: `<main class="page generic-page" data-page-id="${escapeHtml(route.pageId)}"><header><p class="eyebrow">${escapeHtml(route.contract.objectType)}</p><h1>${escapeHtml(route.contract.focus)}</h1><p>${escapeHtml(route.contract.purpose)}</p></header><button class="primary-action" type="button" data-primary-action data-action="navigate" data-route="${escapeHtml(route.contract.fallbackPath)}">${escapeHtml(route.contract.primaryAction)}</button></main>`,
});

const withVisualGrade = (view, route) => {
  if (!view?.html || view.html.includes('data-visual-grade=')) return view;
  return {
    ...view,
    html: view.html.replace('<main ', `<main data-visual-grade="${escapeHtml(route.contract.intensity)}" `),
  };
};

export function renderRoute(pathOrRoute, state = {}) {
  const route = typeof pathOrRoute === 'string' ? matchRoute(pathOrRoute) : pathOrRoute;
  let view;
  if (route.contract.space === 'onboarding') view = renderOnboarding(route.pageId, state);
  else if (route.pageId === 'world-home') view = renderWorldHome(state);
  else if (route.pageId === 'world-cities') view = renderWorldCities(state);
  else if (route.pageId === 'world-city-home') view = renderCityHome(route.params.id, state);
  else if (route.pageId === 'world-fragments') view = renderFragmentField(state);
  else if (route.pageId === 'world-import') view = renderImportPage(state);
  else if (route.pageId === 'world-receipt') view = renderReceiptPage(route.params.id, state);
  else if (route.pageId === 'world-inbox') view = renderInboxPage(state);
  else if (route.pageId === 'world-capsule') view = renderCapsule(route.params.id, state);
  else if (route.pageId === 'world-explore') view = renderExplore(route.params.id, route.query.view, state);
  else if (route.pageId === 'world-scene-detail') view = renderSceneDetail(route.params.id, state);
  else if (route.pageId === 'world-place-detail') view = renderPlaceDetail(route.params.id, state);
  else if (route.pageId === 'world-connection-detail') view = renderConnectionDetail(route.params.id, state);
  else if (route.pageId === 'discover-home') view = renderDiscoverHome(state);
  else if (route.pageId === 'discover-detail') view = renderDiscoveryDetail(route.params.id, state);
  else if (route.pageId === 'me-home') view = renderMeHome(state);
  else if (route.pageId === 'me-writing') view = renderWritingList(state);
  else if (route.pageId === 'me-writing-detail') view = renderWritingDetail(route.params.id, state);
  else if (route.pageId === 'me-privacy') view = renderPrivacy(state);
  else if (route.pageId === 'me-preferences') view = renderPreferences(state);
  else if (route.pageId === 'me-storage') view = renderStorage(state);
  else if (route.pageId === 'me-export') view = renderExportPage(state);
  else view = generic(route);
  return withVisualGrade(view, route);
}
