# Authoritative Routing & Budget Gate TDD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Module 4.5 as the deterministic, owner-scoped authority that groups Fragment inputs, selects representatives, compiles immutable per-capability RoutePlans, reserves bounded budgets, and prevents every OCR, Places, Embedding or Gemini execution unless a current approved plan explicitly authorizes it.

**Architecture:** The existing `deterministic-media/v1` terminal result remains frozen and becomes the only automatic trigger. A routing compiler first persists a non-authorizing draft, waits for deterministic batch convergence, then derives bounded thumbnail features, resolves deterministic cohorts, compiles capability intentions and commits plans, heads, reservations and batch routing summary atomically. Memory and Firestore adapters share pure transition functions; a provider-free authorization boundary proves how Module 5 will claim and settle an approved capability without adding any provider implementation.

**Tech Stack:** Node.js `>=22`, ECMAScript modules, Zod `4.4.3`, Fastify `5.10.0`, Firebase Admin `14.1.0`, Firebase Web SDK `12.16.0`, Node `node:test`, existing `sharp` `0.35.3`, Firebase Auth/Firestore/Storage Emulators, Docker/Cloud Run Linux image.

## Global Constraints

- Execute strict RED -> GREEN -> REFACTOR. Every production behavior begins with the smallest test whose failure is caused by the missing behavior.
- Commit every RED contract and corresponding GREEN/REFACTOR separately. Do not amend or collapse the module into one commit.
- Work only in `/Users/tangyixuan/trip_memory_elsewhere/.worktrees/backend-foundation-v1` on branch `codex/backend-foundation-v1`.
- Run unqualified `node`, `npm`, `npx firebase` and `docker` commands from `services/backend`; Git commands may run there because Git resolves the parent worktree.
- Treat `docs/superpowers/specs/2026-07-17-authoritative-routing-budget-gate-design.md` as the frozen implementation authority.
- Do not modify the frozen Module 4 design, plan, implementation evidence, processor identity, task state machine, derivative paths, duplicate ranking or completion rules.
- Do not add runtime or development dependencies. `services/backend/package.json` and `package-lock.json` must remain dependency-identical.
- Module 4.5 must not import or call Document AI, Places, Geocoding, Maps Grounding, Embedding, Gemini, Qwen, ML Kit or another external classifier/provider.
- No new production business endpoint is added. Routing runs only in the ingestion composition after a terminal deterministic outcome.
- RoutePlan processor identity is exactly `routerName=fragment-routing`, `routerVersion=v1`, `policyVersion=v1`, `costModelVersion=v1`, `schemaVersion=1`.
- RoutePlan decisions are exactly `approved|skipped|deferred|blocked`; persisted `needsOCR`, `needsPlaces`, `needsEmbedding`, `needsGemini` and generic `needsAI` fields are forbidden.
- Representative roles are exactly `independent|representative|supporting`. A supporting Fragment remains stored, owner-readable through existing Fragment access, exportable and countable.
- Draft plans authorize nothing. Only a current plan in `approved|executing`, with exact source revision, matching supported versions, an approved capability and valid reservation may be claimed.
- An approved plan's decision payload is immutable. Replanning creates `revision + 1`, atomically moves RoutingHead, and marks the prior current plan `superseded`.
- The automatic revision limit is five per `ownerId + fragmentId + routerName + sourceRevision`; the sixth automatic escalation is rejected without provider execution.
- Each cohort revision contains at most 200 members. Every scan, closure and thumbnail read is bounded and deterministic.
- Module 4.5 reads only the existing generation-pinned maximum-512px WebP derivative. It never reads the original object, creates a derivative, or writes a user-visible semantic fact.
- Low-information v1 is exactly `(mean<=0.02 or mean>=0.98) and variance<=0.0004 and entropy<=0.5` using normalized grayscale values. Sharpness is relative within a cohort only.
- Burst requires photo inputs, reliable timestamps, adjacent delta `<=2s` and total span `<=15s`.
- Same-time-place requires reliable timestamps within `<=10m`, both source location accuracies `<=50m`, and Haversine distance `<=50m`.
- Exact/near/burst result propagation is prohibited except for Executor-declared `content_intrinsic` results with matching input hash, processor/model/prompt versions and privacy scope. Module 4.5 itself does not copy any Module 5 result.
- The current backend has no server-owned user preference/decision store. Automatic v1 plans therefore use `userDecisionVersion=0`; Module 4.5 adds no preference endpoint and rejects an untrusted client-supplied version. A future server-owned preference module must trigger a new plan revision rather than mutate an approved plan.
- Budget currency is `USD`; all amounts are nonnegative integer micros. Approval reserves ceilings, settlement releases the ceiling and charges actual micros, and actual cost may not exceed the reserved ceiling.
- The v1 local admission policy uses versioned constants, not live provider pricing: user UTC-day ceiling `2_000_000`, batch ceiling `1_000_000`, route ceiling `200_000`; OCR `estimated=20_000, ceiling=100_000`, Places `10_000/50_000`, Embedding `1_000/5_000`, Gemini `25_000/100_000`. These are admission ceilings, not vendor price claims; changing one requires `costModelVersion` or `policyVersion` advancement.
- CapabilityExecution does not claim exactly-once provider behavior. A call with no durable provider receipt becomes `billing_uncertain` and is never automatically retried.
- ImportBatch keeps its Module 4 terminal `status`; Module 4.5 adds an independent `routingSummary` and never moves the batch back to processing.
- Repository methods remain owner-scoped and receive `uid` explicitly. Firestore internal routing documents deny all client reads and writes; clients consume only the owner-readable ImportBatch summary.
- Before each implementation commit, run the complete focused tests for that task. Before completion, run ordinary tests, all Emulator tests, dependency audit, Docker Linux smoke and `git diff --check`.
- Stop after Module 4.5 verification and documentation. Do not implement Module 5 provider adapters or proceed to Module 5 without separate authorization.

## File Map and Responsibilities

### New production files

- `services/backend/src/domain/route-plan.js` — strict RoutePlan, RoutingHead and capability-decision schemas plus immutable payload projection.
- `services/backend/src/domain/routing-cohort.js` — bounded cohort schema and representative-role invariants.
- `services/backend/src/domain/routing-execution.js` — BudgetLedger, BudgetReservation, CapabilityExecution and EscalationRequest schemas.
- `services/backend/src/routing/identity.js` — canonical deterministic IDs for plans, heads, cohorts, ledgers, reservations, executions and escalations.
- `services/backend/src/routing/features.js` — pure normalized luminance statistics and low-information classification.
- `services/backend/src/routing/cohorts.js` — exact/near/burst/same-time-place grouping and stable 200-member partitioning.
- `services/backend/src/routing/selector.js` — deterministic primary role and per-capability representative selection.
- `services/backend/src/routing/policy.js` — classification and v1 capability-intent compiler; no external calls.
- `services/backend/src/routing/budget.js` — v1 admission constants and pure reserve/release/settle reducers.
- `services/backend/src/routing/errors.js` — stable routing error codes and retryability.
- `services/backend/src/routing/authorization.js` — provider-free claim/receipt/settlement boundary consumed later by Module 5.
- `services/backend/src/routing/service.js` — draft, convergence, cohort resolution, plan compilation and repository orchestration.
- `services/backend/src/adapters/firebase-thumbnail-reader.js` — allowlisted, generation-pinned, bounded derivative read.
- `services/backend/src/adapters/sharp-routing-feature-reader.js` — Sharp decoding of the bounded derivative and pure feature extraction.
- `services/backend/src/repositories/routing-outcome.js` — pure validation and state transitions shared by Memory and Firestore adapters.
- `docs/implementation/authoritative-routing-v1.md` — implemented contract, runbook and fresh verification evidence.

### New test files

- `services/backend/test/fixtures/routing.js`
- `services/backend/test/unit/routing-domain.test.js`
- `services/backend/test/unit/routing-identity.test.js`
- `services/backend/test/unit/routing-features.test.js`
- `services/backend/test/unit/firebase-thumbnail-reader.test.js`
- `services/backend/test/unit/sharp-routing-feature-reader.test.js`
- `services/backend/test/unit/routing-cohorts.test.js`
- `services/backend/test/unit/routing-selector.test.js`
- `services/backend/test/unit/routing-policy.test.js`
- `services/backend/test/unit/routing-budget.test.js`
- `services/backend/test/unit/routing-authorization.test.js`
- `services/backend/test/unit/routing-service.test.js`
- `services/backend/test/contract/routing-repository.contract.js`
- `services/backend/test/integration/authoritative-routing-app.test.js`
- `services/backend/test/emulator/authoritative-routing.emulator.test.js`

### Existing files modified deliberately

- Domain and fixtures: `services/backend/src/domain/import-batch.js`, `services/backend/src/domain/index.js`, `services/backend/src/imports/service.js`, `services/backend/test/fixtures/import.js`, and only expectations that need the new nullable `routingSummary`.
- Repository ports/adapters: `services/backend/src/repositories/contract.js`, `memory.js`, `firestore.js`, `services/backend/test/contract/memory-repository.test.js`, and `firestore-repository.test.js`.
- Ingestion composition: `services/backend/src/ingestion/pipeline.js`, `composition/ingestion.js`, `composition/runtime.js`, and their focused tests/harnesses.
- Security and verification: `services/backend/test/rules/firestore.rules.test.js`, `services/backend/package.json` test scripts only, `services/backend/README.md`. Existing `firebase/firestore.rules` deny-all fallback already protects new internal collections and is verified without modification.
- `firebase/firestore.indexes.json` remains unchanged because the repository uses direct document reads and automatically indexed bounded single-field queries.

---

### Task 1: Strict routing domain and batch projection contracts

**Files:**
- Create: `services/backend/test/fixtures/routing.js`
- Create: `services/backend/test/unit/routing-domain.test.js`
- Create: `services/backend/src/domain/route-plan.js`
- Create: `services/backend/src/domain/routing-cohort.js`
- Create: `services/backend/src/domain/routing-execution.js`
- Modify: `services/backend/src/domain/import-batch.js`
- Modify: `services/backend/src/domain/index.js`
- Modify: `services/backend/src/imports/service.js`
- Modify: `services/backend/test/fixtures/import.js`
- Modify: existing Module 3/4 tests only where strict ImportBatch fixtures require `routingSummary:null`

**Interfaces:**
- Produces `parseRoutePlan(input)`, `routePlanImmutablePayload(plan)`, `parseRoutingHead(input)`.
- Produces `parseRoutingCohort(input)`.
- Produces `parseBudgetLedger(input)`, `parseBudgetReservation(input)`, `parseCapabilityExecution(input)`, `parseEscalationRequest(input)`.
- Adds nullable `ImportBatch.routingSummary` without changing `status`, `uploadStatus`, `counters` or `processingSummary` derivation.

- [ ] **Step 1: Write strict failing domain tests**

Create fixtures for one independent photo and assert these exact enums:

```js
assert.deepEqual(ROUTE_PLAN_STATES, [
  'draft', 'approved', 'executing', 'completed', 'superseded', 'rejected',
]);
assert.deepEqual(CAPABILITY_DECISIONS, [
  'approved', 'skipped', 'deferred', 'blocked',
]);
assert.deepEqual(ROUTING_ROLES, [
  'independent', 'representative', 'supporting',
]);
```

Tests must reject unknown keys, generic `needsAI`, every `needsX` field, an approved capability without positive budget, skipped/blocked with budget, deferred without nonempty `reconsiderOn`, duplicate reason codes, unsorted member refs, a cohort over 200 members, supporting without a different representative, a plan revision below one, and `inputHash=null` when any capability is approved. Prove `inputHash=null` is accepted only for a plan whose external capabilities are all blocked or skipped.

Define routing summary as:

```js
routingSummary: null | {
  routerName: 'fragment-routing',
  routerVersion: 'v1',
  policyVersion: 'v1',
  eligible: number,
  drafting: number,
  approved: number,
  blocked: number,
  completed: number,
  superseded: number,
  updatedAt: string,
}
```

`drafting + approved + blocked + completed === eligible`; `superseded` is an independent historical count. Existing ImportBatch state and counters must be identical before and after adding a null or valid routing summary.

- [ ] **Step 2: Run RED and confirm the missing-domain failure**

```bash
cd services/backend
node --test test/unit/routing-domain.test.js test/unit/import-domain.test.js
```

Expected: `ERR_MODULE_NOT_FOUND` for `src/domain/route-plan.js` or missing routing exports. Confirm the failure occurs before any production file is added.

- [ ] **Step 3: Commit the RED contract**

```bash
git add services/backend/test/fixtures/routing.js services/backend/test/fixtures/import.js services/backend/test/unit/routing-domain.test.js services/backend/test/unit/import-domain.test.js
git commit -m "test(routing): define authoritative routing contracts"
```

- [ ] **Step 4: Implement minimum strict schemas**

Persist this RoutePlan shape with exact capability keys `ocr|places|embedding|gemini`:

```js
{
  ...CommonFields,
  fragmentRef: { type: 'fragment', id },
  batchRef: { type: 'importBatch', id },
  sourceRevision: { bucket, objectName, generation, inputHash: sha256OrNull },
  router: {
    name: 'fragment-routing', version: 'v1',
    policyVersion: 'v1', costModelVersion: 'v1',
  },
  revision,
  state,
  inputs: {
    deterministicTaskId,
    deterministicProcessorName: 'deterministic-media',
    deterministicProcessorVersion: 'v1',
    cohortRevisionIds,
    userDecisionVersion,
  },
  classification: { mediaKind, documentKind, confidence, basis },
  representation: { role, representativeRef, cohortRefs, reasonCodes },
  capabilities: { ocr, places, embedding, gemini },
  priority: 'low' | 'normal' | 'high',
  budgetClass: 'deterministic_only' | 'standard',
  routeReasons,
  approvedAt, completedAt, supersededAt, rejectedAt,
}
```

`routePlanImmutablePayload()` returns a frozen projection containing source revision, router versions, inputs, classification, representation, capabilities, priority, budget class and route reasons. Lifecycle timestamps and state are excluded from this projection.

The classification enums are exact: `mediaKind=image|document|text` and `documentKind=null|receipt|ticket|menu|screenshot|pdf`. Capability scope is `self|representative|cohort`. Every reason code matches `^[a-z0-9][a-z0-9-]{1,63}$`; arrays are unique and sorted. Cohort refs and plan refs use local strict typed-reference schemas rather than widening the shared product `ReferenceSchema`.

BudgetLedger is scoped by `user_day|batch|route|capability`, stores ceiling/reserved/spent micros and UTC day where applicable. BudgetReservation stores ledger refs and state `reserved|settled|released|expired`. CapabilityExecution states are exactly `reserved|claimed|calling|provider_succeeded|settling|completed|failed|billing_uncertain`; its optional receipt is strict `{ providerRequestId, usage, actualCostMicros, receivedAt }`, and `resultRef` is null or `{ type:'capabilityResult', id }`. EscalationRequest outcomes are exactly `unsupported|insufficient_input`, and request state is `pending|resolved|rejected` with a nullable `resolvedByPlanRef`.

Initialize every new ImportBatch with `routingSummary:null`. Preserve that field in Module 3 and Module 4 reducers without altering their status/counter logic.

- [ ] **Step 5: Run GREEN and regression**

```bash
node --test test/unit/routing-domain.test.js test/unit/import-domain.test.js test/unit/import-service.test.js test/unit/processing-domain.test.js test/unit/processing-outcome.test.js
npm test
git diff --check
```

Expected: all focused tests and the ordinary suite pass; the frozen deterministic task/result schemas remain unchanged.

- [ ] **Step 6: Commit domain implementation**

```bash
git add services/backend/src/domain/route-plan.js services/backend/src/domain/routing-cohort.js services/backend/src/domain/routing-execution.js services/backend/src/domain/import-batch.js services/backend/src/domain/index.js services/backend/src/imports/service.js services/backend/test/fixtures/import.js services/backend/test/unit/import-domain.test.js services/backend/test/unit/import-service.test.js
git commit -m "feat(routing): add route plan and budget domain"
```

---

### Task 2: Canonical routing identities and revision keys

**Files:**
- Create: `services/backend/test/unit/routing-identity.test.js`
- Create: `services/backend/src/routing/identity.js`

**Interfaces:**
- Produces `makeRoutingHeadId({ ownerId, fragmentId, routerName })`.
- Produces `makeRoutePlanId({ ownerId, fragmentId, routerName, revision })`.
- Produces `makeRoutingCohortId({ ownerId, type, revision, memberRevisionRefs })`.
- Produces `makeBudgetLedgerId(scope)`, `makeBudgetReservationId({ routePlanId, capability })`.
- Produces `makeCapabilityExecutionId({ routePlanId, capability, idempotencyKey })`.
- Produces `makeEscalationRequestId({ fromRoutePlanId, fromCapability, outcome, reasonCodes, requestedCapability })`.

- [ ] **Step 1: Write failing canonical identity tests**

Use fixed inputs and assert:

```js
assert.equal(
  makeRoutingHeadId({
    ownerId: 'user_alpha',
    fragmentId: 'frag_12345678',
    routerName: 'fragment-routing',
  }),
  makeRoutingHeadId({
    ownerId: 'user_alpha',
    fragmentId: 'frag_12345678',
    routerName: 'fragment-routing',
  }),
);
```

Changing source generation must not change RoutingHead ID. Changing revision must change RoutePlan ID. Reordering cohort members and escalation reason codes must not change their IDs; changing any member source revision must change cohort ID. IDs must match `IdSchema`, stay below 128 characters, and must not expose owner ID, Fragment ID, path or reason text.

- [ ] **Step 2: Run RED**

```bash
node --test test/unit/routing-identity.test.js
```

Expected: module-not-found for `src/routing/identity.js`.

- [ ] **Step 3: Commit RED**

```bash
git add services/backend/test/unit/routing-identity.test.js
git commit -m "test(routing): define canonical routing identities"
```

- [ ] **Step 4: Implement length-prefixed identities**

Use `createHash('sha256')` and a canonical encoder that hashes field name, byte length and UTF-8 value. Prefix output by object type:

```js
const digestId = (prefix, fields) => `${prefix}_${digest(fields).slice(0, 32)}`;
```

Sort reason codes and member revision tuples before encoding. Reject unknown scope and capability values before hashing. Do not include `sourceRevision` in RoutingHead ID.

- [ ] **Step 5: Run GREEN and regression**

```bash
node --test test/unit/routing-identity.test.js test/unit/processing-identity.test.js
npm test
git diff --check
```

- [ ] **Step 6: Commit identities**

```bash
git add services/backend/src/routing/identity.js
git commit -m "feat(routing): add canonical routing identities"
```

---

### Task 3: Bounded local thumbnail features

**Files:**
- Create: `services/backend/test/unit/routing-features.test.js`
- Create: `services/backend/test/unit/firebase-thumbnail-reader.test.js`
- Create: `services/backend/test/unit/sharp-routing-feature-reader.test.js`
- Create: `services/backend/src/routing/features.js`
- Create: `services/backend/src/adapters/firebase-thumbnail-reader.js`
- Create: `services/backend/src/adapters/sharp-routing-feature-reader.js`

**Interfaces:**
- Produces `deriveRoutingFeatures({ pixels, width, height })`.
- Produces `createFirebaseThumbnailReader({ storage, allowedBuckets, maxBytes })` with `read(fragment, { signal })`.
- Produces `createSharpRoutingFeatureReader({ thumbnailReader })` with `read(fragment, { signal })`.

- [ ] **Step 1: Write failing pure feature tests**

Generate pixels in test code, never from customer files or network. Assert exact values for uniform black and white, and tolerance `1e-9` for other distributions:

```js
assert.deepEqual(deriveRoutingFeatures({
  pixels: new Uint8Array(64).fill(0), width: 8, height: 8,
}), {
  mean: 0,
  variance: 0,
  entropyBits: 0,
  edgeEnergy: 0,
  exposure: 'under',
  lowInformation: true,
});
```

Cover all-white, checkerboard, low-variance near-black, normal gradient and one-pixel dimensions. Reject non-Uint8Array input, length mismatch, zero dimensions and values outside byte range. Prove a threshold boundary at mean `0.02`, variance `0.0004`, entropy `0.5` is inclusive.

- [ ] **Step 2: Write failing adapter tests**

The Firebase fake must prove: bucket allowlist, derivative path and generation come from `Fragment.derivatives.thumbnail`, metadata content type is `image/webp`, authoritative size is positive and `<=2_097_152`, downloaded bytes do not exceed metadata size, abort stops the stream, and raw Storage errors are not leaked.

The Sharp test creates synthetic PNG/WebP buffers in memory and asserts the adapter decodes to grayscale raw pixels, handles alpha by flattening on white, emits only numeric routing features, never reads `fragment.storage.originalPath`, and never calls a derivative write method.

- [ ] **Step 3: Run RED**

```bash
node --test test/unit/routing-features.test.js test/unit/firebase-thumbnail-reader.test.js test/unit/sharp-routing-feature-reader.test.js
```

Expected: module-not-found for `routing/features.js` and both adapters.

- [ ] **Step 4: Commit RED**

```bash
git add services/backend/test/unit/routing-features.test.js services/backend/test/unit/firebase-thumbnail-reader.test.js services/backend/test/unit/sharp-routing-feature-reader.test.js
git commit -m "test(routing): define bounded local image features"
```

- [ ] **Step 5: Implement minimal bounded readers and math**

`deriveRoutingFeatures()` uses 256 grayscale bins, normalized mean/variance, Shannon entropy and normalized neighbor energy:

```js
edgeEnergy = sum(abs(p[x,y] - p[x-1,y]) + abs(p[x,y] - p[x,y-1]))
  / (edgePairCount * 255);
```

Exposure is `under` for mean `<=0.02`, `over` for mean `>=0.98`, otherwise `normal`. Low information applies the frozen three-part threshold.

The thumbnail reader obtains generation-pinned metadata before streaming, enforces `2 MiB`, collects only the already-bounded derivative, verifies returned byte length and generation, and returns a Buffer. The Sharp adapter calls `sharp(buffer, { failOn: 'error', limitInputPixels: 512 * 512 })`, applies `rotate().flatten({ background:'#fff' }).greyscale().raw()`, then calls the pure function. It returns a deeply frozen object.

- [ ] **Step 6: Run GREEN and dependency guard**

```bash
node --test test/unit/routing-features.test.js test/unit/firebase-thumbnail-reader.test.js test/unit/sharp-routing-feature-reader.test.js
npm test
git diff -- services/backend/package.json services/backend/package-lock.json
git diff --check
```

Expected: tests pass and the dependency diff is empty.

- [ ] **Step 7: Commit local features**

```bash
git add services/backend/src/routing/features.js services/backend/src/adapters/firebase-thumbnail-reader.js services/backend/src/adapters/sharp-routing-feature-reader.js
git commit -m "feat(routing): derive bounded thumbnail features"
```

---

### Task 4: Deterministic cohorts and representative selector

**Files:**
- Create: `services/backend/test/unit/routing-cohorts.test.js`
- Create: `services/backend/test/unit/routing-selector.test.js`
- Create: `services/backend/src/routing/cohorts.js`
- Create: `services/backend/src/routing/selector.js`
- Modify: `services/backend/test/fixtures/routing.js`

**Interfaces:**
- Produces `buildRoutingCohorts({ fragments, duplicateCandidates, routerVersion })`.
- Produces `selectRoutingRepresentatives({ fragments, cohorts, features })`.
- Produces `deriveRepresentationForFragment({ fragmentId, cohorts, selections })`.

- [ ] **Step 1: Write failing cohort boundary tests**

Cover exact duplicate canonical grouping, near-candidate input-order invariance, near transitive closure, a chain of 201 members deterministically split at 200, burst at `2s` and `15s`, rejection at `2001ms` or `15001ms`, same-time-place at exactly `10m`, `50m` accuracy and `50m` Haversine distance, and rejection when either source lacks accuracy.

Reliable time v1 is one of:

```text
facts.capturedAt.status in [confirmed, corrected, suggested]
and value.instant is an ISO offset datetime
or source.sourceCreatedAt is an ISO offset datetime
```

Same-time-place accuracy comes only from `source.locationHint.accuracyMeters`; a `facts.geo` value without accuracy cannot qualify. `document_sequence` must not be produced because the current SourceDescriptor has no reliable sequence field.

For near closure, assert every group is sorted by `fragmentId`, every partition is stable, and warning `routing/cohort-truncated` is attached to split revisions.

- [ ] **Step 2: Write failing selector tests**

Assert the exact ranking:

```text
thumbnail complete
non-low-information
exposure normal
higher edgeEnergy
higher original pixel area
fragmentId ASC
```

For 2-4 near/burst photos select one; for 5 or more select two. Exact canonical remains the only representative. Same-time-place produces per-capability representative selection for photo Embedding/Gemini but never suppresses receipt OCR. A Fragment in exact and burst cohorts uses primary suppression priority `exact_duplicate > near_duplicate > burst`; all cohort refs remain recorded.

- [ ] **Step 3: Run RED**

```bash
node --test test/unit/routing-cohorts.test.js test/unit/routing-selector.test.js
```

Expected: module-not-found for `routing/cohorts.js` or `routing/selector.js`.

- [ ] **Step 4: Commit RED**

```bash
git add services/backend/test/fixtures/routing.js services/backend/test/unit/routing-cohorts.test.js services/backend/test/unit/routing-selector.test.js
git commit -m "test(routing): define cohorts and representative selection"
```

- [ ] **Step 5: Implement pure bounded grouping and selection**

Normalize every input through existing domain parsers. Build edges only from accepted deterministic evidence, sort edges and members, then use bounded connected components. For burst and same-time-place, start groups from the earliest timestamp plus `fragmentId` and require every added member to remain within the total-span/distance bounds; do not let pairwise chains extend the group indefinitely.

Return cohort drafts shaped as:

```js
{
  type,
  memberRevisionRefs: [{ fragmentId, generation, inputHash }],
  basisCodes,
  warningCodes,
}
```

The selector returns explicit `representativeRefs` per cohort plus per-capability overrides. It never mutates Fragment, candidate or feature inputs.

- [ ] **Step 6: Run GREEN and randomized order checks**

```bash
node --test test/unit/routing-cohorts.test.js test/unit/routing-selector.test.js
npm test
git diff --check
```

Expected: every permutation fixture yields byte-equivalent JSON output.

- [ ] **Step 7: Commit cohort engine**

```bash
git add services/backend/src/routing/cohorts.js services/backend/src/routing/selector.js
git commit -m "feat(routing): add deterministic cohort selection"
```

---

### Task 5: Capability policy and controlled escalation compiler

**Files:**
- Create: `services/backend/test/unit/routing-policy.test.js`
- Create: `services/backend/src/routing/policy.js`
- Modify: `services/backend/test/fixtures/routing.js`

**Interfaces:**
- Produces `classifyRoutingInput(fragment)`.
- Produces `compileCapabilityIntents({ fragment, representation, features, priorResults, escalation })`.
- Produces frozen `ROUTER_V1`, `POLICY_V1`, `COST_MODEL_V1` identifiers.

- [ ] **Step 1: Write failing classification and policy matrix tests**

Use table-driven cases for photo with reliable GPS/time, photo without context, receipt, ticket, menu, screenshot, text, PDF with unknown page count, exact supporting, near/burst supporting and corrupt/low-information image. Assert exact decisions and reason codes from design section 9.

Classification may use only `Fragment.type`, `technicalMetadata.format`, Source Descriptor and deterministic capability statuses. It must not infer receipt from pixels or text. Confidence is `1` for declared/deterministic classifications and basis names the exact fields used.

Prove:

```js
assert.equal(firstPlan.capabilities.gemini.decision, 'deferred');
assert.deepEqual(firstPlan.capabilities.gemini.reconsiderOn, [
  'ocr-completed', 'ocr-insufficient-input', 'policy-change', 'user-request',
]);
```

An `ocr-completed` event with sufficient structured output compiles Gemini `skipped`; structured merchant/place clues may compile Places `approved` while reliable GPS keeps Places `skipped`. An `ocr-insufficient-input` EscalationRequest may compile Gemini intent `approved` only for declared `receipt|ticket|menu|screenshot`; it is never triggered by an OCR success. Repeated identical escalation input returns the same normalized intent. Revision six is rejected with `routing/revision-limit`.

Assert `priority=low` for supporting-only work, `normal` for automatic independent/representative work and `high` only for a server-authenticated explicit reprocess event. `budgetClass=deterministic_only` when no capability is approved and `standard` otherwise.

- [ ] **Step 2: Run RED**

```bash
node --test test/unit/routing-policy.test.js
```

Expected: module-not-found for `routing/policy.js`.

- [ ] **Step 3: Commit RED**

```bash
git add services/backend/test/fixtures/routing.js services/backend/test/unit/routing-policy.test.js
git commit -m "test(routing): define capability routing policy"
```

- [ ] **Step 4: Implement the pure v1 policy**

Use a frozen rule table, not nested provider calls. Internal intents are:

```js
{
  decision: 'approve' | 'skip' | 'defer' | 'block',
  executorClass: null | 'document-ocr' | 'places-resolution'
    | 'multimodal-embedding' | 'gemini-multimodal',
  scope: 'self' | 'representative' | 'cohort',
  reasonCodes: [],
  reconsiderOn: [],
}
```

The persisted compiler maps intents to the four RoutePlan decisions; only the Budget Gate may turn `approve` into `blocked/budget-limit`. Check the imported module graph in the test by reading `policy.js` and rejecting strings `@google/genai`, `documentai`, `places`, `ml-kit` and outbound network modules.

- [ ] **Step 5: Run GREEN and no-provider scan**

```bash
node --test test/unit/routing-policy.test.js
rg -n "@google/genai|Document AI|ML Kit|fetch\(|https\.request" src/routing src/adapters/sharp-routing-feature-reader.js src/adapters/firebase-thumbnail-reader.js
npm test
git diff --check
```

Expected: tests pass; the scan has no provider/network import in Module 4.5 production files.

- [ ] **Step 6: Commit policy compiler**

```bash
git add services/backend/src/routing/policy.js
git commit -m "feat(routing): compile per-capability decisions"
```

---

### Task 6: Versioned Budget Gate reducers

**Files:**
- Create: `services/backend/test/unit/routing-budget.test.js`
- Create: `services/backend/src/routing/budget.js`

**Interfaces:**
- Produces `ROUTING_BUDGET_POLICY_V1`, `ROUTING_COST_MODEL_V1`.
- Produces `reserveRoutePlanBudget({ ownerId, batchId, routePlan, ledgers, now })`.
- Produces `settleReservation({ reservation, ledgers, actualCostMicros, now })`.
- Produces `releaseReservation({ reservation, ledgers, now, reasonCode })`.

- [ ] **Step 1: Write failing reservation tests**

Assert each approved capability receives its own reservation and each skipped/deferred/blocked capability receives none. Test the user UTC-day, batch, route and capability ceilings independently. Budget exhaustion blocks only the affected capability with `reasonCodes:['budget-limit']`; it never changes Fragment or ImportBatch failure counters.

Prove concurrent-style sequential reservations cannot exceed a ceiling:

```js
const first = reserveRoutePlanBudget(inputA);
const second = reserveRoutePlanBudget({ ...inputB, ledgers: first.ledgers });
assert.ok(second.ledgers.every((ledger) => (
  ledger.reservedMicros + ledger.spentMicros <= ledger.ceilingMicros
)));
```

Settlement requires `actualCostMicros<=ceilingMicros`, subtracts the full reserved ceiling, adds actual cost exactly once and returns duplicate on a second identical settlement. Release subtracts the ceiling without spent cost. Different actual cost on a completed reservation is a conflict. UTC day IDs must be deterministic at `23:59:59Z` and `00:00:00Z`.

- [ ] **Step 2: Run RED**

```bash
node --test test/unit/routing-budget.test.js
```

Expected: module-not-found for `routing/budget.js`.

- [ ] **Step 3: Commit RED**

```bash
git add services/backend/test/unit/routing-budget.test.js
git commit -m "test(routing): define budget admission and settlement"
```

- [ ] **Step 4: Implement pure micros accounting**

Freeze the constants from Global Constraints. `reserveRoutePlanBudget()` processes capabilities in `ocr,places,embedding,gemini` order, checks all ledgers before applying each reservation, and returns:

```js
{
  routePlan,
  reservations,
  ledgers,
  blockedCapabilities,
}
```

It changes only a capability that had an internal approve intent; other decisions remain byte-identical. All arithmetic uses safe integers and rejects any result above `Number.MAX_SAFE_INTEGER`.

- [ ] **Step 5: Run GREEN and regression**

```bash
node --test test/unit/routing-budget.test.js test/unit/routing-domain.test.js
npm test
git diff --check
```

- [ ] **Step 6: Commit Budget Gate**

```bash
git add services/backend/src/routing/budget.js
git commit -m "feat(routing): add versioned budget gate"
```

---

### Task 7: Shared routing repository contract and Memory adapter

**Files:**
- Create: `services/backend/test/contract/routing-repository.contract.js`
- Create: `services/backend/src/repositories/routing-outcome.js`
- Modify: `services/backend/src/repositories/contract.js`
- Modify: `services/backend/src/repositories/memory.js`
- Modify: `services/backend/test/contract/memory-repository.test.js`

**Interfaces:**
- Extends the repository with `saveRoutingDraft`, `loadRoutingSnapshot`, `commitRoutingApproval`, `submitEscalationRequest`, `claimCapabilityExecution`, `markCapabilityCalling`, `recordCapabilityReceipt`, `settleCapabilityExecution`, `markCapabilityBillingUncertain`.
- Produces pure transitions in `routing-outcome.js`; adapters perform reads/writes only.

- [ ] **Step 1: Write the shared failing contract**

The contract seeds an ImportBatch and terminal deterministic Fragment through existing repository methods, then tests:

```text
saveRoutingDraft: create, exact duplicate no-op, conflicting payload reject
loadRoutingSnapshot: owner/batch scoped, deterministic terminal state required
commitRoutingApproval: cohorts + plans + heads + reservations + ledgers + summary atomic
current revision: new plan supersedes old and moves head atomically
immutable approved body: same lifecycle allowed, decision mutation rejected
stale source: approval and capability claim rejected
escalation: deterministic ID and duplicate no-op
budget: aggregate reservation cannot exceed ledgers
summary: current states partition eligible; superseded is historical
```

Add a failure injection around Memory `applyMemoryWrites()` and assert no partial plan/head/reservation/summary write escapes.

- [ ] **Step 2: Run RED**

```bash
node --test test/contract/memory-repository.test.js
```

Expected: repository assertion fails because routing methods are missing.

- [ ] **Step 3: Commit RED contract**

```bash
git add services/backend/test/contract/routing-repository.contract.js services/backend/test/contract/memory-repository.test.js
git commit -m "test(routing): define routing repository lifecycle"
```

- [ ] **Step 4: Implement pure transitions and Memory persistence**

Add Memory collections:

```text
routePlans routingHeads routingCohorts budgetLedgers
budgetReservations capabilityExecutions escalationRequests
```

`loadRoutingSnapshot()` reads the batch's at-most-50 Fragment IDs, their deterministic tasks, duplicate candidates created by those tasks, current heads/plans, and directly referenced external candidate Fragments. Follow near edges in stable Fragment-ID order and stop at 200 unique members.

`commitRoutingApproval()` receives cohort drafts and capability intents, reloads current ledgers, runs the Budget Gate inside the same logical commit, writes approved/completed plans and reservations, moves heads, supersedes prior current plans, and updates `routingSummary`. A zero-approved plan is immediately `completed` and contributes to `blocked` when at least one capability is blocked, otherwise `completed`.

Every object passes its domain parser before a write. `routePlanImmutablePayload()` must match when an approved/executing/completed plan is updated.

- [ ] **Step 5: Run GREEN and full repository regression**

```bash
node --test test/contract/memory-repository.test.js test/contract/repository.contract.js test/contract/processing-repository.contract.js
npm test
git diff --check
```

- [ ] **Step 6: Commit Memory repository**

```bash
git add services/backend/src/repositories/contract.js services/backend/src/repositories/routing-outcome.js services/backend/src/repositories/memory.js
git commit -m "feat(routing): persist plans in memory repository"
```

---

### Task 8: Firestore routing transactions and concurrency

**Files:**
- Modify: `services/backend/src/repositories/firestore.js`
- Modify: `services/backend/test/contract/firestore-repository.test.js`
- Modify: `services/backend/test/contract/routing-repository.contract.js`

**Interfaces:**
- Implements the Task 7 routing repository contract with Firestore transactions.
- Uses document paths under `users/{uid}/routePlans`, `routingHeads`, `routingCohorts`, `budgetLedgers`, `budgetReservations`, `capabilityExecutions`, `escalationRequests`.

- [ ] **Step 1: Add failing Firestore concurrency cases**

Extend the existing proxy/barrier pattern to pause two approvals after both read the same budget ledger. Assert Firestore retries one transaction and final `reservedMicros+spentMicros<=ceilingMicros`. Add two concurrent revisions for the same Fragment and assert exactly one current head, monotonic revision, and the losing stale approval returns a stable conflict rather than overwriting.

Test `loadRoutingSnapshot()` with 50 batch Fragment refs and candidate refs outside the batch. It must issue bounded direct gets/chunked `in` queries and never collection-scan all owner Fragments or all duplicate candidates.

- [ ] **Step 2: Run RED with Emulator-managed startup and cleanup**

```bash
npx firebase emulators:exec --project demo-elsewhere --config ../../firebase/firebase.json --only firestore "node --test --test-concurrency=1 test/contract/firestore-repository.test.js"
```

Expected: routing repository contract fails on missing Firestore methods. `emulators:exec` must exit and clean the Emulator process even when the test is RED.

- [ ] **Step 3: Commit RED Firestore contract**

```bash
git add services/backend/test/contract/firestore-repository.test.js services/backend/test/contract/routing-repository.contract.js
git commit -m "test(routing): cover firestore plan transactions"
```

- [ ] **Step 4: Implement Firestore adapter using shared transitions**

Use `transaction.getAll()` for known refs, chunk `in` filters to Firebase's supported bound, sort snapshots after every query, and cap closure at 200. `commitRoutingApproval()` reads batch, drafts, heads, prior current plans and budget ledgers before writes; it calls the same `routing-outcome.js` transition as Memory and applies returned writes with `transaction.create` for immutable new revisions and `transaction.set` only for lifecycle/head/ledger/summary changes.

Do not catch and retry transactions manually; Firestore owns transaction retries. Map owner/target/stale conflicts through existing stable repository error classes without leaking document paths.

- [ ] **Step 5: Run GREEN for both adapters**

```bash
npx firebase emulators:exec --project demo-elsewhere --config ../../firebase/firebase.json --only firestore "node --test --test-concurrency=1 test/contract/firestore-repository.test.js"
node --test test/contract/memory-repository.test.js
git diff --check
```

- [ ] **Step 6: Commit Firestore adapter**

```bash
git add services/backend/src/repositories/firestore.js
git commit -m "feat(routing): add firestore routing transactions"
```

---

### Task 9: Capability authorization and auditable execution lifecycle

**Files:**
- Create: `services/backend/test/unit/routing-authorization.test.js`
- Create: `services/backend/src/routing/authorization.js`
- Modify: `services/backend/src/repositories/routing-outcome.js`
- Modify: `services/backend/test/contract/routing-repository.contract.js`

**Interfaces:**
- Produces `createCapabilityAuthorizer({ repository, supportedVersions, clock })`.
- Exposes `claim(input)`, `markCalling(input)`, `recordProviderSuccess(input)`, `settle(input)`, `fail(input)`, `markBillingUncertain(input)`.
- Does not accept a provider client and cannot make an external call.

- [ ] **Step 1: Write failing authorization tests**

Test every pre-call gate separately:

```text
plan state approved/executing
RoutingHead currentPlanRef matches
source revision exact match
capability decision approved
executorClass exact match
router/policy/cost versions supported
reservation reserved and not expired/consumed
billableAttempts below max
idempotency key not completed
```

For every failed gate, assert no CapabilityExecution claim is persisted and a provider spy remains zero. A successful first claim moves plan `approved->executing`, creates one execution and returns an authorization object containing only plan ID, capability, executor class, scope, idempotency key and ceiling; it must not return internal ledgers.

Lifecycle tests must prove:

```text
claimed -> calling -> provider_succeeded -> settling -> completed
calling -> billing_uncertain (no automatic claim retry)
claimed/calling -> failed within max attempts
provider_succeeded settlement retry does not call provider
superseded after call settles cost but does not publish resultRef to current Fragment facts
```

When every approved capability is terminal and no EscalationRequest remains `pending`, the repository moves the plan to `completed` and updates the batch routing summary. Deferred capabilities do not keep a plan executing; a matching reconsider event creates a new revision.

- [ ] **Step 2: Run RED**

```bash
node --test test/unit/routing-authorization.test.js test/contract/memory-repository.test.js
```

Expected: module-not-found for `routing/authorization.js` and missing execution transitions.

- [ ] **Step 3: Commit RED**

```bash
git add services/backend/test/unit/routing-authorization.test.js services/backend/test/contract/routing-repository.contract.js
git commit -m "test(routing): define capability authorization boundary"
```

- [ ] **Step 4: Implement provider-free authorization**

Normalize input to exact keys:

```js
{
  uid, routePlanId, capability, executorClass,
  sourceRevision, idempotencyKey,
}
```

The authorizer delegates with exact method mapping: `claim -> claimCapabilityExecution`, `markCalling -> markCapabilityCalling`, `recordProviderSuccess -> recordCapabilityReceipt`, `settle/fail -> settleCapabilityExecution`, and `markBillingUncertain -> markCapabilityBillingUncertain`. `recordProviderSuccess()` requires immutable receipt fields `{ providerRequestId, usage, actualCostMicros, resultRef }`; raw provider response/error is rejected. `settle()` may publish `resultRef` only when the head still points to the plan. `markBillingUncertain()` consumes the current billable attempt and prevents another automatic claim for the same plan/capability.

- [ ] **Step 5: Run GREEN and contract regression**

```bash
node --test test/unit/routing-authorization.test.js test/contract/memory-repository.test.js
npm test
git diff --check
```

- [ ] **Step 6: Commit authorization boundary**

```bash
git add services/backend/src/routing/authorization.js services/backend/src/repositories/routing-outcome.js
git commit -m "feat(routing): enforce plan authorization and settlement"
```

---

### Task 10: Authoritative routing orchestration

**Files:**
- Create: `services/backend/test/unit/routing-service.test.js`
- Create: `services/backend/src/routing/errors.js`
- Create: `services/backend/src/routing/service.js`
- Modify: `services/backend/test/fixtures/routing.js`

**Interfaces:**
- Produces `createAuthoritativeRouter({ repository, featureReader, clock, randomUUID })` with `handle(event)`.
- Accepted results are `{ outcome:'drafted'|'approved'|'completed'|'terminal_noop' }`.

- [ ] **Step 1: Write failing orchestration tests**

Use repository and feature-reader spies to prove this sequence:

```text
normalize terminal deterministic event
save idempotent draft
load bounded snapshot
if batch unsettled return drafted
read features only for eligible current-generation thumbnails
build cohorts and representatives
compile capability intents
commit approval and budget atomically
return only after repository success
```

Cases: single independent photo, 12-item mixed current fixture, repeated event, nonterminal deterministic state, terminal deterministic failure, stale generation, transient repository failure, corrupt thumbnail degradation, no-thumbnail text/PDF, exact duplicate with external canonical Fragment, and automatic escalation revision.

Corrupt or missing derivative features must not read the original or fail the Fragment. The router records `routing/feature-unavailable` and applies deterministic policy; low-information is asserted only when features were successfully computed.

Repository failure before approval returns retryable `routing/repository-unavailable`; invalid/stale input returns terminal/no-op as specified and never reserves budget. Error messages expose no path, original filename, GPS, EXIF or raw adapter error.

- [ ] **Step 2: Run RED**

```bash
node --test test/unit/routing-service.test.js
```

Expected: module-not-found for `routing/service.js`.

- [ ] **Step 3: Commit RED**

```bash
git add services/backend/test/fixtures/routing.js services/backend/test/unit/routing-service.test.js
git commit -m "test(routing): define authoritative compilation flow"
```

- [ ] **Step 4: Implement orchestration only**

The service owns no Firestore details and no provider clients. Normalize event exact keys:

```js
{ uid, batchId, fragmentId, sourceRevision: { bucket, objectName, generation } }
```

It confirms the matching `deterministic-media/v1` task is terminal through `loadRoutingSnapshot()`. Deterministic convergence is exact: `eligible===batch.counters.saved`, `running===0`, `failedRetryable===0`, and `succeeded+failedTerminal===eligible`. An unsettled batch saves a draft with all capability decisions deferred/blocked and `reconsiderOn:['batch-deterministic-settled']`. A settled batch compiles all affected plans in stable Fragment-ID order and passes one approval command to the repository. A valid processor insufficiency event first calls `submitEscalationRequest`, then compiles the next revision from the persisted request. A repeated current plan returns `terminal_noop`.

Never call the feature reader for text, PDF without thumbnail, unsupported thumbnail status, stale generation or more than 200 cohort members.

- [ ] **Step 5: Run GREEN and regression**

```bash
node --test test/unit/routing-service.test.js test/unit/routing-policy.test.js test/unit/routing-cohorts.test.js test/unit/routing-selector.test.js
npm test
git diff --check
```

- [ ] **Step 6: Commit compiler service**

```bash
git add services/backend/src/routing/errors.js services/backend/src/routing/service.js
git commit -m "feat(routing): orchestrate authoritative route plans"
```

---

### Task 11: Ingestion composition, lifecycle and security rules

**Files:**
- Modify: `services/backend/src/ingestion/pipeline.js`
- Modify: `services/backend/src/composition/ingestion.js`
- Modify: `services/backend/src/composition/runtime.js`
- Modify: `services/backend/test/unit/ingestion-pipeline.test.js`
- Create: `services/backend/test/integration/authoritative-routing-app.test.js`
- Modify: `services/backend/test/rules/firestore.rules.test.js`

**Interfaces:**
- Extends `createStorageFinalizedPipeline()` with required `authoritativeRouter.handle()` after terminal Module 4.
- Wires routing only in `serviceMode=ingestion`; API composition remains unchanged.
- Adds no route; existing `/events/storage-finalized` remains the sole production trigger.

- [ ] **Step 1: Write failing pipeline and integration tests**

Assert order with a call log:

```js
assert.deepEqual(calls, [
  'original-finalizer', 'deterministic-processor', 'authoritative-router',
]);
```

Rejected original never calls Module 4 or 4.5. Retryable Module 4 failure never calls Module 4.5. Terminal Module 4 outcome calls Module 4.5 once. Routing repository failure propagates to the existing stable `503` Eventarc response; only persisted draft/approval returns `204`. A repeated Storage event is idempotent.

Inspect Fastify routes and assert `/protected`, `/routing`, `/route-plans` and any new business endpoint are absent.

- [ ] **Step 2: Add Rules characterization coverage**

Seed each internal path as admin:

```text
routePlans routingHeads routingCohorts budgetLedgers
budgetReservations capabilityExecutions escalationRequests
```

For owner, other user and unauthenticated contexts, assert get/create/update/delete all fail through the existing deny-all fallback. Confirm owner still reads ImportBatch routingSummary and Fragment documents under existing rules. This security test is expected to pass before production changes; it characterizes an already-correct boundary while the pipeline test supplies the RED behavior.

- [ ] **Step 3: Run RED**

```bash
node --test test/unit/ingestion-pipeline.test.js test/integration/authoritative-routing-app.test.js
npx firebase emulators:exec --project demo-elsewhere --config ../../firebase/firebase.json --only firestore "node --test --test-concurrency=1 test/rules/firestore.rules.test.js"
```

Expected: pipeline/integration tests fail because the constructor lacks the router; the Rules characterization passes and proves no Rules change is required.

- [ ] **Step 4: Commit RED integration/security contract**

```bash
git add services/backend/test/unit/ingestion-pipeline.test.js services/backend/test/integration/authoritative-routing-app.test.js services/backend/test/rules/firestore.rules.test.js
git commit -m "test(routing): define ingestion and rules integration"
```

- [ ] **Step 5: Wire the router and deny internal collections**

`runtime.js` creates `firebaseThumbnailReader`, `sharpRoutingFeatureReader` and `authoritativeRouter` only inside the ingestion branch, reusing the existing Firebase Storage and repository. `composition/ingestion.js` passes the router into the pipeline. Do not import these adapters from the API composition. Leave `firebase/firestore.rules` unchanged because its final recursive rule already denies every unlisted internal path and the characterization test proves the boundary.

- [ ] **Step 6: Run GREEN**

```bash
node --test test/unit/ingestion-pipeline.test.js test/integration/authoritative-routing-app.test.js test/integration/composition.test.js
npx firebase emulators:exec --project demo-elsewhere --config ../../firebase/firebase.json --only firestore "node --test --test-concurrency=1 test/rules/firestore.rules.test.js"
npm test
git diff --check
```

- [ ] **Step 7: Commit composition and rules**

```bash
git add services/backend/src/ingestion/pipeline.js services/backend/src/composition/ingestion.js services/backend/src/composition/runtime.js
git commit -m "feat(routing): run router after deterministic processing"
```

---

### Task 12: Small/current/large fixtures, Emulator chain and final evidence

**Files:**
- Modify: `services/backend/test/fixtures/routing.js`
- Create: `services/backend/test/emulator/authoritative-routing.emulator.test.js`
- Modify: `services/backend/package.json` test script only
- Modify: `services/backend/README.md`
- Create: `docs/implementation/authoritative-routing-v1.md`

**Interfaces:**
- Provides exported `makeSmallRoutingFixture()`, `makeCurrentRoutingFixture()`, `makeLargeRoutingFixture()`.
- Records final implementation and verification evidence without changing production behavior.

- [ ] **Step 1: Define the three fixed fixtures**

Small contains one independent geotagged photo. Current contains exactly 12 mixed Fragments: one 3-photo burst, one exact pair, one near pair, one receipt, one screenshot, one text, one low-information photo and one independent photo. Large contains exactly 200 stable inputs across four legal 50-item ImportBatches, reaches the cohort member ceiling exactly, and uses generated in-memory media only. The over-limit 201-member partition case remains the focused Task 4 unit fixture.

Fixture assertions include:

```text
changing input order does not change cohort/plan JSON
every source generation change produces a new plan revision
Fragment count remains 1/12/200 after routing
supporting originals remain retrievable
paid authorization count is zero until fake Module 5 claim
fake authorization succeeds only for current approved plans
```

- [ ] **Step 2: Add the Emulator chain verification**

Use the existing Auth/Firestore/Storage Emulator composition. Upload generated media or seed deterministic terminal facts through server-side repository helpers, then run:

```text
Module 4 result -> draft -> batch settles -> cohorts
-> approved/current plan -> fake capability authorization
```

Assert owner isolation, exact current head, budget totals, stable summary, no provider adapter, no new HTTP route and idempotent replay. The large case may seed deterministic outputs directly because Module 4 behavior is already independently proven; it must still exercise Firestore routing transactions.

- [ ] **Step 3: Run the new system coverage**

```bash
npx firebase emulators:exec --project demo-elsewhere --config ../../firebase/firebase.json --only auth,firestore,storage "node --test --test-concurrency=1 test/emulator/authoritative-routing.emulator.test.js"
```

Expected: all three fixtures pass if Tasks 1-11 are complete, and Emulator cleanup completes. If a test fails, return to the task that owns the named behavior, add a focused RED reproducer there, fix that task, then rerun this system coverage before committing it.

- [ ] **Step 4: Commit system coverage**

```bash
git add services/backend/test/fixtures/routing.js services/backend/test/emulator/authoritative-routing.emulator.test.js
git commit -m "test(routing): verify fixture-scale routing flow"
```

- [ ] **Step 5: Register verification commands and write the runbook**

Update `test:emulator` to include `authoritative-routing.emulator.test.js` and the expanded rules/repository contract. Update `services/backend/README.md` with the routing test command and state that Module 4.5 performs no external capability calls. Create `docs/implementation/authoritative-routing-v1.md` with the domain contract, version constants, cohort limits, admission ceilings, authorization lifecycle, known `billing_uncertain` behavior and stop boundary.

- [ ] **Step 6: Run the complete verification matrix**

```bash
cd services/backend
node --test test/unit/routing-domain.test.js test/unit/routing-identity.test.js test/unit/routing-features.test.js test/unit/firebase-thumbnail-reader.test.js test/unit/sharp-routing-feature-reader.test.js test/unit/routing-cohorts.test.js test/unit/routing-selector.test.js test/unit/routing-policy.test.js test/unit/routing-budget.test.js test/unit/routing-authorization.test.js test/unit/routing-service.test.js
node --test test/contract/memory-repository.test.js test/integration/authoritative-routing-app.test.js
npm test
npm run test:emulator
npm audit --omit=dev
docker build -t elsewhere-backend:routing-v1 .
docker run --rm elsewhere-backend:routing-v1 npm test
git diff --check
```

Expected:

```text
all focused tests: 0 fail
ordinary suite: 0 fail
Emulator suite: 0 fail
npm audit --omit=dev: 0 production vulnerabilities
Docker build and Linux tests: exit 0
git diff --check: empty
```

If `npm audit` reports a registry/network failure, rerun with approved network access and record the exact result; do not rewrite dependency versions in this module.

- [ ] **Step 7: Record actual evidence and commit verification docs**

Complete the runbook's verification section with the commands just executed, their actual pass/fail/skip counts, audit result and Docker result. The document must retain object contracts, cohort rules, admission ceilings, authorization checks, failure modes and Emulator startup/cleanup. It must state that signature/routing validation is not malware scanning or semantic understanding.

```bash
git add services/backend/package.json services/backend/README.md docs/implementation/authoritative-routing-v1.md
git commit -m "docs(routing): document routing verification"
```

- [ ] **Step 8: Post-commit verification and stop boundary**

```bash
git show --check --stat --oneline HEAD
git status --short
```

Expected: clean worktree and no whitespace error. Stop with Module 5 unimplemented.

## Self-Review Checklist

- [ ] Every design requirement maps to a task: domain (Task 1), IDs (Task 2), bounded features (Task 3), cohorts/selector (Task 4), policy/escalation (Task 5), budgets (Task 6), repository atomicity (Tasks 7-8), authorization/audit (Task 9), orchestration (Task 10), lifecycle/rules (Task 11), scale and final evidence (Task 12).
- [ ] Module 4 frozen production behavior is not refactored or redefined.
- [ ] No plan step adds a provider adapter, model call, external classifier, runtime dependency, production business endpoint, Cloud Tasks or deployment resource.
- [ ] Every production behavior has a named RED failure, minimum GREEN implementation, verification command and separate commit.
- [ ] Method names and persisted property names are consistent across tasks.
- [ ] Small/current/large fixtures prove data-dependent routing and bounded operations.
- [ ] The final stop boundary is Module 4.5, before Module 5.
