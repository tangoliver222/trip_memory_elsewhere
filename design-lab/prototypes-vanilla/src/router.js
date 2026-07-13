import { NOT_FOUND_CONTRACT, ROUTES } from './page-manifest.js';

const escapeSegment = (segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function compileRoute(pattern, pageId, routeContract = {}) {
  const paramNames = [];
  const regexPath = pattern
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        paramNames.push(segment.slice(1));
        return '([^/]+)';
      }
      return escapeSegment(segment);
    })
    .join('\\/');

  return Object.freeze({
    pattern,
    pageId,
    contract: routeContract,
    paramNames,
    regex: new RegExp(`^${regexPath}$`),
  });
}

const compiledRoutes = ROUTES.map((route) => compileRoute(route.path, route.pageId, route));

const decode = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export function matchRoute(hash = '#/world') {
  const source = typeof hash === 'string' && hash.length ? hash : '#/world';
  const questionIndex = source.indexOf('?');
  const path = questionIndex >= 0 ? source.slice(0, questionIndex) : source;
  const queryString = questionIndex >= 0 ? source.slice(questionIndex + 1) : '';
  const query = Object.fromEntries(new URLSearchParams(queryString).entries());

  for (const route of compiledRoutes) {
    const match = route.regex.exec(path);
    if (!match) continue;

    const params = Object.fromEntries(
      route.paramNames.map((name, index) => [name, decode(match[index + 1])]),
    );

    return {
      pageId: route.pageId,
      path,
      params,
      query,
      contract: route.contract,
    };
  }

  return {
    pageId: NOT_FOUND_CONTRACT.pageId,
    path,
    params: {},
    query,
    contract: NOT_FOUND_CONTRACT,
  };
}

export function navigate(hash, { replace = false } = {}) {
  if (typeof window === 'undefined') return hash;
  if (replace) window.location.replace(hash);
  else window.location.hash = hash;
  return hash;
}

export function safeBack(fallback = '#/world') {
  if (typeof window === 'undefined') return fallback;
  const canGoBackInApp = window.history.length > 1 && window.sessionStorage.getItem('elsewhere:navigated') === 'true';
  if (canGoBackInApp) window.history.back();
  else navigate(fallback);
  return canGoBackInApp ? 'back' : fallback;
}

export const router = Object.freeze({ matchRoute, navigate, safeBack });
