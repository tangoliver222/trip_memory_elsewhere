# Real Product Operation Boundary TDD Implementation Plan

> Execute strict RED -> GREEN -> REFACTOR. Do not add runtime dependencies.

**Goal:** Connect all data-changing frontend actions to authenticated Firestore/Storage/Vertex
capabilities while keeping UI-only actions local and explicit.

**Architecture:** Add one bounded owner-state repository and experience service to the existing
Fastify API composition. Extend the frontend cloud client and action controller to call those
routes, hydrate returned owner state, and surface pending/failure states. Reuse existing Firebase,
Zod, deterministic projection, and Playwright dependencies.

---

## Phase 1 — Backend contracts (RED)

**Add:**

- `services/backend/test/integration/experience-api.test.js`
- `services/backend/test/unit/experience-service.test.js`

**Modify:**

- `services/backend/test/integration/composition.test.js`

Write failing tests for:

- authenticated `GET /v1/experience-snapshot`;
- strict review, connection, discovery, note, setting, and journey-exclusion mutations;
- verified uid winning over forged owner fields;
- auth failure preventing service/repository execution;
- stable server request IDs and redacted failures;
- idempotent explicit mutations and bounded input;
- production composition containing no `/demo/v1/*` route.

**Verify RED:**

```bash
npm --prefix services/backend test -- --test-name-pattern='experience|API composition'
```

Expected failure: route/service modules do not exist or routes return 404.

**Commit:** `test(experience): define real product operation contracts`

## Phase 2 — Backend service and Firestore state (GREEN/REFACTOR)

**Add:**

- `services/backend/src/experience/schemas.js`
- `services/backend/src/experience/service.js`
- `services/backend/src/experience/routes.js`
- `services/backend/src/experience/firestore-state.js`

**Modify:**

- `services/backend/src/composition/api.js`
- `services/backend/src/composition/runtime.js`
- `services/backend/test/emulator/experience-state.emulator.test.js`
- `services/backend/package.json` (test command only if required; no dependency changes)

Minimum implementation:

- strict schemas and stable route errors;
- one owner-scoped transactional state document;
- server clock and monotonic revision;
- deterministic experience projection composed from existing memory reader;
- explicit idempotent mutation methods;
- journey exclusion stored as a view-level tombstone, not byte deletion.

**Verify:**

```bash
npm --prefix services/backend test -- --test-name-pattern='experience|API composition'
npm --prefix services/backend run test:emulator
git diff --check
```

**Commits:**

- `feat(experience): add owner-scoped operation service`
- `test(experience): verify Firestore persistence boundary`

## Phase 3 — Frontend remote action contracts (RED)

**Add:**

- `design-lab/prototypes-vanilla/tests/unit/live-operations.test.js`

**Modify:**

- `design-lab/prototypes-vanilla/tests/unit/action-contracts.test.js`
- `design-lab/prototypes-vanilla/tests/unit/demo-client.test.js`

Write failing tests proving:

- cloud Else uses `/v1/else/ask`;
- cloud snapshot uses `/v1/experience-snapshot`;
- each owner mutation uses the expected `/v1/experience/...` endpoint;
- fixture mode does not perform remote calls;
- remote rejection never dispatches a success action;
- every rendered button belongs to the documented UI/device/owner/Google operation set.

**Verify RED:**

```bash
npm --prefix design-lab/prototypes-vanilla test
```

**Commit:** `test(frontend): define live operation wiring contracts`

## Phase 4 — Frontend wiring (GREEN/REFACTOR)

**Modify:**

- `design-lab/prototypes-vanilla/src/data/demo-client.js`
- `design-lab/prototypes-vanilla/src/data/runtime.js`
- `design-lab/prototypes-vanilla/src/controllers/action-controller.js`
- `design-lab/prototypes-vanilla/src/store.js`
- `design-lab/prototypes-vanilla/src/app.js`
- `design-lab/prototypes-vanilla/src/pages/fragments.js`
- `design-lab/prototypes-vanilla/src/pages/explore.js`
- `design-lab/prototypes-vanilla/src/pages/discover.js`
- `design-lab/prototypes-vanilla/src/pages/me.js`
- `design-lab/prototypes-vanilla/src/overlays/delete-confirmation.js`
- `design-lab/prototypes-vanilla/src/styles/components.css` only if a minimal operation status style
  is needed.

Minimum implementation:

- cloud endpoint selection is production-only;
- hydrate persisted state after boot/refresh;
- pending/error state per mutation;
- save success only after server confirmation;
- note and setting actions carry explicit object IDs/keys;
- journey removal copy matches persisted exclusion semantics;
- no fixture/demo fallback in live cloud mode.

**Verify:**

```bash
npm --prefix design-lab/prototypes-vanilla test
npm --prefix design-lab/prototypes-vanilla run build:hosting
git diff --check
```

**Commit:** `feat(frontend): connect product actions to authenticated services`

## Phase 5 — Cross-layer adversarial verification

**Add/modify:**

- `design-lab/prototypes-vanilla/tests/e2e/real-operations.spec.js`
- `docs/demo/2026-07-21-real-operation-adversarial-audit.md`

Run one local emulator stack and a browser against live data. Inventory buttons on every route,
then exercise at least:

- wrong/missing App Check;
- server 503 on mutation;
- duplicate click;
- refresh after persistence;
- empty owner;
- real upload;
- real Else answer or explicit provider/budget failure;
- no `/demo/v1/*` request in cloud build;
- no console errors, broken navigation, or silent buttons.

**Verify:**

```bash
npm --prefix services/backend test
npm --prefix services/backend run test:emulator
npm --prefix design-lab/prototypes-vanilla test
npm --prefix design-lab/prototypes-vanilla run test:e2e
git diff --check
```

**Commit:** `test(integration): audit real product operations adversarially`

## Phase 6 — Deploy and public smoke

Build and deploy the shared backend image/API revision, then Firebase Hosting. Verify Cloud Run,
Hosting rewrites, Auth/App Check, Firestore state persistence, Storage upload, and Vertex Else.

**Verify:**

```bash
scripts/deploy-google-cloud-services.sh
npm run build:firebase-hosting
npx firebase-tools deploy --project elsewhere-memory-tyx-2026 --config firebase/firebase.json --only hosting
ELSEWHERE_PUBLIC_URL=https://elsewhere-memory-tyx-2026.web.app \
  npm --prefix design-lab/prototypes-vanilla run test:e2e
```

**Commit:** `docs(integration): record deployed operation verification`

Do not claim completion unless the immediately preceding commands actually passed and the public
network trace contains production `/v1` routes only.
