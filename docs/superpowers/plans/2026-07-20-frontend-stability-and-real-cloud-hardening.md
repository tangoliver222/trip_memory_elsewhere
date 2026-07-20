# Elsewhere Frontend Stability and Real Cloud Hardening Plan

> **Execution note:** This plan is executed inline in the current Codex task. The repository owner requested autonomous progress and a separate Git commit for each editing stage.

**Goal:** Remove the remaining recording-visible layout failures, publish the verified frontend, then audit and harden the already deployed Firebase/Google Cloud data path with real-cloud evidence.

**Architecture:** Keep the frozen World and City visual language. Add measurable mobile collision contracts around the existing DOM/WebGL composition, fix only the offending responsive constraints, and preserve one persistent `MemorySceneManager`. After the frontend gate is green, verify the existing `elsewhere-api`, ingestion, capability worker, Firestore, Storage, Eventarc, Cloud Tasks, Document AI, and Gemini composition before implementing any missing production wiring.

**Tech Stack:** Vanilla JavaScript, CSS, Three.js, GSAP, Vite, Playwright, Fastify, Firebase Auth/App Check/Firestore/Storage/Hosting, Cloud Run, Eventarc, Cloud Tasks, Document AI, Gemini.

## Success criteria

- At 390x844 and 430x932, recording-critical pages contain no mojibake, unresolved values, horizontal overflow, broken image, or collision between protected copy/actions and the fixed navigation.
- Fragment Field captions remain readable and do not stack over unrelated originals.
- Discover Home and Discover Detail preserve evidence-first sequencing without title/evidence collisions; stable screenshots wait for `window.__ELSEWHERE_VISUAL_READY__`.
- World/City particles remain in the same visual coordinate system as their semantic content during scroll, route change, resize, and data-count changes.
- Frontend unit tests, full mobile route tests, recording visual tests, performance tests, and production build pass before Hosting deployment.
- Cloud services and data stores are assessed from live commands. A real authenticated import is accepted only if Storage, deterministic facts, RoutePlan, approved capability execution, persisted projection, and sourced Else response can be observed.
- Secrets remain in ignored environment files or Google secret/config systems; commands and documentation record names and results, never values.

## Phase 1 - Define the missing visual collision contracts

**Files:**

- Modify: `design-lab/prototypes-vanilla/tests/e2e/recording-visual.spec.js`
- Modify: `design-lab/prototypes-vanilla/tests/e2e/helpers.js`
- Create: `docs/demo/2026-07-20-frontend-visual-defect-audit.md`

**RED:**

1. Measure protected text/action rectangles against `.app-navigation` and the visible viewport.
2. Measure Fragment Field readable captions against unrelated field-node rectangles.
3. Measure Discover featured title/action against the evidence cluster.
4. Capture stable frames only after `__ELSEWHERE_VISUAL_READY__`.

**Verify RED:**

```bash
cd design-lab/prototypes-vanilla
npx playwright test -c playwright.recording.config.js
```

Expected failure: current City summary/action, Fragment Field captions, or Discover featured copy intersects a protected region in at least one phone viewport.

**Commit:** `test(frontend): define mobile visual collision contracts`

## Phase 2 - Apply the minimum responsive fixes

**Files:**

- Modify: `design-lab/prototypes-vanilla/src/styles/pages.css`
- Modify if the contract requires semantic hooks: `design-lab/prototypes-vanilla/src/pages/fragments.js`
- Modify if the contract requires semantic hooks: `design-lab/prototypes-vanilla/src/pages/discover.js`
- Modify only if particle bounds are incorrect: `design-lab/prototypes-vanilla/src/visual/particle-targets.js`

**GREEN:**

1. Bound mobile field-node captions to their own visual tile and remove redundant receipt overlays.
2. Reserve explicit copy/action bands outside the Discover evidence field.
3. Give City summary/action enough scroll clearance above the persistent navigation and Else orb.
4. Do not change desktop composition or frozen World/City fixture data.

**Verify:**

```bash
cd design-lab/prototypes-vanilla
npm test
npx playwright test tests/e2e/routes.spec.js tests/e2e/performance.spec.js --project=mobile-390 --project=mobile-430
npx playwright test -c playwright.recording.config.js
npm run build
git diff --check
```

**Commit:** `fix(frontend): prevent mobile memory layout collisions`

## Phase 3 - Publish and verify the frontend

**Files:**

- Modify only if evidence changes: `docs/demo/2026-07-20-competition-delivery.md`

**Steps:**

1. Run the production hosting preparation command.
2. Deploy Hosting to `elsewhere-memory-tyx-2026`.
3. Run `playwright.public.config.js` against the public URL.
4. Record the deployed bundle identity and test results without secrets.

**Verify:**

```bash
npm run prepare:firebase-hosting
firebase deploy --project elsewhere-memory-tyx-2026 --only hosting
cd design-lab/prototypes-vanilla
ELSEWHERE_PUBLIC_URL=https://elsewhere-memory-tyx-2026.web.app npx playwright test -c playwright.public.config.js
```

**Commit:** `docs(deploy): record verified frontend stability release`

## Phase 4 - Audit the real Google data path

**Files:**

- Inspect: `cloudbuild.yaml`
- Inspect: `scripts/deploy-google-cloud-services.sh`
- Inspect: `services/backend/src/composition/api.js`
- Inspect: `services/backend/src/composition/ingestion.js`
- Inspect: `services/backend/src/composition/capability-worker.js`
- Inspect: `services/backend/src/demo/projection.js`
- Inspect: `firebase/firestore.rules`
- Inspect: `firebase/storage.rules`
- Create: `docs/demo/2026-07-20-real-cloud-audit.md`

**Steps:**

1. Verify active project/account names, Cloud Run revisions and service identities, queue, Eventarc trigger, Firestore database, Storage bucket, Hosting, and enabled APIs.
2. Verify only environment variable presence and deployment wiring; never print values.
3. Run backend ordinary tests and the Auth/Firestore/Storage Emulator suite.
4. Run readiness and IAM smoke checks against each deployed service.
5. Classify each capability as `real-cloud verified`, `emulator verified`, `implemented not deployed`, or `missing`.

**Verify:**

```bash
cd services/backend
npm test
npm run test:emulator
cd ../..
gcloud run services list --project elsewhere-memory-tyx-2026 --region asia-southeast1
gcloud tasks queues describe elsewhere-capabilities --project elsewhere-memory-tyx-2026 --location asia-southeast1
gcloud eventarc triggers list --project elsewhere-memory-tyx-2026 --location asia-southeast1
git diff --check
```

**Commit:** `docs(cloud): audit real Elsewhere data path`

## Phase 5 - Harden only confirmed backend gaps

**Files:** Exact files are selected from Phase 4 evidence; no speculative endpoint is added.

**TDD loop for each gap:**

1. Add the smallest failing unit, integration, contract, rules, or Emulator test.
2. Run it and confirm the failure is caused by the missing behavior.
3. Implement the minimum production change.
4. Run the focused test, relevant full suite, and `git diff --check`.
5. Commit the gap separately as `fix(<area>): <verified behavior>`.

**Constraints:**

- No new production business endpoint unless the real frontend flow requires it.
- No paid capability may bypass the current approved RoutePlan and Budget Gate.
- No fixture fallback in cloud mode.
- No secret value in Git, logs, screenshots, or documentation.
- No unrelated refactor.

## Phase 6 - Real vertical-slice verification and deployment

**Files:**

- Modify only as needed: `scripts/run-google-cloud-demo.mjs`
- Modify only as needed: `design-lab/prototypes-vanilla/tests/e2e/google-cloud-demo.spec.js`
- Modify: `docs/demo/2026-07-20-real-cloud-audit.md`

**Steps:**

1. Build and deploy only services changed in Phase 5.
2. Execute one bounded real-owner import using the project-owned Bangkok demo originals.
3. Verify persisted batch, fragments, deterministic results, current RoutePlan, capability result, projection, and a Gemini answer with a valid source reference.
4. Clean only the generated test owner/data through the existing cleanup path.
5. Re-run frontend public tests, backend tests, Emulator tests, and the guarded real-cloud test.

**Commit:** `test(cloud): verify production Elsewhere vertical slice`

