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

export function renderRoute(pathOrRoute, state = {}) {
  const route = typeof pathOrRoute === 'string' ? matchRoute(pathOrRoute) : pathOrRoute;
  if (route.contract.space === 'onboarding') return renderOnboarding(route.pageId, state);
  if (route.pageId === 'world-home') return renderWorldHome(state);
  if (route.pageId === 'world-cities') return renderWorldCities(state);
  if (route.pageId === 'world-city-home') return renderCityHome(route.params.id, state);
  if (route.pageId === 'world-fragments') return renderFragmentField(state);
  if (route.pageId === 'world-import') return renderImportPage(state);
  if (route.pageId === 'world-receipt') return renderReceiptPage(route.params.id, state);
  if (route.pageId === 'world-inbox') return renderInboxPage(state);
  if (route.pageId === 'world-capsule') return renderCapsule(route.params.id, state);
  if (route.pageId === 'world-explore') return renderExplore(route.params.id, route.query.view, state);
  if (route.pageId === 'world-scene-detail') return renderSceneDetail(route.params.id, state);
  if (route.pageId === 'world-place-detail') return renderPlaceDetail(route.params.id, state);
  if (route.pageId === 'world-connection-detail') return renderConnectionDetail(route.params.id, state);
  if (route.pageId === 'discover-home') return renderDiscoverHome(state);
  if (route.pageId === 'discover-detail') return renderDiscoveryDetail(route.params.id, state);
  if (route.pageId === 'me-home') return renderMeHome(state);
  if (route.pageId === 'me-writing') return renderWritingList(state);
  if (route.pageId === 'me-writing-detail') return renderWritingDetail(route.params.id, state);
  if (route.pageId === 'me-privacy') return renderPrivacy(state);
  if (route.pageId === 'me-preferences') return renderPreferences(state);
  if (route.pageId === 'me-storage') return renderStorage(state);
  if (route.pageId === 'me-export') return renderExportPage(state);
  return generic(route);
}
