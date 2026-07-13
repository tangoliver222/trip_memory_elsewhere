/**
 * Elsewhere Hash Router
 * Parses route paths, path parameters, and query parameters.
 */
export class HashRouter {
  constructor() {
    this.routes = [];
  }

  // Register a route with a renderer function
  addRoute(pattern, pageId) {
    const paramNames = [];
    const regexPath = pattern
      .split("/")
      .map(segment => {
        if (segment.startsWith(":")) {
          paramNames.push(segment.slice(1));
          return "([^/]+)";
        }
        return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("\\/");
    
    this.routes.push({
      pattern,
      regex: new RegExp("^" + regexPath + "$"),
      paramNames,
      pageId
    });
  }

  // Match active hash and extract parameters and query params
  matchRoute(hash) {
    // Strip query string first
    const parts = hash.split("?");
    const path = parts[0] || "#/world";
    const queryString = parts[1] || "";

    // Parse query params
    const query = {};
    if (queryString) {
      queryString.split("&").forEach(param => {
        const [key, val] = param.split("=");
        if (key) query[decodeURIComponent(key)] = decodeURIComponent(val || "");
      });
    }

    // Match regexes
    for (const route of this.routes) {
      const match = path.match(route.regex);
      if (match) {
        const params = {};
        route.paramNames.forEach((name, idx) => {
          params[name] = match[idx + 1];
        });
        return {
          pageId: route.pageId,
          params,
          query,
          path
        };
      }
    }

    // Fallback to world home
    return {
      pageId: "world-home",
      params: {},
      query: {},
      path: "#/world"
    };
  }
}

export const router = new HashRouter();

// Register all 6.1 routing configurations
router.addRoute("#/onboarding", "onboarding-intro");
router.addRoute("#/onboarding/permissions", "onboarding-permissions");
router.addRoute("#/onboarding/first-import", "onboarding-first-import");
router.addRoute("#/onboarding/processing", "onboarding-processing");
router.addRoute("#/onboarding/first-connection", "onboarding-first-connection");

router.addRoute("#/world", "world-home");
router.addRoute("#/world/cities", "world-cities");
router.addRoute("#/world/city/:id", "world-city-home");
router.addRoute("#/world/fragments", "world-fragments");
router.addRoute("#/world/import", "world-import");
router.addRoute("#/world/inbox/receipt/:id", "world-receipt");
router.addRoute("#/world/inbox", "world-inbox");
router.addRoute("#/world/city/:id/capsule", "world-capsule");
router.addRoute("#/world/city/:id/explore", "world-explore");

router.addRoute("#/world/scene/:id", "world-scene-detail");
router.addRoute("#/world/place/:id", "world-place-detail");
router.addRoute("#/world/connection/:id", "world-connection-detail");

router.addRoute("#/discover", "discover-home");
router.addRoute("#/discover/:id", "discover-detail");

router.addRoute("#/me", "me-home");
router.addRoute("#/me/writing", "me-writing");
router.addRoute("#/me/writing/:id", "me-writing-detail");
router.addRoute("#/me/privacy", "me-privacy");
router.addRoute("#/me/preferences", "me-preferences");
router.addRoute("#/me/storage", "me-storage");
router.addRoute("#/me/export", "me-export");
