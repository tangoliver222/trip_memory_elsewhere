import { store } from "./store.js";
import { router } from "./router.js";
import { renderAppShell } from "./components/app-shell.js";
import { renderOnboardingPage } from "./pages/onboarding.js";
import { renderWorldPage } from "./pages/world.js";
import { renderDiscoverPage } from "./pages/discover.js";
import { renderMePage } from "./pages/me.js";

// Main orchestrator function that renders the entire application viewport
function renderApp(state) {
  const matched = router.matchRoute(state.currentRoute);
  let activePageHtml = "";

  // Route group selection
  if (matched.pageId.startsWith("onboarding-")) {
    activePageHtml = renderOnboardingPage(matched, state);
  } else if (matched.pageId.startsWith("world-")) {
    activePageHtml = renderWorldPage(matched, state);
  } else if (matched.pageId.startsWith("discover-")) {
    activePageHtml = renderDiscoverPage(matched, state);
  } else if (matched.pageId.startsWith("me-")) {
    activePageHtml = renderMePage(matched, state);
  } else {
    // Default fallback
    activePageHtml = `
      <div class="p-8 text-center space-y-4">
        <h2 class="text-xl font-bold">404 - Memory Lost</h2>
        <p class="text-xs text-stone-500">The segment you requested hasn't materialized.</p>
        <a href="#/world" class="px-4 py-2 bg-stone-900 rounded text-xs">Back to World Home</a>
      </div>
    `;
  }

  // Inject rendered HTML into root node
  const root = document.getElementById("app-root");
  if (root) {
    root.innerHTML = renderAppShell(state, activePageHtml);
  }
}

// Subscribe to store updates to trigger automated re-renders
store.subscribe((newState) => {
  renderApp(newState);
});

// Start routing and trigger initial render on boot
function initializeApp() {
  // If no hash set, default to intro onboarding
  if (!window.location.hash || window.location.hash === "") {
    window.location.hash = "#/onboarding";
  } else {
    store.setRoute(window.location.hash);
  }

  // Force first render
  renderApp(store.state);
}

// Initial bootstrap when window loaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp);
} else {
  initializeApp();
}
