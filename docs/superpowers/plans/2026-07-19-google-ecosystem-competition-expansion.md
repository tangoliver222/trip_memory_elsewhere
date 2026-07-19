# Google Ecosystem Competition Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the fixed Bangkok story on a dedicated Blaze Firebase project with real Auth, App Check, Firestore, Storage, Document AI OCR, and Gemini, then deploy the existing service roots to Cloud Run if the cloud-backed recording gate is green.

**Architecture:** Preserve Module 3–5A and add one development-only cloud-demo composition. Real Firebase originals flow through the existing deterministic processor, authoritative router, scheduler, and OCR worker; a bounded server-only artifact reader projects only normalized OCR facts. The frontend switches explicitly between emulator and cloud infrastructure modes and never silently falls back.

**Tech Stack:** Node.js 22, Fastify 5, Firebase Web/Admin SDK, Firestore, Cloud Storage for Firebase, Firebase App Check, Firebase Hosting, Google Document AI, Gemini via `@google/genai`, Cloud Run, Cloud Tasks, vanilla JavaScript, Vite, Playwright.

## Global Constraints

- Project ID: `elsewhere-memory-tyx-2026`, adding one short suffix only if unavailable.
- Firestore, Storage, Cloud Run, Cloud Tasks, and Document AI: `asia-southeast1`.
- Original save and deterministic routing always precede paid capabilities.
- Document AI executes only a current queued execution from an approved RoutePlan.
- Provider artifacts remain server-private; browser copy excludes internal IDs and paths.
- Emulator literal App Check tokens are invalid in cloud and production modes.
- No new runtime dependency is required for the mandatory cloud-backed layer.
- Existing emulator demo and all current tests remain green.
- Each task ends with its own commit.

---

### Task 1: Provision the dedicated Firebase project

**Files:**
- Create: `.firebaserc`
- Modify: `firebase/firebase.json`
- Create: `design-lab/prototypes-vanilla/.env.cloud.example`
- Modify: `services/backend/.env.example`
- Create: `docs/demo/2026-07-19-google-cloud-setup.md`

**Produces:** Real project, Web App, Anonymous Auth, App Check, Firestore, Storage, Hosting, ADC, and fixed Document AI processor tuple.

- [ ] Verify `elsewhere-memory-tyx-2026` is absent with `firebase projects:list --json`.
- [ ] Create it with `firebase projects:create elsewhere-memory-tyx-2026 --display-name "Elsewhere Memory"`.
- [ ] Pause only while the user links a Cloud Billing account and confirms Blaze.
- [ ] Create one Web App with `firebase apps:create WEB "Elsewhere Web" --project elsewhere-memory-tyx-2026`. Read the generated App ID from `firebase apps:list WEB --project elsewhere-memory-tyx-2026 --json`, assign that exact value to `APP_ID`, then run `firebase apps:sdkconfig WEB "$APP_ID" --project elsewhere-memory-tyx-2026`.
- [ ] Install Google Cloud CLI with `brew install --cask google-cloud-sdk`, then run `gcloud auth login`, `gcloud auth application-default login`, and set project/region.
- [ ] Enable only Firebase, Firestore, Storage, App Check, Document AI, Cloud Run, Cloud Build, Artifact Registry, Cloud Tasks, and Eventarc APIs.
- [ ] Create Firestore Native and the default Storage bucket in `asia-southeast1`; enable Anonymous Auth and register one localhost App Check debug token.
- [ ] Create an Enterprise OCR processor in `asia-southeast1`, pin its enabled version, and record only project/location/processor/version/endpoint in the ignored backend `.env`.
- [ ] Add `.firebaserc`, Hosting config, public frontend example variables, backend example variables, and an exact setup record. Never track ADC, API keys, debug tokens, or payment data.
- [ ] Verify project/apps/database with Firebase CLI and run `git diff --check`.
- [ ] Commit: `chore(cloud): configure Elsewhere Firebase project`.

### Task 2: Add strict frontend Firebase cloud mode

**Files:**
- Modify: `design-lab/prototypes-vanilla/src/data/demo-client.js`
- Modify: `design-lab/prototypes-vanilla/src/data/runtime.js`
- Test: `design-lab/prototypes-vanilla/tests/unit/live-import.test.js`
- Test: `design-lab/prototypes-vanilla/tests/unit/live-data.test.js`

**Produces:** `emulator|cloud` infrastructure mode and real App Check token use in cloud mode.

- [ ] RED: add tests showing cloud mode requires every public Firebase field and App Check site key, returns null Emulator addresses, rejects unknown modes, and preserves current Emulator defaults.
- [ ] Run `node --test tests/unit/live-import.test.js tests/unit/live-data.test.js`; expect failure because infrastructure mode is absent.
- [ ] GREEN: parse `VITE_ELSEWHERE_INFRA_MODE` strictly. Cloud mode must not call `connectAuthEmulator()` or `connectStorageEmulator()` and must obtain App Check tokens through an injected App Check factory. Emulator mode retains the literal local token and does not construct App Check.
- [ ] Run the focused tests, `npm test`, and `npm run build`; expect zero failures.
- [ ] Commit: `feat(cloud): connect the live client to Firebase`.

### Task 3: Add a guarded real-Firebase cloud-demo composition

**Files:**
- Create: `services/backend/scripts/cloud-demo-server.mjs`
- Create: `services/backend/src/demo/cloud-environment.js`
- Modify: `services/backend/src/demo/composition.js`
- Test: `services/backend/test/integration/demo-composition.test.js`
- Test: `services/backend/test/unit/demo-cloud-environment.test.js`

**Produces:** Development-only Fastify composition using real Firebase Admin Auth/App Check, Firestore, Storage, and ADC.

- [ ] RED: test that cloud mode rejects production `NODE_ENV`, `demo-*` project IDs, any Emulator host, missing cloud flag, mismatched bucket, and literal `local-demo-app-check` before handlers.
- [ ] Run `node --test test/integration/demo-composition.test.js test/unit/demo-cloud-environment.test.js`; expect missing-module failures.
- [ ] GREEN: create the strict environment parser and server. Construct `createFirebaseTokenVerifier({ auth, appCheck })`; reuse the existing import service, finalize pipeline, projection, and Gemini service. Do not import Emulator connectors or add routes to production composition.
- [ ] Run focused tests and `npm test`; expect zero failures.
- [ ] Commit: `feat(cloud): add guarded Firebase demo composition`.

### Task 4: Execute approved Document AI work and read artifacts safely

**Files:**
- Create: `services/backend/src/demo/cloud-ocr-coordinator.js`
- Create: `services/backend/src/adapters/firebase-capability-artifact-reader.js`
- Modify: `services/backend/scripts/cloud-demo-server.mjs`
- Modify: `services/backend/src/demo/repository.js`
- Test: `services/backend/test/unit/demo-cloud-ocr-coordinator.test.js`
- Test: `services/backend/test/unit/firebase-capability-artifact-reader.test.js`

**Produces:** `createCloudOcrCoordinator(...).handle({ uid, batchId })` and bounded verified normalized artifact reads.

- [ ] RED coordinator tests: only current queued OCR executions run; stale, supporting, unapproved, already terminal, and repeated inputs do not call the worker. Tasks contain exactly capability execution ID, owner ID, RoutePlan ID/revision, and delivery count zero.
- [ ] RED reader tests: reject wrong owner/path/bucket/generation/content type/size/SHA-256/metadata, malformed gzip, and decompression overflow; accept and deeply freeze one exact normalized artifact.
- [ ] Run both new test files; expect missing-module failures.
- [ ] GREEN coordinator: reload `loadRoutingSnapshot(uid, { batchId })`, join executions to current heads/plans, stable-sort, invoke only `createOcrCapabilityWorker()`, and reload persisted results before success.
- [ ] GREEN reader: download the specified generation with CRC32C validation, verify compressed SHA-256 and custom metadata, bound gzip decompression, then parse JSON.
- [ ] Wire the existing materializer, Document AI adapter, artifact store, normalizer, authorizer, and worker. Do not fork provider policy or perform an unplanned provider call.
- [ ] Run focused tests, capability worker tests, and `npm test`; expect zero failures.
- [ ] Commit: `feat(ocr): execute approved Document AI work in cloud demo`.

### Task 5: Project and render Google processing provenance

**Files:**
- Modify: `services/backend/src/demo/projection.js`
- Modify: `services/backend/src/demo/routes.js`
- Modify: `design-lab/prototypes-vanilla/src/data/live-hydrator.js`
- Modify: `design-lab/prototypes-vanilla/src/pages/fragments.js`
- Modify: `design-lab/prototypes-vanilla/src/overlays/fragment-lens.js`
- Modify: `design-lab/prototypes-vanilla/src/overlays/else-sheet.js`
- Modify: `design-lab/prototypes-vanilla/src/styles/pages.css`
- Modify: `design-lab/prototypes-vanilla/src/styles/components.css`
- Test: `services/backend/test/unit/demo-projection.test.js`
- Test: `design-lab/prototypes-vanilla/tests/unit/intake.test.js`
- Test: `design-lab/prototypes-vanilla/tests/unit/overlays.test.js`
- Test: `design-lab/prototypes-vanilla/tests/unit/live-else.test.js`

**Produces:** Persisted `processingTrace` and bounded OCR fields on live Fragment/ImportBatch projections.

- [ ] RED backend tests: stage vocabulary is exactly `pending|completed|skipped|unresolved|failed`; merchant/amount/text are absent without a verified normalized artifact and change when it is present; input order is irrelevant.
- [ ] RED frontend tests: processing, receipt, and Lens render persisted stages and provenance but never bucket paths, task IDs, processor IDs, or timer-derived completion. Else states Firebase-backed source scope.
- [ ] Run focused backend/frontend tests; expect missing trace/OCR failures.
- [ ] GREEN backend: project original save, deterministic, routing, OCR, and relationship stages from persisted records only.
- [ ] GREEN frontend: show the compact sequence `Firebase Storage → deterministic facts → Authoritative Router → Google Document AI → Firestore relationship`, preserving current visual composition and evidence-first hierarchy.
- [ ] Run focused tests, complete frontend tests/build, and backend tests; expect zero failures.
- [ ] Commit: `feat(demo): reveal persisted Google processing provenance`.

### Task 6: Verify the real Google recording path

**Files:**
- Create: `scripts/run-google-cloud-demo.mjs`
- Create: `design-lab/prototypes-vanilla/playwright.google-cloud.config.js`
- Create: `design-lab/prototypes-vanilla/tests/e2e/google-cloud-demo.spec.js`
- Modify: `demo-data/bangkok/manifest.json`
- Replace generated input: `demo-data/bangkok/originals/common-grounds-receipt-2024-10-19.png`
- Modify: `docs/demo/2026-07-19-recording-runbook.md`

**Produces:** One resettable command and one explicit-cost browser gate for real Firebase, Document AI, and Gemini.

- [x] Replace the receipt-labelled coffee photo with a genuinely readable receipt owned by the project. The manifest may contain type/time/GPS but no merchant, amount, or OCR text.
- [x] Write E2E: anonymous cloud sign-in; eight uploads; persisted counts; exactly one OCR execution/result; one OCR field absent from the manifest; World/City/Field/Lens/Discovery; Gemini answer with a valid source; source opens Lens; cleanup deletes only the test owner.
- [x] Guard the test with `RUN_REAL_GOOGLE_PROVIDER_TESTS=true`; otherwise skip rather than fake success.
- [x] Run `RUN_REAL_GOOGLE_PROVIDER_TESTS=true REQUIRE_GEMINI_DEMO=true node scripts/run-google-cloud-demo.mjs --verify`; result on 2026-07-19: `1 passed (1.8m)`, one Document AI request and one Gemini request.
- [x] Run backend ordinary tests, 70-test Emulator suite, frontend tests/build, old emulator demo E2E, new cloud E2E, and `git diff --check`.
- [ ] Commit: `test(cloud): verify Firebase Document AI and Gemini demo`.

### Task 7: Deploy existing service roots to Cloud Run after Task 6 is green

**Files:**
- Create: `scripts/deploy-google-cloud-services.sh`
- Modify: `firebase/firebase.json`
- Create: `docs/demo/2026-07-19-cloud-run-deployment.md`

**Produces:** One image, three services (`api`, `ingestion`, `capability-worker`), one Cloud Tasks queue, Eventarc trigger, and least-privilege identities.

- [ ] Create separate API, ingestion, worker, Eventarc invoker, and task invoker service accounts using only roles frozen in `docs/implementation/capability-execution-ocr-v1.md`.
- [ ] Create Artifact Registry and one Cloud Tasks queue in Singapore.
- [ ] Build one image digest with Cloud Build and deploy all three mutually exclusive service modes with minimum instances zero.
- [ ] Keep API browser-accessible behind Auth/App Check; ingestion allows only Eventarc; worker allows only Cloud Tasks OIDC.
- [ ] Connect Storage finalized Eventarc and Cloud Tasks. Store Gemini key in Secret Manager; ingestion cannot access Gemini/Document AI and worker cannot enqueue Tasks.
- [ ] Build/deploy Hosting with cloud public values and API rewrite, then run health checks and a new-owner import without the local coordinator.
- [ ] If IAM/deployment is not green before recording freeze, retain Task 6 as the verified path and document Cloud Run as not staging-verified.
- [ ] Commit: `chore(cloud): deploy isolated Elsewhere services`.

### Task 8: Freeze recording evidence

**Files:**
- Modify: `docs/demo/2026-07-19-recording-runbook.md`
- Create: `docs/demo/2026-07-19-google-ecosystem-verification.md`

- [ ] Re-run every Task 6 gate after the last change and record fresh counts/timestamps.
- [ ] Separate `real-cloud verified`, `Emulator verified`, `implemented not deployed`, and `excluded` capabilities.
- [ ] Record actual provider calls and expected costs without secrets or user identifiers.
- [ ] Verify clean git status, `git diff --check`, intended Cloud Run services, and intended Tasks queue.
- [ ] Commit: `docs(demo): freeze Google ecosystem recording evidence`.
- [ ] Stop feature work; do not enter Places, Embedding, Agent Engine, external imports, or non-core backend wiring before recording.
