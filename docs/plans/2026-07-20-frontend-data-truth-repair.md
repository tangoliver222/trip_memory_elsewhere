# Frontend Data Truth and Interaction Repair Plan

**Date:** 2026-07-20  
**Scope:** `design-lab/prototypes-vanilla` production prototype only  
**Visual constraint:** World Home and City Home keep their approved baseline composition when the current fixture is active. Empty, small, current and dense datasets must change content, geometry and copy without inventing evidence.

## Chosen approach

Three approaches were considered:

1. Patch each visible string and coordinate. This is fastest but leaves page logic coupled to the Bangkok fixture and will regress with the next dataset.
2. Replace the existing store and hydration architecture. This is structurally clean but too invasive for a visual/data repair and would risk unrelated backend-demo flows.
3. **Selected:** keep the existing hydration contract, add small route-scoped selectors and a development-only scenario harness, then make pages compile their copy, anchors and particle payload from those selectors. This removes fixed visual claims without replacing the router, store, renderer or WebGL engine.

## Page contracts

### World Home

- Space: World; density: immersive.
- Purpose: show whether a private travel world exists and enter the most relevant city.
- Focus with data: one WebGL particle globe; no second CSS/image globe.
- Focus without data: clean dark field with only a restrained brand, truthful empty message and one import action. No city pins, fake counts, recommendation or formed globe.
- Particle meaning: zero data uses an unformed sparse seed; city and fragment counts compile the globe density and city targets.
- Primary action: recommended city when available, otherwise first import.

### City Home

- Space: World; density: immersive.
- Purpose: show the selected city's actual fragment cohorts and offer Capsule or Explore.
- Focus: media anchors grouped by actual place/scene; labels and counts derived from selected city.
- Particle meaning: each rendered fragment and cluster has the same data identity as the compiled scene item.

### City Capsule

- Space: World; density: immersive reading.
- Purpose: read 2–3 evidence-led chapters for the selected city.
- Focus: current city's originals; no Bangkok-only asset or prose fallback for other/empty cities.
- Primary action: share the current capsule; return is secondary.

### Time / Place / Connection and authority details

- Space: World; density: exploratory.
- Purpose: inspect the selected city's real scenes, places and connections, then enter their one authority page.
- Focus: selected object's original evidence, not oversized prose.
- Particle meaning: payload and DOM anchors share the filtered object IDs.

### Else

- Role: one contextual assistant instance.
- Focus: the approved pearlescent IP asset animated through the existing Lottie file; the Orb itself moves into the Sheet.
- States: idle, reading, found, uncertain and conflict remain semantic state classes; no duplicate character.

## Data-state acceptance matrix

| Scenario | World | City / Explore / Capsule | Copy | Particles |
| --- | --- | --- | --- | --- |
| Empty | no formed globe, pins, recommendation or memory totals | truthful empty route | no past-tense ownership claims | unformed sparse seed; no fragment anchors |
| Small | one city and 1–3 originals | only existing groups and objects | singular/plural/counts match | density and anchors match rendered IDs |
| Current | approved Bangkok baseline retained | current composition retained | fixture facts remain source-backed | same object IDs as DOM |
| Dense | additional cities/groups become navigable | selected city remains isolated | totals and summaries expand | density scales within performance caps |

Development visual scenarios may be selected only with `?__scenario=empty|small|dense`. The production build ignores this query and uses fixture or live hydration normally.

## Interaction acceptance matrix

Every visible button must be one of:

- navigation with a valid route;
- an overlay/action registered by `action-controller`;
- a state/filter action whose visible state changes;
- intentionally disabled with an explicit reason.

There may be no bare button that looks actionable. Test-only routes remain in Playwright fixtures and are not added to the production manifest.

## TDD implementation sequence

### Phase 1 — Scenario and selector contracts

**RED**

- Add tests proving empty/small/current/dense snapshots yield different world summaries, city groups, route-scoped scenes/places/connections and truthful labels.
- Add tests proving selected-city selectors never fall back to Bangkok data when a route is empty or unknown.

**GREEN / REFACTOR**

- Add minimal selectors and dev scenario hydration.
- Fix live hydration journey/city identity fallbacks.

**Files**

- Add `design-lab/prototypes-vanilla/src/data/view-model.js`
- Add `design-lab/prototypes-vanilla/src/data/dev-scenarios.js`
- Modify `design-lab/prototypes-vanilla/src/data/live-hydrator.js`
- Modify `design-lab/prototypes-vanilla/src/app.js`
- Add `design-lab/prototypes-vanilla/tests/unit/view-model.test.js`

**Verify**

```bash
npm test -- --test-name-pattern="view model|scenario|live hydration"
```

**Commit:** `feat(frontend): add route-scoped memory view models`

### Phase 2 — World Home data truth and one globe

**RED**

- Add unit assertions for the empty World DOM and payload.
- Add Playwright assertions for empty/current/dense scenarios, including no duplicate globe layer and no invented totals.

**GREEN / REFACTOR**

- Remove the independent topology globe.
- Render empty and populated World states separately.
- Compile all counts, recommendation, status summary, pins and particle items from the current view model.

**Files**

- Modify `design-lab/prototypes-vanilla/src/pages/world.js`
- Modify `design-lab/prototypes-vanilla/src/styles/pages.css`
- Modify `design-lab/prototypes-vanilla/src/app.js`
- Modify `design-lab/prototypes-vanilla/tests/unit/pages-world.test.js`
- Add `design-lab/prototypes-vanilla/tests/e2e/data-scenarios.spec.js`

**Verify**

```bash
npm test -- --test-name-pattern="World Home"
npx playwright test tests/e2e/data-scenarios.spec.js --project=chromium
```

**Commit:** `fix(frontend): make World Home truthful across data states`

### Phase 3 — City and authority route scoping

**RED**

- Assert Explore and Capsule use only selected-city objects.
- Assert empty city routes render no foreign originals or claims.
- Assert particle payload item IDs equal rendered anchor IDs.

**GREEN / REFACTOR**

- Replace Bangkok/date/place literals with derived labels and route-scoped objects.
- Generate city cohorts from actual place/scene membership.
- Generate primary authority links from the first available object.

**Files**

- Modify `design-lab/prototypes-vanilla/src/pages/world.js`
- Modify `design-lab/prototypes-vanilla/src/pages/explore.js`
- Modify `design-lab/prototypes-vanilla/src/selectors.js`
- Modify `design-lab/prototypes-vanilla/tests/unit/explore.test.js`
- Modify `design-lab/prototypes-vanilla/tests/unit/particle-route-contracts.test.js`

**Verify**

```bash
npm test -- --test-name-pattern="city|explore|capsule|authority|particle"
```

**Commit:** `fix(frontend): bind city experiences to selected journey data`

### Phase 4 — Complete button behavior

**RED**

- Add a markup/action registry test and an E2E crawl that clicks every visible enabled control from a clean route.
- Cover year filtering, share confirmation and About/Feedback.

**GREEN / REFACTOR**

- Implement only the missing actions and visible state changes; remove or explicitly disable any control with no valid product behavior.

**Files**

- Modify `design-lab/prototypes-vanilla/src/controllers/action-controller.js`
- Modify `design-lab/prototypes-vanilla/src/pages/world.js`
- Modify `design-lab/prototypes-vanilla/src/pages/me.js`
- Modify relevant overlay files only if needed
- Add `design-lab/prototypes-vanilla/tests/unit/action-contracts.test.js`
- Add `design-lab/prototypes-vanilla/tests/e2e/button-contracts.spec.js`

**Verify**

```bash
npm test -- --test-name-pattern="action|button"
npx playwright test tests/e2e/button-contracts.spec.js --project=chromium
```

**Commit:** `fix(frontend): complete visible interaction contracts`

### Phase 5 — Else IP and Lottie lifecycle

**RED**

- Assert a single Else instance, IP fallback image, Lottie mount and state attributes.
- Exercise opening/closing and route changes to prove animation instances are destroyed rather than duplicated.

**GREEN / REFACTOR**

- Use the existing `else-idle.png` and `else-quiet-float.json` assets.
- Add the already-approved `lottie-web` runtime to this vanilla package if it is absent.
- Initialize/destroy Lottie in shell lifecycle and preserve the existing Orb-to-Sheet movement.

**Files**

- Modify `design-lab/prototypes-vanilla/package.json`
- Modify package lock
- Modify `design-lab/prototypes-vanilla/public/assets/else-quiet-float.json`
- Modify `design-lab/prototypes-vanilla/src/components/app-shell.js`
- Modify `design-lab/prototypes-vanilla/src/styles/shell.css`
- Modify `design-lab/prototypes-vanilla/tests/unit/visual.test.js`
- Modify `design-lab/prototypes-vanilla/tests/e2e/interactions.spec.js`

**Verify**

```bash
npm test -- --test-name-pattern="Else"
npx playwright test tests/e2e/interactions.spec.js --project=chromium
```

**Commit:** `feat(frontend): animate the Else IP with one Lottie lifecycle`

### Phase 6 — Capsule and authority layout consistency

**RED**

- Add 390×844 and 430×932 assertions for overflow, first primary-action visibility, readable type bounds and no navigation overlap.

**GREEN / REFACTOR**

- Constrain Capsule cover/chapter proportions to mobile viewport and current content.
- Reduce authority-page title scale, normalize spacing and keep evidence ahead of prose.
- Preserve different Time/Place/Connection structures while sharing type and action rhythm.

**Files**

- Modify `design-lab/prototypes-vanilla/src/styles/pages.css`
- Modify `design-lab/prototypes-vanilla/src/pages/explore.js`
- Add `design-lab/prototypes-vanilla/tests/e2e/city-authority-layout.spec.js`

**Verify**

```bash
npx playwright test tests/e2e/city-authority-layout.spec.js --project=chromium
```

**Commit:** `fix(frontend): unify capsule and authority page proportions`

### Phase 7 — Adversarial regression

- Run unit tests, route coverage, interaction coverage, particle-space coverage and visual scenario coverage.
- Capture 390×844 and 430×932 screenshots for empty/small/current/dense World plus City, Capsule, Time, Place and Connection.
- Check `scrollWidth === clientWidth`, exactly one Else, all particle anchors map to scene items, and all buttons satisfy the action contract.
- Run production build and `git diff --check`.

**Verify**

```bash
npm test
npx playwright test tests/e2e/data-scenarios.spec.js tests/e2e/button-contracts.spec.js tests/e2e/city-authority-layout.spec.js tests/e2e/particle-space.spec.js tests/e2e/routes.spec.js --project=chromium
npm run build
git diff --check
```

**Commit:** `test(frontend): verify data-driven visual and interaction states`

## Non-goals

- No React migration, router replacement or state-management framework.
- No new product page or duplicate authority page.
- No backend/API contract changes.
- No fabricated fragments, places, discoveries or progress.
- No redesign of already approved World/City composition for the current baseline beyond correcting the duplicate globe and data truth defects.
