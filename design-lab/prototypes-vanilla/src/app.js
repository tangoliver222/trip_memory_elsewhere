import { matchRoute } from './router.js';

const root = document.querySelector('#app-root');

function renderRoute() {
  const route = matchRoute(window.location.hash || '#/onboarding');
  root.innerHTML = `<main data-page-id="${route.pageId}"><p>Elsewhere 正在显影</p></main>`;
}

window.addEventListener('hashchange', renderRoute);
renderRoute();
