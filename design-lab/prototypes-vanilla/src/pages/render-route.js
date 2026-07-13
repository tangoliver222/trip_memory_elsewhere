import { matchRoute } from '../router.js';
import { escapeHtml } from '../components/primitives.js';
import { renderOnboarding } from './onboarding.js';
import { renderCityHome, renderWorldCities, renderWorldHome } from './world.js';

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
  return generic(route);
}
