import { escapeHtml } from './primitives.js';

const items = [
  { space: 'world', label: '世界', route: '#/world' },
  { space: 'discover', label: '发现', route: '#/discover' },
  { space: 'me', label: '我', route: '#/me' },
];

export function renderNavigation(route) {
  if (route?.contract?.space === 'onboarding') return '';
  return `<nav class="app-navigation" aria-label="主导航">
    ${items.map((item) => `<button class="nav-item${route?.contract?.space === item.space ? ' is-active' : ''}" type="button" data-action="navigate" data-route="${escapeHtml(item.route)}"><span>${item.label}</span></button>`).join('')}
  </nav>`;
}
