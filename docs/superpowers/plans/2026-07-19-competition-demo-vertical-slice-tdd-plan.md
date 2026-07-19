# Competition Demo Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one recordable real-data Bangkok flow from file selection through persisted processing,
data-driven memory views, Discovery and a source-grounded Gemini Else answer.

**Architecture:** Keep the production API/ingestion/worker roots unchanged. Add an explicitly development-only demo
composition that uses Firebase Emulators and invokes the existing ingestion pipeline after a real Storage upload.
A deterministic projection converts persisted Fragments into the existing high-fidelity renderer shapes; live mode
must fail visibly rather than silently return fixture data.

**Tech Stack:** Node.js 22, Fastify 5, Firebase Admin/Web SDK and Emulators, existing Sharp/EXIF/routing pipeline,
Gemini through `@google/genai`, Vanilla JS, Three.js, GSAP, Node test runner and Playwright.

## Global Constraints

- Work only in `/Users/tangyixuan/trip_memory_elsewhere/.worktrees/backend-foundation-v1` on
  `codex/backend-foundation-v1`.
- TDD is mandatory: every production behavior starts with a test that is observed failing for the intended reason.
- Commit every task separately; do not amend or combine task commits.
- Production `src/server.js` must never import demo code or register `/demo/*`.
- Live mode may not silently read `src/fixtures/data.js` after bootstrap begins.
- Input formats for the recording are JPEG, PNG, WebP and UTF-8 text only.
- Missing GPS/time/OCR remains unresolved; never invent facts.
- Missing Gemini blocks the Else recording gate; never substitute a deterministic answer as AI output.
- Stop feature work at hour 16 and preserve the verified recording path.

---

### Task 1: Restore a Clean Frontend Baseline

**Files:**
- Modify: `design-lab/prototypes-vanilla/tests/unit/intake.test.js`
- Modify: `design-lab/prototypes-vanilla/src/visual/performance-profile.js`
- Verify: `design-lab/prototypes-vanilla/tests/unit/performance.test.js`

**Interfaces:**
- Consumes: current visual page renderers and performance profile contract.
- Produces: 63/63 frontend unit tests passing with the visual composition unchanged.

- [ ] **Step 1: Confirm the existing three failures**

Run:

```bash
npm test
```

Working directory: `design-lab/prototypes-vanilla`.

Expected: exactly the intake whitespace assertion and two `3200 !== 3000` performance failures.

- [ ] **Step 2: Make the intake assertion test semantic text**

Replace the raw HTML regex assertion with:

```js
const visibleText = inbox.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
assert.match(visibleText, /是否也靠近 Chao Phraya Ferry/);
```

This preserves the intentional `<br>` composition and tests user-visible copy.

- [ ] **Step 3: Restore the bounded low profile**

Set only the low/reduced-motion `particleCount` in `performance-profile.js` from `3200` to the already-tested
ceiling `3000`. Do not change high/medium profiles, timings or scene targets.

- [ ] **Step 4: Verify baseline and build**

Run:

```bash
npm test
npm run build
```

Expected: 63 pass, 0 fail; Vite build succeeds.

- [ ] **Step 5: Commit**

```bash
git add design-lab/prototypes-vanilla/tests/unit/intake.test.js design-lab/prototypes-vanilla/src/visual/performance-profile.js
git commit -m "fix(demo): restore frontend test baseline"
```

---

### Task 2: Deterministic Competition Projection

**Files:**
- Create: `services/backend/src/demo/projection.js`
- Create: `services/backend/test/unit/demo-projection.test.js`

**Interfaces:**
- Consumes: `{ ownerId, fragments, importBatches, decisions }` using parsed backend domain objects.
- Produces: `projectCompetitionSnapshot(input)` returning the strict snapshot in the approved design.

- [ ] **Step 1: Write failing projection tests**

Tests must cover:

```js
test('empty owner produces an empty honest snapshot', () => {
  const snapshot = projectCompetitionSnapshot({ ownerId: 'user_demo', fragments: [], importBatches: [], decisions: {} });
  assert.equal(snapshot.world.totalFragments, 0);
  assert.deepEqual(snapshot.cities, []);
  assert.deepEqual(snapshot.discoveries, []);
});

test('three distinct mornings at one anchor produce one evidence-first discovery', () => {
  const snapshot = projectCompetitionSnapshot(threeAriMorningInput());
  assert.equal(snapshot.discoveries.length, 1);
  assert.deepEqual(snapshot.discoveries[0].sourceIds, ['frag_a', 'frag_b', 'frag_c']);
  assert.equal(snapshot.discoveries[0].placeId, 'place-common-grounds');
});

test('adding and removing fragments changes every aggregate deterministically', () => {
  assert.notDeepEqual(projectCompetitionSnapshot(oneFragmentInput()), projectCompetitionSnapshot(twelveFragmentInput()));
});
```

Also assert: input-order invariance, 80 m anchor maximum, 45-minute visit grouping, three distinct dates,
05:00–11:30 morning bounds, unresolved no-GPS Inbox item and no emotional copy.

- [ ] **Step 2: Verify RED**

```bash
node --test test/unit/demo-projection.test.js
```

Expected: module-not-found for `src/demo/projection.js`.

- [ ] **Step 3: Implement the minimal pure projection**

Export exactly:

```js
export const DEMO_ANCHORS = Object.freeze([
  Object.freeze({ id: 'place-common-grounds', name: 'Common Grounds', area: 'Ari', lat: 13.7791, lng: 100.5443 }),
  Object.freeze({ id: 'place-chao-phraya-ferry', name: 'Chao Phraya Ferry', area: 'Riverside', lat: 13.7331, lng: 100.5101 }),
]);

export function projectCompetitionSnapshot({ ownerId, fragments, importBatches, decisions = {} }) {
  // validate owner and arrays; copy and sort by Fragment ID; derive only from persisted fields
  // return a deeply frozen snapshot with world/cities/fragments/importBatches/places/visits/
  // connections/inboxItems/discoveries
}
```

Use an internal Haversine helper. Resolve capture time only from `facts.capturedAt.value` then
`source.sourceCreatedAt`/`source.sourceModifiedAt`; resolve GPS only from `facts.geo.value` then
`source.locationHint`. Every projected object includes persisted source IDs.

- [ ] **Step 4: Verify GREEN and regression**

```bash
node --test test/unit/demo-projection.test.js
npm test
```

Expected: projection tests pass; backend full suite has 0 failures.

- [ ] **Step 5: Commit**

```bash
git add services/backend/src/demo/projection.js services/backend/test/unit/demo-projection.test.js
git commit -m "feat(demo): project persisted fragments into memory views"
```

---

### Task 3: Isolated Demo Repository and HTTP Composition

**Files:**
- Create: `services/backend/src/demo/repository.js`
- Create: `services/backend/src/demo/routes.js`
- Create: `services/backend/src/demo/composition.js`
- Create: `services/backend/scripts/demo-server.mjs`
- Create: `services/backend/test/integration/demo-composition.test.js`
- Modify: `services/backend/package.json`

**Interfaces:**
- Consumes: Firebase Admin `db`, `storage`, existing import service and existing ingestion pipeline.
- Produces: `createDemoComposition(dependencies)` and development-only demo routes.

- [ ] **Step 1: Write failing isolation and route tests**

The integration test must assert:

```js
assert.equal((await productionApi.inject({ method: 'GET', url: '/demo/v1/snapshot' })).statusCode, 404);
assert.equal((await demoApp.inject(authenticatedGet('/demo/v1/snapshot'))).statusCode, 200);
assert.equal((await demoApp.inject(unauthenticatedGet('/demo/v1/snapshot'))).statusCode, 401);
assert.equal((await demoApp.inject(authenticatedGet('/demo/v1/snapshot', { demoHeader: false }))).statusCode, 403);
```

Also assert strict finalize body, owner from verified token only, server-read generation/metadata, stable redacted errors,
decision persistence and reset limited to the current owner.

- [ ] **Step 2: Verify RED**

```bash
node --test test/integration/demo-composition.test.js
```

Expected: module-not-found for demo composition.

- [ ] **Step 3: Implement repository and routes**

Repository interface:

```js
export function createDemoRepository({ db, storage }) {
  return Object.freeze({
    listFragments(ownerId),
    listImportBatches(ownerId),
    getObjectGeneration({ bucket, objectName }),
    saveDecision(ownerId, itemId, decision),
    resetOwner(ownerId),
  });
}
```

Route interface:

```js
export function registerDemoRoutes(app, {
  requireAuth, demoRepository, finalizeUpload, projectSnapshot, askElse,
}) {}
```

Accept only `X-Elsewhere-Demo: local-competition-v1`. `/demo/v1/finalize-upload` accepts strict
`{ batchId, fragmentId }`, loads the manifest and actual generation, then calls the existing pipeline with a
server-built event. `/demo/v1/snapshot` calls the pure projection.

- [ ] **Step 4: Add guarded script**

`demo-server.mjs` must reject unless all are true:

```js
process.env.NODE_ENV === 'development'
process.env.ELSEWHERE_DEMO_MODE === 'true'
process.env.FIRESTORE_EMULATOR_HOST
process.env.FIREBASE_STORAGE_EMULATOR_HOST
process.env.FIREBASE_AUTH_EMULATOR_HOST
```

Add `"demo": "node --env-file-if-exists=.env scripts/demo-server.mjs"` to backend scripts. Do not modify
`src/server.js`.

- [ ] **Step 5: Verify GREEN and production isolation**

```bash
node --test test/integration/demo-composition.test.js test/integration/composition.test.js
npm test
```

Expected: all pass, production route inventory unchanged.

- [ ] **Step 6: Commit**

```bash
git add services/backend/src/demo services/backend/scripts/demo-server.mjs services/backend/test/integration/demo-composition.test.js services/backend/package.json
git commit -m "feat(demo): add isolated real-data composition"
```

---

### Task 4: Frontend Live Client and Honest Bootstrap

**Files:**
- Create: `design-lab/prototypes-vanilla/src/data/demo-client.js`
- Create: `design-lab/prototypes-vanilla/src/data/live-hydrator.js`
- Create: `design-lab/prototypes-vanilla/src/data/runtime.js`
- Create: `design-lab/prototypes-vanilla/tests/unit/live-data.test.js`
- Modify: `design-lab/prototypes-vanilla/src/app.js`
- Modify: `design-lab/prototypes-vanilla/src/store.js`
- Modify: `design-lab/prototypes-vanilla/package.json`

**Interfaces:**
- Consumes: demo snapshot and Firebase Emulator configuration.
- Produces: `createDemoClient(config)`, `hydrateLiveCollections(snapshot)` and explicit boot state.

- [ ] **Step 1: Write failing live-data tests**

Tests must prove:

```js
test('live mode never silently returns fixture data after a failed bootstrap', async () => {
  await assert.rejects(() => bootstrapLiveData({ fetchSnapshot: async () => { throw new Error('offline'); } }));
  assert.equal(runtimeState.status, 'error');
});

test('hydration changes world counts and fragment identities from the snapshot', () => {
  hydrateLiveCollections(snapshotWith(['frag_real_1', 'frag_real_2']));
  assert.deepEqual(fragments.map(({ id }) => id), ['frag_real_1', 'frag_real_2']);
  assert.equal(world.totalFragments, 2);
});
```

Also assert original/thumbnail Storage paths remain paths until resolved by the client and that particle inputs use
the changed arrays.

- [ ] **Step 2: Verify RED**

```bash
node --test tests/unit/live-data.test.js
```

Expected: module-not-found for `src/data/runtime.js`.

- [ ] **Step 3: Implement client, hydrator and boot state**

`createDemoClient` exposes:

```js
{
  signIn(),
  createImportBatch(items),
  uploadOriginal(upload, file, onProgress),
  finalizeUpload(batchId, fragmentId),
  getReceipt(batchId),
  getSnapshot(),
  saveInboxDecision(itemId, decision),
  askElse(question, scope),
  reset()
}
```

Use Firebase Web SDK only for anonymous Auth Emulator and Storage Emulator. HTTP calls carry the current ID token
and the fixed demo header. `runtime.js` chooses fixture mode only when `VITE_ELSEWHERE_DATA_MODE !== 'live'`.

- [ ] **Step 4: Bootstrap before the first core render**

In `app.js`, live mode must render a minimal “正在连接你的记忆空间” shell, await `signIn()` and `getSnapshot()`,
hydrate, then construct/render the existing shell. On failure render a setup error with no world/city counts.

- [ ] **Step 5: Verify GREEN and build**

```bash
npm test
npm run build
```

Expected: all frontend unit tests pass and build succeeds.

- [ ] **Step 6: Commit**

```bash
git add design-lab/prototypes-vanilla/src/data design-lab/prototypes-vanilla/src/app.js design-lab/prototypes-vanilla/src/store.js design-lab/prototypes-vanilla/tests/unit/live-data.test.js design-lab/prototypes-vanilla/package.json design-lab/prototypes-vanilla/package-lock.json
git commit -m "feat(demo): hydrate core views from live data"
```

---

### Task 5: Real Import, Processing and Receipt UI

**Files:**
- Modify: `design-lab/prototypes-vanilla/src/pages/fragments.js`
- Modify: `design-lab/prototypes-vanilla/src/controllers/action-controller.js`
- Modify: `design-lab/prototypes-vanilla/src/store.js`
- Modify: `design-lab/prototypes-vanilla/src/styles/pages.css`
- Create: `design-lab/prototypes-vanilla/tests/unit/live-import.test.js`

**Interfaces:**
- Consumes: `state.runtime.client`, selected File objects and live ImportBatch responses.
- Produces: real import state machine `idle → selected → uploading → processing → complete|partial|failed`.

- [ ] **Step 1: Write failing import state tests**

Assert file policy classification, source descriptor creation from real `File` fields, batch creation before upload,
per-item progress, finalize only after upload success, partial failure preservation, receipt polling and navigation only
after a real batch ID exists.

- [ ] **Step 2: Verify RED**

```bash
node --test tests/unit/live-import.test.js
```

Expected: no live import actions or state transitions.

- [ ] **Step 3: Implement minimal import actions and UI**

The import page must contain an actual input:

```html
<input data-live-files type="file" accept="image/jpeg,image/png,image/webp,text/plain" multiple>
```

The primary action calls one controller method that creates the batch, uploads each file to its server-issued path,
finalizes each upload, refreshes snapshot/receipt and navigates to the real receipt route. Fixture mode retains the
existing visual-only behavior for visual regression tests.

- [ ] **Step 4: Verify GREEN and build**

```bash
npm test
npm run build
```

Expected: all tests pass; import page contains a real file input in live mode.

- [ ] **Step 5: Commit**

```bash
git add design-lab/prototypes-vanilla/src/pages/fragments.js design-lab/prototypes-vanilla/src/controllers/action-controller.js design-lab/prototypes-vanilla/src/store.js design-lab/prototypes-vanilla/src/styles/pages.css design-lab/prototypes-vanilla/tests/unit/live-import.test.js
git commit -m "feat(demo): import and process real originals"
```

---

### Task 6: Source-Grounded Gemini Else

**Files:**
- Create: `services/backend/src/demo/else.js`
- Create: `services/backend/test/unit/demo-else.test.js`
- Modify: `services/backend/src/demo/routes.js`
- Modify: `design-lab/prototypes-vanilla/src/controllers/action-controller.js`
- Modify: `design-lab/prototypes-vanilla/src/overlays/else-sheet.js`
- Modify: `design-lab/prototypes-vanilla/tests/unit/else.test.js`

**Interfaces:**
- Consumes: question, scope and current owner snapshot.
- Produces: `createDemoElse({ generateContent, modelAlias })` with `ask({ question, scope, snapshot })`.

- [ ] **Step 1: Write failing backend source-gate tests**

Assert one model call, evidence before interpretation, unknown source removal, explicit uncertainty, exactly one next
step, missing-key unavailable response and no raw provider error leakage.

- [ ] **Step 2: Verify RED**

```bash
node --test test/unit/demo-else.test.js
```

Expected: module-not-found for `src/demo/else.js`.

- [ ] **Step 3: Implement one-call Gemini adapter**

The model must return JSON matching:

```js
{
  answer: 'string',
  sourceIds: ['persisted-fragment-id'],
  uncertainty: 'string|null',
  nextStep: { label: 'string', href: '#/...' }
}
```

Build the allowed source set from snapshot Fragments/Discoveries, validate every returned ID and expose only safe
errors. Use `GEMINI_API_KEY` and `ELSE_MODEL_FAST`; do not hard-code a model ID in business logic.

- [ ] **Step 4: Replace the frontend timer answer only in live mode**

`action-controller.js` calls `state.runtime.client.askElse`; fixture mode continues using `answerElse` for existing
visual tests. Preserve reading/found/uncertain/conflict orb states and open returned sources through Fragment Lens.

- [ ] **Step 5: Verify GREEN**

```bash
node --test test/unit/demo-else.test.js
npm test
```

Run the second command in the frontend directory as well. Expected: both suites pass.

- [ ] **Step 6: Commit**

```bash
git add services/backend/src/demo/else.js services/backend/src/demo/routes.js services/backend/test/unit/demo-else.test.js design-lab/prototypes-vanilla/src/controllers/action-controller.js design-lab/prototypes-vanilla/src/overlays/else-sheet.js design-lab/prototypes-vanilla/tests/unit/else.test.js
git commit -m "feat(demo): answer Else from persisted sources"
```

---

### Task 7: End-to-End Demo Runner and Recording Gate

**Files:**
- Create: `scripts/run-competition-demo.mjs`
- Create: `design-lab/prototypes-vanilla/tests/e2e/competition-demo.spec.js`
- Create: `demo-data/bangkok/manifest.json`
- Create: `docs/demo/2026-07-19-recording-runbook.md`
- Modify: `README.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: local demo source files supplied under ignored `demo-data/bangkok/originals/` and environment values.
- Produces: one command that starts Emulators, demo backend and frontend, resets owner data and verifies readiness.

- [ ] **Step 1: Write failing Playwright path**

The test must select the source pack through the real file input and assert:

```text
receipt saved count > 0
world count equals snapshot count
selected original appears in Fragment Field and Lens
one connection source opens
one Discovery lists three persisted IDs
Else returns at least one valid persisted source
```

- [ ] **Step 2: Verify RED**

```bash
npx playwright test tests/e2e/competition-demo.spec.js
```

Expected: demo runner/config missing.

- [ ] **Step 3: Implement runner and reset**

The runner starts Firebase Emulators with the existing config, backend demo script and Vite with
`VITE_ELSEWHERE_DATA_MODE=live`. It waits for health/readiness, prints only local URLs and PIDs, and terminates all
children on SIGINT/SIGTERM/exit. It must not print credentials.

- [ ] **Step 4: Document exact recording sequence**

The runbook contains prerequisites, environment file locations, one start command, one reset command, expected
screen-by-screen facts, fallback for a failed external provider and a final “no fixture” verification checklist.

- [ ] **Step 5: Full verification**

```bash
npm test
npm run test:emulator
npm run build
npx playwright test tests/e2e/competition-demo.spec.js
git diff --check
```

Run backend commands in `services/backend` and frontend commands in `design-lab/prototypes-vanilla`.
Expected: all required tests pass, live E2E completes and no whitespace errors remain.

- [ ] **Step 6: Commit**

```bash
git add scripts/run-competition-demo.mjs design-lab/prototypes-vanilla/tests/e2e/competition-demo.spec.js demo-data/bangkok/manifest.json docs/demo/2026-07-19-recording-runbook.md README.md .gitignore
git commit -m "test(demo): verify the competition recording path"
```

## Final Stop

After Task 7, do not start vector search, cross-trip inference, production deployment or non-core page work. Report
which external provider smokes were actually executed, which were blocked by credentials, the exact successful
recording command and the latest commit list.
