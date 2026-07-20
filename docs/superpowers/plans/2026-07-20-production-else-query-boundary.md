# Production Else Query Boundary TDD Plan

> **Execution note:** Execute in the current isolated worktree with a separate Git commit for each RED, GREEN, deployment-evidence, and documentation stage.

**Goal:** Add a production, owner-scoped Else query boundary backed by persisted memory evidence and Vertex AI while enforcing a hard Firestore budget before every model call.

**Architecture:** The production API loads the authenticated owner's bounded `MemorySnapshot`, compiles a source allowlist, and returns a deterministic answer without a model when evidence is empty. Non-empty queries must atomically reserve both an owner/day and project/day query slot before calling Vertex AI. Model output is strict JSON; invented source IDs are discarded. The boundary is independent from Module 4.5 fragment capability routing: it never mutates RoutePlan or silently starts ingestion capabilities.

**Production model:** `gemini-2.5-flash` through Vertex AI in `global`. Google documents it as a GA Vertex quickstart model; its current retirement date is after the competition delivery window. No API key is uploaded.

## Frozen scope

- `POST /v1/else/ask` with strict `{ question, scope }` JSON.
- Scope types: `world`, `fragments`, and `fragment` only. Unknown types and extra fields are rejected.
- Direct answer, verified sources, uncertainty, optional next action, scope label.
- Maximum 500 question characters and maximum 40 evidence lines.
- Owner daily limit: 10 model calls.
- Project daily limit: 100 model calls.
- Budget reservation is consumed before provider invocation and is not refunded on provider failure.
- Empty evidence returns an honest, zero-cost uncertain answer.
- No SSE, conversation persistence, tools, write actions, Places, Embedding, Agent Engine, or production Bangkok discovery projection.

## Phase 1 - Define evidence and route contracts (RED)

**Create:**

- `services/backend/test/unit/else-production-service.test.js`
- `services/backend/test/integration/else-production-api.test.js`

**Tests:**

1. The verified uid, never a body/query owner, selects the snapshot.
2. Evidence exposes only safe persisted fields and a 40-source allowlist.
3. Empty evidence does not reserve budget or call a provider.
4. A non-empty query reserves budget before provider invocation.
5. Invented/duplicate provider source IDs are removed.
6. Invalid request, exhausted budget, provider failure, and internal failure use stable redacted errors with server `request.id`.
7. Auth/App Check failures occur before snapshot, budget, or provider work.

**Verify RED:**

```bash
cd services/backend
node --test test/unit/else-production-service.test.js test/integration/else-production-api.test.js
```

Expected: the production Else modules and route are absent.

**Commit:** `test(else): define production query boundary`

## Phase 2 - Implement evidence, provider port, and route (GREEN)

**Create:**

- `services/backend/src/else/evidence.js`
- `services/backend/src/else/service.js`
- `services/backend/src/else/routes.js`
- `services/backend/src/else/gemini-provider.js`

**Modify:**

- `services/backend/src/composition/api.js`
- `services/backend/src/demo/else-service.js` only to reuse the neutral provider adapter if duplication would otherwise remain

**Implementation:**

1. Compile bounded evidence from `MemorySnapshot` only.
2. Validate strict structured provider output.
3. Validate all returned source IDs against the server allowlist.
4. Register the route only when the production composition supplies the service.

**Verify:** focused tests, `npm test`, `git diff --check`.

**Commit:** `feat(else): add sourced production query service`

## Phase 3 - Add the atomic Firestore query budget

**Create:**

- `services/backend/src/else/firestore-budget.js`
- `services/backend/test/unit/else-query-budget.test.js`
- `services/backend/test/emulator/else-query-budget.emulator.test.js`

**Modify:**

- `services/backend/package.json` to include the Emulator test in the existing command.

**Tests:**

1. One transaction increments owner/day and project/day ledgers together.
2. Concurrent claims never exceed either limit.
3. Exhaustion writes neither ledger.
4. Ledger IDs are UTC-day bounded and contain no question or source content.
5. Other owners cannot read or mutate ledgers through Firestore Rules.

**Commit:** `feat(else): enforce daily Vertex query budgets`

## Phase 4 - Wire Vertex-only production runtime

**Modify:**

- `services/backend/src/config.js`
- `services/backend/src/composition/runtime.js`
- `services/backend/test/unit/config.test.js`
- `services/backend/test/integration/composition.test.js`
- `scripts/deploy-google-cloud-services.sh`

**Rules:**

- Production Else requires `GOOGLE_GENAI_USE_VERTEXAI=true`, project, location, and model.
- API runtime receives `roles/aiplatform.user`; ingestion and worker do not.
- `aiplatform.googleapis.com` is enabled by the deployment script.
- The provider is created only in the API composition root.
- No `GEMINI_API_KEY` enters Cloud Run environment or build logs.

**Commit:** `feat(else): wire budgeted Vertex query runtime`

## Phase 5 - Deploy and verify the real owner path

**Modify:**

- `services/backend/scripts/cloud-run-ingestion-smoke.mjs`
- `docs/demo/2026-07-20-real-cloud-audit.md`
- `docs/implementation/else-ai-service-v1.md`

**Real verification:**

1. Create one anonymous real Firebase owner.
2. Upload and process one owned original.
3. Read the production snapshot.
4. Ask Else one question and verify at least one returned source ID belongs to the snapshot.
5. Verify the owner and project budget ledgers increment once.
6. Clean only the smoke owner. Keep the project/day aggregate ledger as auditable cost evidence.

**Commands:**

```bash
npm --prefix services/backend test
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH npm --prefix services/backend run test:emulator
scripts/deploy-google-cloud-services.sh
RUN_REAL_GOOGLE_PROVIDER_TESTS=true npm --prefix services/backend run smoke:cloud-run
git diff --check
```

**Commit:** `test(cloud): verify sourced Vertex Else answer`

## Stop conditions

- Do not deploy if the global budget cannot be enforced atomically.
- Do not deploy if provider output can introduce a source not present in the owner snapshot.
- Do not deploy with an API key or with Vertex permissions on ingestion/worker.
- Do not make the public fixture build claim that its displayed Bangkok relationship came from the generic production snapshot.
