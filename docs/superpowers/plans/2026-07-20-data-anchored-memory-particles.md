# Data-Anchored Memory Particles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every particle-capable Elsewhere route compile from current fragment data and remain synchronized with its DOM anchors during scroll, pan, zoom, and route transitions.

**Architecture:** A pure particle scene compiler produces positions, per-particle visibility, and a data signature from route payloads. A spatial anchor registry batches DOM geometry and drives a single scene-manager spatial transform without replaying morph timelines during user movement.

**Tech Stack:** Vanilla JavaScript, Three.js, GSAP, Node test runner, Playwright, Vite.

## Global Constraints

- Preserve the current fixture composition and mobile information architecture.
- Empty data must render an initializing seed, never fallback fixture clusters.
- Scroll/pan/zoom alignment is immediate; GSAP is reserved for data/route morphs.
- Reuse one renderer and one particle pool.
- Add no runtime dependencies and make no backend changes.
- Every RED, GREEN, and refactor stage is a separate commit.

---

### Task 1: Pure data-driven particle scene compiler

**Files:**
- Create: `design-lab/prototypes-vanilla/src/visual/particle-scene-compiler.js`
- Modify: `design-lab/prototypes-vanilla/src/visual/particle-targets.js`
- Modify: `design-lab/prototypes-vanilla/src/visual/particle-system.js`
- Modify: `design-lab/prototypes-vanilla/src/visual/shaders.js`
- Create: `design-lab/prototypes-vanilla/tests/unit/particle-scene-compiler.test.js`

**Interfaces:**
- Consumes: `compileParticleScene(mode, poolSize, payload)` where `payload` contains only current route facts.
- Produces: `{ positions, visibility, activeCount, dataSignature, anchorCount, state }`.
- Produces: `particleSystem.setScene(compiledScene, { resetProgress, snap })`.

- [ ] **Step 1: Write failing zero/small/large tests**

```js
test('empty data compiles an initializing seed without semantic clusters', () => {
  const scene = compileParticleScene('cityCluster', 300, { itemCount: 0, anchors: [] });
  assert.equal(scene.state, 'initializing');
  assert.equal(scene.anchorCount, 0);
  assert.ok(scene.activeCount < 60);
});

test('visible particle density increases with current item count', () => {
  const small = compileParticleScene('cityCluster', 300, { itemCount: 3, anchors: [{ id: 'a', x: 0, y: 0, z: -2 }] });
  const large = compileParticleScene('cityCluster', 300, { itemCount: 90, anchors: [{ id: 'a', x: 0, y: 0, z: -2 }] });
  assert.ok(large.activeCount > small.activeCount);
  assert.notEqual(large.dataSignature, small.dataSignature);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/unit/particle-scene-compiler.test.js`
Expected: FAIL because `particle-scene-compiler.js` does not exist.

- [ ] **Step 3: Commit RED**

```bash
git add design-lab/prototypes-vanilla/tests/unit/particle-scene-compiler.test.js
git commit -m "test(frontend): define data-driven particle scene contracts"
```

- [ ] **Step 4: Implement the minimal compiler and visibility buffer**

The compiler must calculate a deterministic signature from `mode`, item ids/counts, anchors, relations, and route revision; emit an initializing seed when `itemCount === 0`; and derive `activeCount` monotonically from item count. `particle-system.js` adds `aVisibility` and `aTargetVisibility`; the vertex/fragment pipeline multiplies alpha by interpolated visibility.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- tests/unit/particle-scene-compiler.test.js`
Expected: all compiler tests PASS.

Run: `npm test`
Expected: all unit tests PASS.

- [ ] **Step 6: Commit GREEN**

```bash
git add design-lab/prototypes-vanilla/src/visual design-lab/prototypes-vanilla/tests/unit/particle-scene-compiler.test.js
git commit -m "feat(frontend): compile particle scenes from current data"
```

### Task 2: Scroll- and layout-synchronized anchor registry

**Files:**
- Create: `design-lab/prototypes-vanilla/src/visual/spatial-anchor-registry.js`
- Modify: `design-lab/prototypes-vanilla/src/visual/scene-manager.js`
- Modify: `design-lab/prototypes-vanilla/src/app.js`
- Modify: `design-lab/prototypes-vanilla/tests/unit/visual.test.js`

**Interfaces:**
- Produces: `sceneManager.bindPageSpace({ pageRoot, scrollRoot, mode, payload }) => cleanup`.
- Produces: `sceneManager.setSpatialTransform({ x, y, scale, source })`.
- Produces debug fields: `dataSignature`, `activeParticleCount`, `anchorCount`, `spatialTransform`, `layoutRevision`.

- [ ] **Step 1: Write failing movement tests**

```js
test('uniform DOM scroll translates the scene in the same frame without morph', () => {
  const binding = createSpatialAnchorRegistry({ worldFromViewport, onTransform, onLayout });
  binding.bind({ anchors: [anchorA, anchorB], scrollRoot });
  scrollRoot.scrollTop = 120;
  binding.flush();
  assert.equal(onTransform.calls.at(-1).pixelY, -120);
  assert.equal(onLayout.calls.length, 1);
});

test('non-uniform anchor movement invalidates layout once', () => {
  anchorB.left += 30;
  binding.flush();
  assert.equal(onLayout.calls.length, 2);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/unit/visual.test.js`
Expected: FAIL because the registry and `bindPageSpace` do not exist.

- [ ] **Step 3: Commit RED**

```bash
git add design-lab/prototypes-vanilla/tests/unit/visual.test.js
git commit -m "test(frontend): define particle anchor lifecycle"
```

- [ ] **Step 4: Implement the registry and manager bridge**

The registry stores initial rectangles, listens to the current page scroll root and marked horizontal scroll roots, batches geometry through `requestAnimationFrame`, and distinguishes uniform transform from non-uniform layout. `app.js` cleans up the previous binding before replacing page HTML and binds the new page after `afterRender`.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- tests/unit/visual.test.js`
Expected: anchor lifecycle tests PASS with zero morph calls during uniform movement.

Run: `npm test`
Expected: all unit tests PASS.

- [ ] **Step 6: Commit GREEN**

```bash
git add design-lab/prototypes-vanilla/src/visual/spatial-anchor-registry.js design-lab/prototypes-vanilla/src/visual/scene-manager.js design-lab/prototypes-vanilla/src/app.js design-lab/prototypes-vanilla/tests/unit/visual.test.js
git commit -m "feat(frontend): synchronize particle space with page movement"
```

### Task 3: Route data and semantic DOM anchors

**Files:**
- Modify: `design-lab/prototypes-vanilla/src/pages/world.js`
- Modify: `design-lab/prototypes-vanilla/src/pages/fragments.js`
- Modify: `design-lab/prototypes-vanilla/src/pages/discover.js`
- Modify: `design-lab/prototypes-vanilla/src/pages/explore.js`
- Modify: `design-lab/prototypes-vanilla/src/pages/onboarding.js`
- Modify: `design-lab/prototypes-vanilla/src/overlays/else-sheet.js`
- Modify: `design-lab/prototypes-vanilla/src/controllers/field-controller.js`
- Create: `design-lab/prototypes-vanilla/tests/unit/particle-route-contracts.test.js`

**Interfaces:**
- Every particle route returns `scenePayload.itemCount`, `scenePayload.items`, and relevant relation/place facts.
- Semantic elements use `data-particle-anchor`, `data-particle-id`, and optional `data-particle-weight`.
- Fragment Field calls `sceneManager.setSpatialTransform` from the same camera state applied to DOM nodes.

- [ ] **Step 1: Write failing route contract tests**

```js
for (const route of ['#/world', '#/world/city/bangkok', '#/world/fragments', '#/discover', '#/discover/disc-ari-mornings']) {
  test(`${route} exposes data and DOM particle anchors`, () => {
    const view = renderRoute(route, state);
    assert.equal(typeof view.scenePayload.itemCount, 'number');
    assert.match(view.html, /data-particle-anchor=/);
  });
}
```

- [ ] **Step 2: Verify RED and commit**

Run: `npm test -- tests/unit/particle-route-contracts.test.js`
Expected: FAIL on missing payload counts and anchor attributes.

Commit: `test(frontend): define semantic particle route contracts`

- [ ] **Step 3: Add the minimal route payloads and anchor attributes**

Use current mutable live collections, not duplicated fixture totals. Empty views pass `itemCount: 0`. Field controller publishes the exact camera delta/scale used by DOM nodes.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm test -- tests/unit/particle-route-contracts.test.js`
Expected: all route contract tests PASS.

Run: `npm test`
Expected: all unit tests PASS.

Commit: `feat(frontend): bind semantic particles to rendered fragments`

### Task 4: Browser regression matrix and final refactor

**Files:**
- Create: `design-lab/prototypes-vanilla/tests/e2e/particle-space.spec.js`
- Modify: `design-lab/prototypes-vanilla/tests/e2e/recording-visual.spec.js`
- Modify only if required by failing visual evidence: `design-lab/prototypes-vanilla/src/styles/pages.css`
- Modify: `docs/demo/2026-07-20-competition-delivery.md`

**Interfaces:**
- Browser assertions read `window.__ELSEWHERE_DEBUG__.snapshot()`.
- Fixtures cover `zero`, `small`, `current`, and `large` data profiles.

- [ ] **Step 1: Add failing browser checks**

The test records the initial debug snapshot, scrolls the real content layer, verifies spatial delta in the next frame, pans Fragment Field through pointer input, and switches World → City → Discover while asserting a stable pool id and changing signature. Zero/small/large profiles assert monotonic active density and no fixture fallback.

- [ ] **Step 2: Verify RED and commit**

Run: `npx playwright test tests/e2e/particle-space.spec.js --project=chromium`
Expected: FAIL on missing debug fields or spatial delta.

Commit: `test(frontend): cover data and movement particle matrix`

- [ ] **Step 3: Refactor only proven duplication and tune scroll settle**

Use `gsap.quickTo` only for opacity/noise recovery after high-velocity scroll. Do not tween spatial position. Remove any fixture fallback exposed by the browser matrix.

- [ ] **Step 4: Run full verification**

Run: `npm test`
Expected: all unit tests PASS.

Run: `npx playwright test tests/e2e/particle-space.spec.js tests/e2e/recording-visual.spec.js --project=chromium`
Expected: all particle and recording tests PASS at 390x844 and 430x932.

Run: `npm run build`
Expected: Vite build PASS; existing chunk-size advisory may remain.

Run: `git diff --check`
Expected: no output.

- [ ] **Step 5: Commit final refactor and evidence**

```bash
git add design-lab/prototypes-vanilla docs/demo/2026-07-20-competition-delivery.md
git commit -m "fix(frontend): make memory particles data anchored"
```
