# Elsewhere Semantic Particle Visual Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the failed starfield/poster visual pass with one anchored black-white particle world whose route-specific geometry is formed from real fragments, dates, places, relationships and state.

**Architecture:** Keep one App-level Three.js renderer and particle pool. Route-specific Scene Definitions generate stable target geometry from a DOM Anchor Registry, while GSAP owns one semantic transition timeline and resolves a visual-ready contract used by Playwright.

**Tech Stack:** Vanilla JavaScript, Three.js 0.180, GSAP 3.13, Vite 7, Node test runner, Playwright.

## Global Constraints

- Frozen baseline `codex/elsewhere-full-visual-rebuild@b634e62` remains unchanged and is classified `visual-pass-failed`.
- Palette is near-black, white, silver and cool gray; no global gold system color.
- Missing originals are never fabricated; reduce nodes or use an explicitly unresolved particle shell.
- Exactly one `#memory-canvas`, renderer, particle pool and Else Orb exist.
- C-level tool routes use `activeCount: 0`.
- Official screenshots wait for `window.__ELSEWHERE_VISUAL_READY__ === true` and an additional 150ms.
- World, City, Fragment Field, Discovery Detail and Inbox must complete pass-0/pass-1/pass-2 before remaining pages are expanded.

---

### Task 1: Stable visual-ready contract

**Files:**
- Create: `design-lab/prototypes-vanilla/src/visual/visual-ready.js`
- Create: `design-lab/prototypes-vanilla/tests/unit/visual-ready.test.js`
- Modify: `design-lab/prototypes-vanilla/src/app.js`
- Modify: `design-lab/prototypes-vanilla/src/visual/scene-manager.js`
- Modify: `design-lab/prototypes-vanilla/tests/e2e/helpers.js`
- Modify: `design-lab/prototypes-vanilla/tests/e2e/visual.spec.js`

**Interfaces:**
- Produces `createVisualReadyController({ window, document })` with `begin(routeKey)`, `waitForAssets(root)`, `settle(scenePromise, root)`, `debug()`.
- `MemorySceneManager.transitionTo()` returns a Promise that resolves after the active main timeline completes.

- [ ] Write unit tests proving begin sets both flags false, stale route tokens cannot set ready, and fonts/images/scene completion are required.
- [ ] Run `npm test -- tests/unit/visual-ready.test.js`; expect RED because the controller does not exist.
- [ ] Implement the controller and integrate it before/after every render.
- [ ] Add Playwright `waitForVisualReady(page)` and replace fixed official screenshot waits.
- [ ] Run unit tests and visual-ready e2e grep; expect GREEN.
- [ ] Commit `feat: add deterministic visual ready protocol`.

### Task 2: Scene Definitions, anchor registry and variable active particles

**Files:**
- Create: `design-lab/prototypes-vanilla/src/visual/scene-definitions.js`
- Create: `design-lab/prototypes-vanilla/src/visual/anchor-registry.js`
- Create: `design-lab/prototypes-vanilla/tests/unit/anchor-registry.test.js`
- Create: `design-lab/prototypes-vanilla/tests/unit/scene-definitions.test.js`
- Modify: `design-lab/prototypes-vanilla/src/visual/particle-targets.js`
- Modify: `design-lab/prototypes-vanilla/src/visual/particle-system.js`
- Modify: `design-lab/prototypes-vanilla/src/visual/shaders.js`
- Modify: `design-lab/prototypes-vanilla/src/visual/scene-manager.js`
- Modify: `design-lab/prototypes-vanilla/tests/unit/visual.test.js`

**Interfaces:**
- `getSceneDefinition(mode, payload)` returns `{ generator, activeCount, anchorSelectors, camera, palette, interaction, duration, reducedMotion }`.
- `AnchorRegistry.measure(root, camera, viewport)` returns a keyed Map of `{ id, kind, rect, ndc, world }`.
- Each target generator returns `{ positions: Float32Array, visibility: Float32Array, groups: Float32Array }`.

- [ ] Write failing tests for distinct definitions, tool activeCount zero, stable targets, globe land/ocean density, anchor projection and three depth bands.
- [ ] Run targeted unit tests; expect RED for missing modules and old Float32Array-only API.
- [ ] Implement definitions, registry, attributes and scene transition orchestration.
- [ ] Refactor all old mode aliases through the new definitions without adding a second renderer.
- [ ] Run all unit tests and performance resource grep; expect GREEN with one renderer/pool.
- [ ] Commit `feat: anchor semantic particle scenes to page objects`.

### Task 3: Black-white visual grammar and semantic markup

**Files:**
- Modify: `design-lab/prototypes-vanilla/src/styles/tokens.css`
- Modify: `design-lab/prototypes-vanilla/src/styles/base.css`
- Modify: `design-lab/prototypes-vanilla/src/styles/shell.css`
- Modify: `design-lab/prototypes-vanilla/src/styles/components.css`
- Modify: `design-lab/prototypes-vanilla/src/styles/pages.css`
- Modify: `design-lab/prototypes-vanilla/src/styles/motion.css`
- Modify: page renderers under `design-lab/prototypes-vanilla/src/pages/`
- Modify: overlays under `design-lab/prototypes-vanilla/src/overlays/`
- Test: `design-lab/prototypes-vanilla/tests/unit/pages.test.js`

**Interfaces:**
- Every spatial object emits `data-particle-anchor` plus its canonical entity attribute.
- `data-intensity="tool"` turns the canvas visually and computationally off.

- [ ] Add failing structural tests for required anchors, forbidden gold tokens, forbidden persistent blur and zero-particle tool definitions.
- [ ] Run unit tests; expect RED on old gold variables and missing anchors.
- [ ] Replace tokens and shared component grammar; remove decorative star layers and random motion.
- [ ] Add canonical anchor attributes to all fragments, dates, places, connections and entities.
- [ ] Run unit tests and forbidden-style scan; expect GREEN.
- [ ] Commit `style: reset elsewhere to silver semantic space`.

### Task 4: World Home three-pass benchmark

**Files:**
- Modify: `design-lab/prototypes-vanilla/src/pages/world.js`
- Modify: `design-lab/prototypes-vanilla/src/styles/pages.css`
- Modify: `design-lab/prototypes-vanilla/src/visual/particle-targets.js`
- Create: `design-lab/prototypes-vanilla/tests/e2e/visual-reset.spec.js`
- Create: `docs/visual/reset-world.md`
- Create artifacts under `design-lab/prototypes-vanilla/artifacts/screenshots/visual-reset/pass-{0,1,2}/world.png`

**Interfaces:**
- World emits city anchors and four route actions: Bangkok, Import, Inbox, Fragment Field.
- Globe definition exposes landPointRatio and cityPulseCount through debug state.

- [ ] Capture pass-0 and list at most five largest reference gaps in `reset-world.md`.
- [ ] Add failing tests for four actions, sharp title, visual-ready, city anchors and non-uniform globe target.
- [ ] Implement pass-1 World composition and click choreography; capture and compare.
- [ ] Correct pass-1 gaps, capture pass-2 settled/reduced-motion/mid-transition and freeze.
- [ ] Run World interaction, viewport and resource tests; expect GREEN.
- [ ] Commit `feat: rebuild world as a semantic point globe`.

### Task 5: City World three-pass benchmark

**Files:**
- Modify: `design-lab/prototypes-vanilla/src/pages/world.js`
- Modify: `design-lab/prototypes-vanilla/src/styles/pages.css`
- Modify: `design-lab/prototypes-vanilla/src/visual/particle-targets.js`
- Create: `docs/visual/reset-city.md`
- Create artifacts under `design-lab/prototypes-vanilla/artifacts/screenshots/visual-reset/pass-{0,1,2}/city.png`

**Interfaces:**
- City originals emit `data-fragment-id`, `data-scene-id`, `data-place-id`, `data-particle-anchor`.
- City generator groups anchors by canonical scene/place, not DOM index or random rotation.

- [ ] Capture pass-0 and document the largest five gaps.
- [ ] Add failing tests for no repeated “照片原件”, three semantic groups and spatial exits.
- [ ] Implement and capture pass-1; verify particles terminate at measured original anchors.
- [ ] Correct pass-1 gaps, capture pass-2 and freeze.
- [ ] Run City→Capsule, City→Explore and Lens interaction tests; expect GREEN.
- [ ] Commit `feat: rebuild city world around real fragment clusters`.

### Task 6: Fragment Field three-pass benchmark

**Files:**
- Modify: `design-lab/prototypes-vanilla/src/pages/fragments.js`
- Modify: `design-lab/prototypes-vanilla/src/controllers/field-controller.js`
- Modify: `design-lab/prototypes-vanilla/src/styles/pages.css`
- Modify: `design-lab/prototypes-vanilla/src/visual/particle-targets.js`
- Create: `docs/visual/reset-fragment-field.md`
- Create artifacts under `design-lab/prototypes-vanilla/artifacts/screenshots/visual-reset/pass-{0,1,2}/fragment-field.png`

**Interfaces:**
- Field exposes three city group anchors and only renders media DOM for real assets.
- Search calls `sceneManager.remeasureAndTransition({ query, focusedIds })`.

- [ ] Capture pass-0 and document card-wall/PENDING/depth gaps.
- [ ] Add failing tests for three depth groups, zero empty placeholders, search reflow and Lens snapshot restore.
- [ ] Implement pass-1 multi-city space and search choreography; capture default/search/Lens states.
- [ ] Correct pass-1 gaps, capture pass-2 and freeze.
- [ ] Run drag/zoom/search/Lens/Original Viewer/return tests; expect GREEN.
- [ ] Commit `feat: rebuild fragment field as a multi-depth database`.

### Task 7: Discovery Detail three-pass benchmark

**Files:**
- Modify: `design-lab/prototypes-vanilla/src/pages/discover.js`
- Modify: `design-lab/prototypes-vanilla/src/styles/pages.css`
- Modify: `design-lab/prototypes-vanilla/src/visual/flow-controller.js`
- Modify: `design-lab/prototypes-vanilla/src/visual/particle-targets.js`
- Create: `docs/visual/reset-discovery.md`
- Create artifacts under `design-lab/prototypes-vanilla/artifacts/screenshots/visual-reset/pass-{0,1,2}/discovery.png`

**Interfaces:**
- Discovery flow phases are `evidence`, `dates`, `relations`, `entity`, `title`, `actions`.
- Missing receipt originals render compact source records or particle shells, never empty media cards.

- [ ] Capture pass-0 and document title-first/blur/placeholder/cropping gaps.
- [ ] Add failing phase-order, anchor-connection, no-placeholder and safe-area tests.
- [ ] Implement pass-1 evidence growth; capture start/mid/settled.
- [ ] Correct pass-1 gaps, capture pass-2 plus reduced-motion and freeze.
- [ ] Run save/share/Lens/back and visual-ready tests; expect GREEN.
- [ ] Commit `feat: grow discoveries from anchored evidence`.

### Task 8: Inbox three-pass benchmark and benchmark gate

**Files:**
- Modify: `design-lab/prototypes-vanilla/src/pages/fragments.js`
- Modify: `design-lab/prototypes-vanilla/src/styles/pages.css`
- Create: `docs/visual/reset-inbox.md`
- Create: `docs/visual/benchmark-gate.md`
- Create artifacts under `design-lab/prototypes-vanilla/artifacts/screenshots/visual-reset/pass-{0,1,2}/inbox.png`

**Interfaces:**
- Inbox initial 390px layout contains two source regions, relation gap, three evidence rows and three decisions above navigation safe area.

- [ ] Capture pass-0 and document headline/placeholder/viewport/action gaps.
- [ ] Add failing viewport bounds and three-decision interaction tests.
- [ ] Implement pass-1 compact comparison with OCR source record and anchored gap particles.
- [ ] Correct pass-1 gaps, capture pass-2 and freeze.
- [ ] Audit all five pass-2 pages against twelve matching dimensions; do not continue unless every hard rule passes.
- [ ] Commit `feat: rebuild inbox as a focused evidence decision`.

### Task 9: Expand semantic geometry to every remaining page

**Files:**
- Modify: `design-lab/prototypes-vanilla/src/pages/explore.js`
- Modify: `design-lab/prototypes-vanilla/src/pages/discover.js`
- Modify: `design-lab/prototypes-vanilla/src/pages/onboarding.js`
- Modify: `design-lab/prototypes-vanilla/src/pages/me.js`
- Modify: `design-lab/prototypes-vanilla/src/overlays/fragment-lens.js`
- Modify: `design-lab/prototypes-vanilla/src/overlays/else-sheet.js`
- Modify: shared styles and visual modules
- Create: `docs/visual/remaining-pages-audit.md`

**Interfaces:**
- Timeline, Place, Connection, Import, Capsule, Lens, Else and Tool definitions remain distinct and expose activeCount/anchorCount.

- [ ] Add failing structural and route visual assertions for Timeline, Places, Connections, Discover Home, Capsule, Lens, Else, Onboarding, Import/Receipt and every Me/Settings page.
- [ ] Rebuild Timeline, Places and Connections around canonical anchors.
- [ ] Rebuild Discover Home, Capsule, Lens, Else and onboarding/import flows.
- [ ] Turn off Three particles on Privacy, Storage, Preferences, Export and long-form editing; quiet the rest of Me/Writing.
- [ ] Capture all routes at 390 and representative 430/768/1440/reduced-motion; fix every route below the benchmark grammar.
- [ ] Commit `feat: extend semantic memory space across all routes`.

### Task 10: Fresh verification and handoff

**Files:**
- Modify: `design-lab/prototypes-vanilla/tests/e2e/routes.spec.js`
- Modify: `design-lab/prototypes-vanilla/tests/e2e/interactions.spec.js`
- Modify: `design-lab/prototypes-vanilla/tests/e2e/performance.spec.js`
- Modify: `scripts/profile-performance.mjs`
- Create: `docs/visual/visual-reset-final-audit.md`
- Create: `docs/visual/visual-reset-handoff.md`
- Create final screenshots/videos/performance report.

**Interfaces:**
- Final report records route, definition, activeCount, anchorCount, renderer count, settled time, FPS, overflow and screenshot artifact.

- [ ] Run `npm test`; require all unit/contract tests PASS.
- [ ] Run `npm run build`; require production build PASS.
- [ ] Run full Playwright across 390/430/768/1440/reduced-motion; require zero failures.
- [ ] Run performance profile; require one renderer/canvas/pool, no stale timeline and documented mobile/desktop FPS.
- [ ] Run forbidden scans for inline JS, gold tokens, blur-ready state, starfield/pending placeholders and fake external assets.
- [ ] Manually inspect every final contact sheet and all five benchmark transition videos; record negative confirmations and truth boundaries.
- [ ] Commit `docs: finalize semantic particle visual reset`.

## Plan Self-Review

- Spec coverage: all reset prompt sections map to Tasks 1–10; five benchmark pages complete before expansion.
- Placeholder scan: no TBD/TODO/“implement later” placeholders exist.
- Interface consistency: all later tasks consume Scene Definition, Anchor Registry, visual-ready and activeCount contracts introduced in Tasks 1–2.
- Execution choice: the user explicitly required autonomous inline execution and did not authorize subagents, so use `superpowers:executing-plans` in this session without another handoff gate.
