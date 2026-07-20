# Elsewhere Data-Anchored Memory Particles Design

## Goal

Make the shared Three.js scene a projection of the current user's fragments and their on-screen anchors, rather than a fixed viewport background. The current frozen visual composition remains the baseline for the fixture dataset, while empty, small, current, and large datasets produce measurably different particle states.

## Verified root cause

1. `#memory-canvas` is fixed inside `.app-viewport`, while `#page-content-layer` scrolls independently.
2. City anchors are measured once in `afterRender`; no scroll, resize, horizontal-pan, or route-layout lifecycle keeps them synchronized.
3. commit `49baa9f` removed `trackElementAnchors` and `trackWorldElement`, explicitly reverting the only scroll-following implementation.
4. `particle-targets.js` imports fixture collections and supplies hard-coded city/field geometry when payload data is absent.
5. The particle pool has a fixed visible population. Changing one fragment into twenty fragments can change allocation ratios, but cannot change the visible density.
6. Fragment Field moves DOM nodes with its own camera while Three.js uses a separate scene transform.

## Observable success criteria

- Zero fragments compile an `initializing` seed state with no city cluster, discovery core, or relationship path.
- Small, current, and large fixtures produce distinct `dataSignature`, `activeParticleCount`, cluster count, and relation count.
- Page scroll moves the particle scene by the same viewport delta in the same animation frame; no 0.9-second morph is used for scroll following.
- Fragment Field pan/zoom and horizontal content scrolling update both DOM and Three.js through one spatial transform contract.
- Route changes reuse one renderer and one particle pool, but always compile from the new route's current data.
- Existing fixture screenshots keep their composition: this change may correct alignment and density, but must not redesign cards, typography, or navigation.

## Chosen architecture

### 1. Particle scene compiler

`compileParticleScene(mode, poolSize, payload)` is a pure function. It returns:

```js
{
  positions: Float32Array,
  visibility: Float32Array,
  activeCount: number,
  dataSignature: string,
  anchorCount: number,
  state: 'initializing' | 'populated'
}
```

The compiler consumes only payload facts. `particle-targets.js` must not import fixture collections. Pages pass current cities, fragments, places, dates, connections, sources, and counts. When data is empty, the compiler creates a sparse open seed geometry; it never substitutes the Bangkok fixture.

The existing particle pool remains fixed for GPU stability. `visibility` controls how much of that pool participates, so data cardinality changes density without reallocating WebGL buffers.

### 2. Spatial anchor registry

`SpatialAnchorRegistry` binds the current page root, its scroll root, and elements marked with `data-particle-anchor`. It batches DOM reads once per animation frame and reports:

- semantic anchor positions in viewport coordinates;
- uniform page-scroll translation;
- non-uniform layout changes requiring a target recompile;
- optional horizontal-scroll or field-camera transforms.

Uniform scroll directly translates the Three.js group. It does not restart a GSAP timeline. Non-uniform changes recompile anchor targets and snap the structural translation immediately; only a data or route change may use a short morph.

### 3. Shared spatial transform contract

`MemorySceneManager` owns one `spatialTransform` containing pixel translation, scale, and scroll origin. `worldFromViewport` is the only pixel-to-world conversion. Fragment Field calls `setSpatialTransform` after its DOM camera update. World stage tracking and ordinary page scrolling use the same method.

### 4. Page contracts

Particle-capable pages expose semantic anchors rather than page-specific imperative particle code:

```html
<button
  data-particle-anchor="fragment"
  data-particle-id="frag_123"
  data-particle-weight="1"
></button>
```

Core mapping:

- World: globe stage plus current city facts.
- City: each rendered cluster plus its current fragment count.
- Fragment Field: every rendered fragment node plus cluster membership.
- Discover Home/Detail: source fragments and the shared entity.
- Explore Time/Place/Connection: moment, place, or relationship nodes.
- Inbox/Import/Receipt: evidence pair or batch node.
- Else: orb and returned source anchors when present.

Tool pages remain quiet and do not synthesize anchors.

## Motion rules

- Data/route change: GSAP morph may interpolate old geometry into the newly compiled scene.
- Scroll/pan/zoom: immediate spatial transform, synchronized to the current frame.
- High scroll velocity: reduce opacity/noise slightly, then restore after the scroll settles; never allow the scene to trail behind content.
- Reduced motion: all spatial alignment remains exact; only decorative drift and morph duration are reduced.

## Performance constraints

- No per-particle DOM reads.
- One batched anchor read per invalidated frame.
- Reuse the existing WebGL renderer, geometry, and particle buffers.
- `ResizeObserver` invalidates layout; scroll/pointer handlers only store transform state and request one frame.
- No new runtime dependency.

## Verification matrix

| Fixture | Expected state | Required assertion |
| --- | --- | --- |
| zero | initializing | no semantic cluster, low active count |
| small | populated | one/few anchors, density above zero fixture |
| current | populated | current visual composition and current data signature |
| large | populated | more active particles and all current clusters represented |
| vertical scroll | populated | group viewport delta equals content delta |
| horizontal pan | populated | DOM and Three transform share delta/scale |
| route switch | route-specific | pool id stable, signature and anchors change |

## Non-goals

- No page redesign.
- No backend or Firebase change.
- No new particle library.
- No WebGL renderer remount per route.
- No attempt to make tool/settings pages visually intense.
