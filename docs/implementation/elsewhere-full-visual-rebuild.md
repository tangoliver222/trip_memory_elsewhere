# Elsewhere Full Visual Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild every Elsewhere route as one independent canonical vanilla application with truthful data, a single Three.js semantic particle renderer, GSAP memory-flow transitions, real interactions, complete fallbacks, and verifiable visual artifacts.

**Architecture:** `design-lab/prototypes-vanilla` owns its Vite package, normalized fixtures, hash router, immutable store, delegated controllers, page registry, overlay stack, and one persistent `MemorySceneManager`. Real media and readable content stay in DOM; Three.js supplies space and semantic particles, SVG supplies legible relations, and GSAP is accessed only through one lifecycle-managed flow controller.

**Tech Stack:** Vanilla HTML/CSS/ES modules, Vite, Three.js, GSAP with Flip/ScrollTrigger, Node built-in test runner, Playwright.

## Global Constraints

- The only production application is `design-lab/prototypes-vanilla`; the root React project remains a preview workbench.
- Runtime dependencies are exactly `three` and `gsap`; the only new testing dependency is `@playwright/test` plus Vite as the build tool.
- Do not use React, Vue, Svelte, Motion/Framer Motion, R3F, a UI kit, a state framework, Tailwind browser CDN, Google Fonts CDN, or remote Unsplash assets.
- Use one renderer and one canvas inside the 480px `AppViewport`; real originals remain accessible DOM elements.
- Every route reads canonical indexes; visible facts have a source and state; missing originals render as `requiredAsset` evidence nodes.
- Body copy is 15–16px or larger, secondary copy 13px, metadata 11–12px, and interactive targets at least 44px.
- First evidence precedes time/place, relation, objective observation, action, and user interpretation.
- All bug fixes and critical interactions follow red–green TDD; every stage ends with a fresh build/test command and a separate commit.
- Reduced motion, no-WebGL fallback, high/balanced/low profiles, 390×844 and 430×932 are mandatory.
- The first five seconds must deliver a cinematic depth-to-globe Wow moment; S/A surfaces must not be visually reduced to ambient dots, a generic point globe, fades, or 2D card walls.
- Visual intensity is locked: S = first entry, World, World→City, Fragment Field, Discovery Detail, key Capsule chapters, Else found; A = City/Explore/details/receipt; B = import/processing/inbox/Lens/writings; C = permissions/privacy/storage/delete/settings/editor.

---

## Locked File Map

```text
design-lab/prototypes-vanilla/
├─ package.json                    independent scripts and dependencies
├─ vite.config.js                  canonical Vite root/build config
├─ playwright.config.js            route matrix and artifact config
├─ index.html                      AppViewport mount only
├─ README.md                       sole production startup guide
├─ public/assets/                  local confirmed originals and references
├─ src/
│  ├─ app.js                       bootstrap, render, cleanup lifecycle
│  ├─ router.js                    manifest matcher and safe navigation
│  ├─ page-manifest.js             route/page contracts
│  ├─ store.js                     immutable UI state and actions
│  ├─ selectors.js                 indexed data queries
│  ├─ controllers/
│  │  ├─ action-controller.js      delegated click/change/submit actions
│  │  ├─ field-controller.js       pan/zoom/inertia/search/focus
│  │  └─ cleanup-registry.js       listener/observer/timeline disposal
│  ├─ fixtures/
│  │  ├─ data.js                   canonical object arrays and totals
│  │  └─ indexes.js                normalized maps and validation
│  ├─ components/
│  │  ├─ app-shell.js              canvas/content/overlay layers
│  │  ├─ navigation.js             World/Discover/Else/Me
│  │  ├─ fragments.js              media-specific evidence nodes
│  │  ├─ relations.js              SVG relation primitives
│  │  └─ primitives.js             page header, actions, evidence, notes
│  ├─ pages/
│  │  ├─ onboarding.js             five onboarding routes
│  │  ├─ world.js                  world home and city index
│  │  ├─ city.js                   city world and Capsule
│  │  ├─ fragments.js              field, import, receipt, inbox
│  │  ├─ explore.js                time/place/connection and detail routes
│  │  ├─ discover.js               discover home/detail
│  │  └─ me.js                     me, writing, privacy, preferences, storage, export
│  ├─ overlays/
│  │  ├─ fragment-lens.js          authoritative fragment view
│  │  ├─ original-viewer.js        zoomable original
│  │  ├─ else-sheet.js             quick/answer states
│  │  └─ share-preview.js          privacy-aware preview
│  ├─ styles/
│  │  ├─ tokens.css                palette/type/spacing/motion tokens
│  │  ├─ base.css                  reset, viewport, accessibility
│  │  ├─ components.css            shared primitives and media materials
│  │  ├─ pages.css                 page compositions
│  │  └─ motion.css                reduced-motion and CSS fallback
│  └─ visual/
│     ├─ memory-scene-manager.js    renderer and mode lifecycle
│     ├─ particle-system.js         Points/geometry/material
│     ├─ particle-shaders.js        GLSL simplex vertex and point fragment
│     ├─ particle-targets.js        world/city/field/discovery/Else targets
│     ├─ globe-scene.js             globe points, city projection, controls
│     ├─ gsap-flow-controller.js    named timeline registry
│     ├─ interaction-controller.js  pointer projection/parallax
│     ├─ motion-preferences.js      reduced motion/data
│     ├─ performance-profile.js     high/balanced/low
│     └─ static-fallback.js         SVG/no-WebGL scenes
├─ tests/unit/                      Node test suites
└─ tests/e2e/                       Playwright route and interaction suites
```

### Task 1: Establish the independent canonical application and route contracts

**Files:**
- Create: `design-lab/prototypes-vanilla/package.json`
- Create: `design-lab/prototypes-vanilla/vite.config.js`
- Create: `design-lab/prototypes-vanilla/README.md`
- Create: `design-lab/prototypes-vanilla/src/page-manifest.js`
- Modify: `design-lab/prototypes-vanilla/src/router.js`
- Create: `design-lab/prototypes-vanilla/tests/unit/router.test.js`
- Modify: `README.md`

**Interfaces:**
- Produces: `compileRoute(pattern)`, `matchRoute(hash)`, `navigate(hash)`, `safeBack(fallback)`, `ROUTES`.
- Route result: `{ pageId, path, params, query, contract }`.

- [x] **Step 1: Write the failing router/package tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { ROUTES } from '../../src/page-manifest.js';
import { compileRoute, matchRoute } from '../../src/router.js';

test('dynamic route captures id without generating an invalid regex', () => {
  const route = compileRoute('#/world/city/:id', 'world-city-home');
  assert.deepEqual(route.regex.exec('#/world/city/bangkok')?.slice(1), ['bangkok']);
});

test('every manifest route matches its page id', () => {
  for (const route of ROUTES.filter((item) => item.samplePath)) {
    assert.equal(matchRoute(route.samplePath).pageId, route.pageId, route.samplePath);
  }
});
```

- [x] **Step 2: Run RED**

Run: `cd design-lab/prototypes-vanilla && node --test tests/unit/router.test.js`
Expected: FAIL because `page-manifest.js` and the exported router functions do not exist.

- [x] **Step 3: Implement the exact route API and independent scripts**

```json
{
  "name": "elsewhere-vanilla",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "vite build",
    "preview": "vite preview --host 127.0.0.1",
    "test": "node --test tests/unit/*.test.js",
    "test:e2e": "playwright test"
  },
  "dependencies": { "gsap": "^3.13.0", "three": "^0.180.0" },
  "devDependencies": { "@playwright/test": "^1.55.0", "vite": "^7.0.0" }
}
```

`compileRoute` splits on `/`, escapes literal segments, converts only `:name` segments to `([^/]+)`, and stores parameter names. `matchRoute` uses `URLSearchParams` and returns a dedicated `not-found` contract instead of silently rendering world.

- [x] **Step 4: Run GREEN and build**

Run: `cd design-lab/prototypes-vanilla && npm install && npm test && npm run build`
Expected: router tests PASS and Vite build exits 0.

- [x] **Step 5: Commit**

```bash
git add README.md design-lab/prototypes-vanilla
git commit -m "chore: consolidate canonical vanilla application"
```

### Task 2: Normalize the canonical travel graph and enforce truthfulness

**Files:**
- Rewrite: `design-lab/prototypes-vanilla/src/fixtures/data.js`
- Create: `design-lab/prototypes-vanilla/src/fixtures/indexes.js`
- Create: `design-lab/prototypes-vanilla/src/selectors.js`
- Create: `design-lab/prototypes-vanilla/tests/unit/data.test.js`
- Copy: confirmed local files into `design-lab/prototypes-vanilla/public/assets/`

**Interfaces:**
- Produces: `data`, `indexes`, `validateDataGraph()`, `getFragmentContext(id)`, `getCityFragments(id)`, `getElseContext(route, state)`.
- Index names match the total prompt exactly.

- [x] **Step 1: Write failing graph-integrity tests**

```js
test('canonical totals and representative records stay distinct', () => {
  assert.equal(data.world.totalFragments, 172);
  assert.deepEqual(data.cities.map((city) => city.fragmentCount), [63, 28, 81]);
  assert.equal(data.fragments.length, 9);
});

test('every reference resolves or is an explicit entity label', () => {
  assert.deepEqual(validateDataGraph(), []);
});

test('no production asset is remote and missing originals are explicit', () => {
  for (const fragment of data.fragments) {
    assert.equal(fragment.asset?.startsWith('http') ?? false, false);
    assert.ok(fragment.asset || fragment.requiredAsset);
  }
});
```

- [x] **Step 2: Run RED**

Run: `npm test -- tests/unit/data.test.js`
Expected: FAIL on counts, remote assets, absent indexes, and invalid references.

- [x] **Step 3: Implement normalized data and selectors**

Build frozen arrays from the reference fixtures, add journey/city IDs explicitly, localize only confirmed assets, and return human-readable labels separately from internal IDs. `validateDataGraph()` returns `{ collection, id, field, missing }` records and tests require an empty list.

- [x] **Step 4: Run GREEN**

Run: `npm test`
Expected: all router/data tests PASS.

- [x] **Step 5: Commit**

```bash
git add design-lab/prototypes-vanilla/src/fixtures design-lab/prototypes-vanilla/src/selectors.js design-lab/prototypes-vanilla/public design-lab/prototypes-vanilla/tests/unit/data.test.js
git commit -m "fix: stabilize routes data and overlays"
```

### Task 3: Build the shell, store, delegated actions, and overlay restoration

**Files:**
- Create/modify: `src/app.js`, `src/store.js`, `src/controllers/action-controller.js`, `src/controllers/cleanup-registry.js`
- Create: `src/components/app-shell.js`, `src/components/navigation.js`, `src/components/primitives.js`
- Create: `src/overlays/fragment-lens.js`, `src/overlays/original-viewer.js`, `src/overlays/share-preview.js`
- Create: `tests/unit/store.test.js`, `tests/unit/overlays.test.js`

**Interfaces:**
- `createStore(initialState)` returns `{ getState, subscribe, dispatch }`.
- `dispatch({ type, ...payload })` is the only mutation path.
- Overlay snapshot: `{ route, scrollY, focusId, fieldCamera, filters, selectedFragmentId }`.

- [x] **Step 1: Write failing state/overlay tests**

```js
test('Lens close restores field camera, filters, selection and scroll', () => {
  const store = createStore(seedState);
  store.dispatch({ type: 'OPEN_LENS', fragmentId: 'frag-river-1018-photo', snapshot });
  store.dispatch({ type: 'CLOSE_OVERLAY' });
  assert.deepEqual(store.getState().field.camera, snapshot.fieldCamera);
  assert.deepEqual(store.getState().field.filters, snapshot.filters);
  assert.equal(store.getState().selectedFragmentId, snapshot.selectedFragmentId);
});

test('opening Original Viewer hides Else and returns to Lens', () => {
  const store = createStore(seedState);
  store.dispatch({ type: 'OPEN_LENS', fragmentId: 'frag-river-1018-photo', snapshot });
  store.dispatch({ type: 'OPEN_ORIGINAL' });
  assert.equal(store.getState().else.hidden, true);
  store.dispatch({ type: 'CLOSE_OVERLAY' });
  assert.equal(store.getState().overlays.at(-1).name, 'fragmentLens');
});
```

- [x] **Step 2: Run RED**

Run: `npm test -- tests/unit/store.test.js tests/unit/overlays.test.js`
Expected: FAIL because the immutable action API and stack do not exist.

- [x] **Step 3: Implement shell and actions**

Render exactly one `#memory-canvas`, `#page-content-layer`, `#overlay-root`, and `[data-else-orb]`. Register one click/change/submit listener on `#app-viewport`; map `data-action` values to controller functions; restore focus and scroll after overlay close. No inline handler is emitted.

- [x] **Step 4: Run GREEN and static scans**

Run: `npm test && ! rg 'onclick=|onchange=|window\\.store' src`
Expected: tests PASS and scan returns no production matches.

- [x] **Step 5: Commit**

```bash
git add design-lab/prototypes-vanilla/src design-lab/prototypes-vanilla/tests/unit
git commit -m "refactor: establish visual tokens and page primitives"
```

### Task 4: Implement the single Three.js particle engine and GSAP lifecycle

**Files:**
- Create all files under `src/visual/`
- Create: `tests/unit/visual.test.js`, `tests/unit/performance.test.js`
- Create/modify: `src/styles/tokens.css`, `src/styles/base.css`, `src/styles/motion.css`

**Interfaces:**
- `MemorySceneManager.mount(canvas)`, `.setMode(mode, payload)`, `.pause()`, `.resume()`, `.dispose()`.
- `createParticleSystem(profile)` returns `{ points, uniforms, setTarget, dispose }`.
- `createFlowController()` returns named timeline methods plus `killAll()`.

- [x] **Step 1: Write failing lifecycle/profile tests**

```js
test('scene manager creates one renderer and changes mode without remounting', () => {
  const manager = new MemorySceneManager({ rendererFactory });
  manager.mount(canvas);
  manager.setMode('world', {});
  manager.setMode('city', {});
  assert.equal(rendererFactory.mock.calls.length, 1);
});

test('signature transitions reuse one particle pool and expose distinct target phases', () => {
  const manager = new MemorySceneManager({ rendererFactory });
  manager.mount(canvas);
  manager.setMode('world-intro', { firstVisit: true });
  manager.setMode('city', { cityId: 'city-bangkok-2024-autumn', transition: 'globeToCity' });
  assert.equal(rendererFactory.mock.calls.length, 1);
  assert.deepEqual(manager.debug().phases, ['deep-scatter', 'globe', 'city-burst', 'city-field']);
});

test('profiles enforce particle and DPR ceilings', () => {
  assert.deepEqual(getPerformanceProfile('low'), { particleCount: 3000, maxDpr: 1, antialias: false, fps: 30 });
  assert.ok(getPerformanceProfile('balanced').particleCount <= 10000);
  assert.ok(getPerformanceProfile('high').maxDpr <= 1.5);
});
```

- [x] **Step 2: Run RED**

Run: `npm test -- tests/unit/visual.test.js tests/unit/performance.test.js`
Expected: FAIL because the visual modules are missing.

- [x] **Step 3: Implement shader, targets, profiles and lifecycle**

Create all required attributes/uniforms, embed simplex noise in the vertex shader, use soft alpha falloff in the fragment shader, generate semantic targets per mode, cap DPR, pause for `document.hidden`/offscreen, handle resize/context loss, and never allocate arrays in the render loop. Reuse one particle pool for `deep-scatter → globe → city-burst → city-field → field/discovery/else`; `gsap.context`/timeline handles are killed before route teardown.

- [x] **Step 4: Run GREEN, build, and source assertions**

Run: `npm test && npm run build && rg 'aRandom|aScale|aPhase|aAmplitude|aColorMix|aTargetIndex' src/visual/particle-system.js && rg 'uPositionRandom|uDepth|uNoiseStrength|uReducedMotion' src/visual`
Expected: tests/build PASS and both attribute/uniform scans find the required symbols.

- [x] **Step 5: Commit**

```bash
git add design-lab/prototypes-vanilla/src/visual design-lab/prototypes-vanilla/src/styles design-lab/prototypes-vanilla/tests/unit
git commit -m "feat: add three particle scene architecture"
```

### Task 5: Rebuild onboarding and the world surfaces

**Files:**
- Create/modify: `src/pages/onboarding.js`, `src/pages/world.js`, `src/pages/city.js`
- Create/modify: `src/components/fragments.js`, `src/components/relations.js`, `src/styles/pages.css`, `src/styles/components.css`
- Create: `tests/unit/pages-world.test.js`

**Interfaces:**
- Each renderer returns `{ html, sceneMode, scenePayload, afterRender }`.
- Routes: five onboarding routes, world, cities, city.

- [x] **Step 1: Write failing page contract tests**

```js
for (const path of onboardingAndWorldPaths) {
  test(`${path} renders one main action and no internal id`, () => {
    const view = renderRoute(path, testState);
    assert.equal(count(view.html, 'data-primary-action'), 1);
    assert.doesNotMatch(view.html, /frag-|rel-|scene-/);
  });
}

test('world and cities share the world scene and real coordinates', () => {
  assert.equal(renderRoute('#/world', testState).sceneMode, 'world');
  assert.equal(renderRoute('#/world/cities', testState).sceneMode, 'world');
  assert.deepEqual(indexes.citiesById['city-bangkok-2024-autumn'].coordinates, { lat: 13.7563, lng: 100.5018 });
});
```

- [x] **Step 2: Run RED**

Run: `npm test -- tests/unit/pages-world.test.js`
Expected: FAIL because the new renderer contracts are not implemented.

- [x] **Step 3: Implement the pages and globe interactions**

Build evidence-first onboarding, low-motion permission tools, selection batch, real processing stages, the 17-minute relation, and a cinematic point-cloud globe with OrbitControls. The first visit begins in extreme z-depth, returns into a clear globe in about three seconds, lights cities in sequence, and reveals the title last within five seconds. `globeToCity` rotates to Bangkok, pulses the city, locally disassembles the globe, pushes particles forward, and reforms around DOM originals without a black cut. Preserve year/list state and keep Capsule/Explore visible by the first viewport end.

- [x] **Step 4: Run GREEN and build**

Run: `npm test && npm run build`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add design-lab/prototypes-vanilla/src/pages design-lab/prototypes-vanilla/src/components design-lab/prototypes-vanilla/src/styles design-lab/prototypes-vanilla/tests/unit/pages-world.test.js
git commit -m "feat: rebuild onboarding and world surfaces"
```

### Task 6: Build Fragment Field, import, receipt, inbox, and overlay interactions

**Files:**
- Create/modify: `src/pages/fragments.js`, `src/controllers/field-controller.js`
- Modify: fragment/overlay components and styles
- Create: `tests/unit/field.test.js`, `tests/unit/intake.test.js`

**Interfaces:**
- `createFieldController({ viewport, store, sceneManager })` exposes `panBy`, `zoomAt`, `focus`, `search`, `filter`, `snapshot`, `restore`, `destroy`.
- Camera bounds: scale 0.62–2.4; inertia stops below 0.02 px/ms.

- [x] **Step 1: Write failing behavior tests**

```js
test('Common Grounds search focuses relevant nodes and preserves reset state', () => {
  const field = createTestField();
  field.search('Common Grounds');
  assert.deepEqual(field.state.focusedIds, ['frag-ari-1012-photo', 'frag-ari-1016-receipt', 'frag-ari-1016-photo', 'frag-ari-1019-visit']);
  assert.ok(field.state.layout.every((node) => !field.state.focusedIds.includes(node.id) || Math.abs(node.x) < 180));
  field.search('');
  assert.deepEqual(field.state.camera, initialCamera);
});

test('receipt counts come only from the import batch', () => {
  const html = renderRoute('#/world/inbox/receipt/batch-bangkok-backfill', testState).html;
  assert.match(html, /28 个原件/);
  assert.match(html, /4 个地点/);
  assert.doesNotMatch(html, /统计面板|Dashboard/);
});
```

- [x] **Step 2: Run RED**

Run: `npm test -- tests/unit/field.test.js tests/unit/intake.test.js`
Expected: FAIL because the controller and new pages are missing.

- [x] **Step 3: Implement real field/intake interactions**

Use z-depth LOD clusters, pointer capture, two-touch distance zoom, wheel zoom, velocity decay, semantic re-layout, debounced search, filter restoration, mixed-media import state, batch particle convergence, receipt distribution, one-question inbox decisions, processing stages, and explicit exception states. Search pulls distant relevant nodes toward center, emits relation flow, sends unrelated nodes deeper, and selection lowers spatial noise. Flip Lens transitions also move the camera back and attract nearby particles so Lens feels extracted from space rather than opened as a normal sheet.

- [x] **Step 4: Run GREEN and build**

Run: `npm test && npm run build`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add design-lab/prototypes-vanilla/src design-lab/prototypes-vanilla/tests/unit/field.test.js design-lab/prototypes-vanilla/tests/unit/intake.test.js
git commit -m "feat: rebuild fragment field and intake surfaces"
```

### Task 7: Build Capsule, the three Explore views, and authority detail pages

**Files:**
- Create/modify: `src/pages/explore.js`, `src/pages/city.js`
- Modify: relation/fragment primitives and styles
- Create: `tests/unit/explore.test.js`

**Interfaces:**
- `renderExplore(view)` accepts only `time | place | connection`.
- `getAuthorityLink(objectType, id)` returns the World-owned detail route.

- [x] **Step 1: Write failing view/detail tests**

```js
test('explore views use different scene targets and authority links', () => {
  assert.equal(renderRoute('#/world/city/bangkok/explore?view=time', testState).scenePayload.target, 'timeline');
  assert.equal(renderRoute('#/world/city/bangkok/explore?view=place', testState).scenePayload.target, 'map');
  assert.equal(renderRoute('#/world/city/bangkok/explore?view=connection', testState).scenePayload.target, 'relations');
  assert.equal(getAuthorityLink('connection', 'rel-river-ticket-photo'), '#/world/connection/rel-river-ticket-photo');
});

test('connection detail states evidence and gaps without confidence percentages', () => {
  const html = renderRoute('#/world/connection/rel-river-1022-suggestion', testState).html;
  assert.match(html, /仍缺少/);
  assert.doesNotMatch(html, /%|物理闭合|因果/);
});
```

- [x] **Step 2: Run RED**

Run: `npm test -- tests/unit/explore.test.js`
Expected: FAIL.

- [x] **Step 3: Implement all reading/explore/detail surfaces**

Build photography-book Capsule chapters with ScrollTrigger, draggable date rail, low-contrast place map, typed relation paths, scene original timeline, repeated place visits, evidence/gap connection detail, merge/split and confirm/reject state actions. Use `cityToCapsule` and target reformation instead of uniform fades.

- [x] **Step 4: Run GREEN and build**

Run: `npm test && npm run build`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add design-lab/prototypes-vanilla/src/pages design-lab/prototypes-vanilla/src/components design-lab/prototypes-vanilla/src/styles design-lab/prototypes-vanilla/tests/unit/explore.test.js
git commit -m "feat: rebuild city reading and exploration surfaces"
```

### Task 8: Rebuild Discover and Else

**Files:**
- Create/modify: `src/pages/discover.js`, `src/overlays/else-sheet.js`
- Modify: `src/store.js`, components, styles, visual targets/flow controller
- Create: `tests/unit/discover.test.js`, `tests/unit/else.test.js`

**Interfaces:**
- Discovery composition maps relation type to `repeat | cross-journey | cross-media | unresolved`.
- Else response: `{ answer, sources, uncertainty, nextAction }`.

- [x] **Step 1: Write failing evidence-order and scope tests**

```js
test('discovery detail emits evidence before its title', () => {
  const html = renderRoute('#/discover/disc-ari-mornings', testState).html;
  assert.ok(html.indexOf('data-discovery-evidence') < html.indexOf('三个早晨都从 Ari 开始'));
});

test('Else inherits route scope and uses human-readable source names', () => {
  const answer = answerElse({ route: '#/world/place/place-chao-phraya-ferry', question: '哪些到访已确认？' });
  assert.equal(answer.scope.label, 'Chao Phraya Ferry');
  assert.ok(answer.sources.every((source) => !source.label.startsWith('frag-')));
  assert.ok(answer.uncertainty);
  assert.ok(answer.nextAction.href);
});
```

- [x] **Step 2: Run RED**

Run: `npm test -- tests/unit/discover.test.js tests/unit/else.test.js`
Expected: FAIL.

- [x] **Step 3: Implement evidence-first Discover and single-instance Else**

Render one featured discovery at a time, relation-type-specific compositions, save/name actions and World authority links. Discovery Detail brings three dated fragments from distinct depths, forms time nodes, draws relation particles, condenses the shared place, and only then reveals the title. Build 40%/72% Else sheets, scope suggestions, answer/source/uncertainty/one-next-step structure, VisualViewport positioning, and idle/reading/found/uncertain/conflict particle states. `found` is an S-level resurgence with controlled warm source flows. Move the one Orb with Flip; never duplicate it.

- [x] **Step 4: Run GREEN and build**

Run: `npm test && npm run build`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add design-lab/prototypes-vanilla/src/pages/discover.js design-lab/prototypes-vanilla/src/overlays/else-sheet.js design-lab/prototypes-vanilla/src/store.js design-lab/prototypes-vanilla/src/components design-lab/prototypes-vanilla/src/styles design-lab/prototypes-vanilla/src/visual design-lab/prototypes-vanilla/tests/unit/discover.test.js design-lab/prototypes-vanilla/tests/unit/else.test.js
git commit -m "feat: rebuild discovery and else surfaces"
```

### Task 9: Rebuild Me, writings, privacy, preferences, storage, export/delete, and share

**Files:**
- Create/modify: `src/pages/me.js`, `src/overlays/share-preview.js`
- Modify: store/selectors/components/styles
- Create: `tests/unit/me.test.js`, `tests/unit/privacy.test.js`

**Interfaces:**
- `getDeleteImpact(target)` returns affected scenes/connections/discoveries/Capsule/notes.
- `getShareModel(target, options)` defaults to `hideAmount`, `hidePreciseAddress`, `hidePrivateNotes`.

- [x] **Step 1: Write failing privacy/tool tests**

```js
test('share defaults hide all sensitive fields', () => {
  assert.deepEqual(getShareModel('journey-bangkok-2024-autumn').privacy, {
    hideAmount: true,
    hidePreciseAddress: true,
    hidePrivateNotes: true,
  });
});

test('deleting a city lists every affected authority object before confirmation', () => {
  const impact = getDeleteImpact('journey-bangkok-2024-autumn');
  assert.ok(impact.scenes.length);
  assert.ok(impact.connections.length);
  assert.ok(impact.discoveries.length);
  assert.ok(impact.userNotes.length);
});
```

- [x] **Step 2: Run RED**

Run: `npm test -- tests/unit/me.test.js tests/unit/privacy.test.js`
Expected: FAIL.

- [x] **Step 3: Implement all Me and tool surfaces**

Use stable lists and warm authored blocks, related original thumbnails, edit/privacy/Capsule toggles, truthful local/demo-cloud explanation, live fact/balanced/narrative examples, storage categories, cache effects, export choices, explicit delete impact, and static/disabled particle mode for privacy/delete/share tools.

- [x] **Step 4: Run GREEN and build**

Run: `npm test && npm run build`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add design-lab/prototypes-vanilla/src/pages/me.js design-lab/prototypes-vanilla/src/overlays/share-preview.js design-lab/prototypes-vanilla/src/store.js design-lab/prototypes-vanilla/src/selectors.js design-lab/prototypes-vanilla/src/components design-lab/prototypes-vanilla/src/styles design-lab/prototypes-vanilla/tests/unit
git commit -m "feat: rebuild me and settings surfaces"
```

### Task 10: Add route-matrix Playwright coverage and visual optimization pass one

**Files:**
- Create: `playwright.config.js`, `tests/e2e/routes.spec.js`, `tests/e2e/interactions.spec.js`, `tests/e2e/visual.spec.js`
- Create: `docs/visual/particle-pass-1.md`
- Create: `artifacts/screenshots/pass-1/`, `artifacts/diffs/pass-1/`
- Read/compare: `docs/visual/reference-bar-2026-07-14.md` and the four user reference images named there

**Interfaces:**
- `ROUTE_CASES` enumerates every manifest route plus explore query states and overlay states.

- [ ] **Step 1: Write the failing route/interaction suite**

```js
for (const route of ROUTE_CASES) {
  test(`${route.name} has no runtime or viewport failures`, async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto(route.path);
    await expect(page.locator('[data-page-id]')).toHaveAttribute('data-page-id', route.pageId);
    expect(await page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth)).toBe(true);
    expect(errors).toEqual([]);
    await expect(page.locator('#memory-canvas')).toHaveCount(1);
    await expect(page.locator('[data-else-orb]')).toHaveCount(route.hidesElse ? 0 : 1);
  });
}
```

- [ ] **Step 2: Run RED against all routes**

Run: `npm run test:e2e -- --project=mobile-390`
Expected: suite identifies any remaining route, overflow, console, image, overlay, Else, or interaction gaps.

- [ ] **Step 3: Fix only demonstrated failures and perform semantic particle pass one**

For each required page capture before/after, record particle count, noise, depth, point size, colors, target, GSAP duration, and the specific semantic reason for the change. Review the six signature moments in screenshots plus video frames: first globe formation, World→City, 3D Field search, Discovery growth, Lens extraction/return, and Else state changes. Reject any fade-only, generic point-globe, background-dot, 2D card-wall or dashboard result. Remove particles from C-level tools where they do not explain state while preserving S/A ambition. Build a 390/430px reference contact sheet against the four 2026-07-14 user images and score every representative page on space density, original integration, composition, material detail and relationship legibility. S/A pages require at least 9/10 and B/C pages at least 8/10; continue editing every page below the threshold.

- [ ] **Step 4: Run GREEN across four viewports and reduced motion**

Run: `npm run test:e2e`
Expected: all route, interaction, screenshot and reduced-motion projects PASS.

- [ ] **Step 5: Commit**

```bash
git add design-lab/prototypes-vanilla/playwright.config.js design-lab/prototypes-vanilla/tests/e2e docs/visual/particle-pass-1.md artifacts/screenshots/pass-1 artifacts/diffs/pass-1 design-lab/prototypes-vanilla/src
git commit -m "perf: optimize particle system pass one"
```

### Task 11: Complete performance pass two, videos, and final audit

**Files:**
- Create: `scripts/profile-performance.mjs`
- Create: `performance-report.json`
- Create: `docs/visual/particle-pass-2.md`, `docs/visual/final-page-audit.md`, `docs/visual/final-handoff.md`
- Create: `artifacts/screenshots/final/`, `artifacts/diffs/final/`, `artifacts/videos/`
- Modify: visual lifecycle modules and e2e tests only when measurements expose a root cause.

**Interfaces:**
- Performance report records profile, viewport, load time, first meaningful render, average/min FPS, JS heap when available, particle count, DPR, canvas count, timeline count, and context-loss result.

- [ ] **Step 1: Write failing performance/resource assertions**

```js
test('route churn keeps one canvas and clears inactive timelines', async ({ page }) => {
  for (const path of churnPaths) await page.goto(path);
  await expect(page.locator('#memory-canvas')).toHaveCount(1);
  expect(await page.evaluate(() => window.__ELSEWHERE_DEBUG__.activeTimelines)).toBe(0);
  expect(await page.evaluate(() => window.__ELSEWHERE_DEBUG__.rendererCreations)).toBe(1);
});

test('context loss exposes the static visual without losing page actions', async ({ page }) => {
  await page.goto('#/world');
  await page.evaluate(() => window.__ELSEWHERE_DEBUG__.loseContext());
  await expect(page.locator('[data-visual-fallback]')).toBeVisible();
  await expect(page.locator('[data-primary-action]')).toBeEnabled();
});
```

- [ ] **Step 2: Run RED and capture measurements**

Run: `npm run test:e2e -- --grep 'route churn|context loss'` and `node scripts/profile-performance.mjs`
Expected: any leaked timeline/listener/resource or profile violation fails with measured evidence.

- [ ] **Step 3: Implement measured optimizations and capture final artifacts**

Adjust profile counts/DPR, render throttling, visibility pause, resize batching, lazy images, disposal, pointer heat, point-size curves, edge falloff, globe outline, city brightness, Lens noise reduction, Else states and transition speed. Record videos for globe interaction, Field search/focus/Lens restore, discovery reveal, Else answer, and explore view reformation.

- [ ] **Step 4: Run the complete fresh verification gate**

Run in `design-lab/prototypes-vanilla`:

```bash
npm test
npm run build
npm run test:e2e
node scripts/profile-performance.mjs
```

Then run repository scans:

```bash
! rg 'onclick=|onchange=|alert\\(|SPATIOTEMPORAL|PHYSICAL CLOSURE|CONFIDENCE [0-9]|https://images.unsplash.com|@tailwindcss/browser' design-lab/prototypes-vanilla/src design-lab/prototypes-vanilla/index.html
git diff --check
```

Expected: every command exits 0, all test projects pass, scans find no forbidden production patterns, and report values fall within documented profiles.

- [ ] **Step 5: Commit**

```bash
git add design-lab/prototypes-vanilla docs/visual artifacts performance-report.json scripts/profile-performance.mjs
git commit -m "docs: add final handoff and audit report"
```

## Plan Self-Review

- Spec coverage: all 31 requested routes/states, four overlays, single Canvas/particle pool, shader attributes/uniforms, six signature moments, S/A/B/C intensity levels, cinematic first five seconds, globe, 3D Field, three Explore views, Else, Me tools, two particle passes, four viewports, screenshots, diffs, videos and reports map to tasks above.
- Placeholder scan: every task names exact files, interfaces, failing tests, commands, expected result and commit boundary.
- Type consistency: page renderers return `{ html, sceneMode, scenePayload, afterRender }`; overlays use one stack snapshot; selectors consume the same canonical indexes; visual modes match the design spec.
- Execution selection: the user explicitly authorized continuous autonomous execution and did not authorize subagents, so implementation proceeds inline with `superpowers:executing-plans` without an additional handoff question.
