# Module 5A Capability Execution Kernel + OCR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first paid-capability execution path so only current approved OCR RoutePlans can be queued, processed once by a fixed Document AI Enterprise OCR version, persisted with provenance, and settled against the reserved budget.

**Architecture:** Module 4.5 compiles `policy/v2` plans and persists budget reservations. The ingestion root prepares an immutable `CapabilityExecution` before a reference-only Cloud Task is sent; an isolated capability-worker reauthorizes the current plan and source revision, materializes the exact generation, calls a fixed Document AI processor version, stores immutable raw/normalized artifacts, records a bounded `CapabilityResult`, and settles atomically. Firestore is the long-term idempotency truth; Cloud Tasks naming is only short-window duplicate suppression.

**Tech Stack:** Node.js 22 ESM, Fastify 5, Zod 4, Firebase Admin/Firestore/Storage, Cloud Tasks `@google-cloud/tasks@6.2.3`, Document AI `@google-cloud/documentai@9.6.2`, `node:test`, Firebase Emulator Suite.

## Global Constraints

- Work only in `/Users/tangyixuan/trip_memory_elsewhere/.worktrees/backend-foundation-v1` on `codex/backend-foundation-v1`.
- Real Cloud Tasks and Document AI are off by default; incomplete real-provider configuration must fail closed.
- Importing a module must never create a Google client, read ADC, or make a network call.
- Module 5A may add exactly two runtime dependencies: `@google-cloud/tasks@6.2.3` and `@google-cloud/documentai@9.6.2`.
- Cloud Tasks payload contains only `capabilityExecutionId`, `ownerId`, `routePlanId`, and `routePlanRevision`.
- Cloud Tasks task-name dedupe is not the database idempotency boundary.
- Only `current + approved + input-matching + budget-reserved` OCR plans may execute.
- OCR v1 sends only JPEG, PNG, or WebP with `sizeBytes <= 40_000_000` and `width * height <= 40_000_000`.
- HEIC/HEIF/text and PDF with unknown page count never reach Document AI.
- The processor ID and processor version are precreated configuration; runtime code must not create, enable, update, or switch processors.
- A processor cannot silently escalate. It may persist an `escalation_requested` result for Module 4.5 to replan.
- Provider response, normalized OCR, and provenance-backed suggested facts remain separate.
- Calling-state ambiguity becomes `billing_uncertain`; it must not trigger an automatic second paid call.
- API, ingestion, and capability-worker use separate composition roots and runtime service accounts. The worker is protected by Cloud Run IAM/OIDC, not browser Firebase Auth.
- Do not add a public business endpoint. The only new production route is `POST /internal/capabilities/ocr` in the worker root.
- Do not implement Places, Embedding, Gemini, frontend UI, processor provisioning, Cloud Run deployment manifests, or generic provider orchestration beyond OCR.
- Commit RED and GREEN separately. Commit a REFACTOR only when it changes files and all current tests remain green.
- Before every commit run the complete test command named in that step and `git diff --check`.

## File Structure Map

### New production files

- `services/backend/src/capabilities/contract.js` — strict dispatcher, OCR provider, artifact-store port assertions.
- `services/backend/src/capabilities/errors.js` — stable retry/terminal/billing-uncertain capability errors.
- `services/backend/src/capabilities/identity.js` — deterministic execution, task, result, artifact, and client-request identities.
- `services/backend/src/capabilities/scheduler.js` — scan current approved OCR plans, reserve executions, enqueue, mark queued.
- `services/backend/src/capabilities/worker.js` — claim/lease/call/persist/escalate/settle orchestration.
- `services/backend/src/capabilities/ocr-normalizer.js` — Document AI document to bounded normalized OCR and suggested facts.
- `services/backend/src/capabilities/ocr-policy.js` — worker-side fail-closed input guard shared with tests.
- `services/backend/src/capabilities/routes.js` — strict internal task body and stable HTTP semantics.
- `services/backend/src/domain/capability-result.js` — artifact reference and bounded capability-result schemas.
- `services/backend/src/repositories/capability-outcome.js` — pure execution lifecycle and settlement transitions.
- `services/backend/src/adapters/cloud-tasks-dispatcher.js` — lazily constructed Cloud Tasks adapter.
- `services/backend/src/adapters/document-ai-ocr.js` — lazily constructed fixed-version Enterprise OCR adapter.
- `services/backend/src/adapters/firebase-capability-artifact-store.js` — immutable gzip artifact writes.
- `services/backend/src/composition/capability-worker.js` — internal worker-only composition root.
- `services/backend/scripts/document-ai-smoke.mjs` — guarded synthetic one-page real-provider smoke.
- `services/backend/test/contract/capability-repository.contract.js` — Memory/Firestore shared lifecycle contract.
- `services/backend/test/fixtures/capabilities.js` — OCR plan, task, provider, normalized result fixtures.
- `services/backend/test/fixtures/document-ai/one-page-response.json` — sanitized golden provider response.
- `services/backend/test/helpers/create-capability-worker-test-app.js` — test-only worker harness.
- `services/backend/test/unit/capability-config.test.js`
- `services/backend/test/unit/capability-domain.test.js`
- `services/backend/test/unit/capability-identity.test.js`
- `services/backend/test/unit/capability-scheduler.test.js`
- `services/backend/test/unit/cloud-tasks-dispatcher.test.js`
- `services/backend/test/unit/ocr-normalizer.test.js`
- `services/backend/test/unit/firebase-capability-artifact-store.test.js`
- `services/backend/test/unit/document-ai-ocr.test.js`
- `services/backend/test/unit/capability-worker.test.js`
- `services/backend/test/integration/capability-worker-app.test.js`
- `services/backend/test/emulator/capability-execution.emulator.test.js`
- `docs/implementation/capability-execution-ocr-v1.md`

### Existing files modified

- `services/backend/package.json`, `services/backend/package-lock.json`
- `services/backend/src/config.js`
- `services/backend/src/domain/index.js`
- `services/backend/src/domain/common.js`
- `services/backend/src/domain/import-batch.js`
- `services/backend/src/domain/routing-execution.js`
- `services/backend/src/routing/policy.js`
- `services/backend/src/routing/budget.js`
- `services/backend/src/routing/service.js`
- `services/backend/src/routing/authorization.js`
- `services/backend/src/repositories/contract.js`
- `services/backend/src/repositories/memory.js`
- `services/backend/src/repositories/firestore.js`
- `services/backend/src/imports/service.js`
- `services/backend/src/ingestion/pipeline.js`
- `services/backend/src/composition/ingestion.js`
- `services/backend/src/composition/runtime.js`
- `services/backend/test/fixtures/import.js`
- `services/backend/test/fixtures/routing.js`
- `services/backend/test/contract/memory-repository.test.js`
- `services/backend/test/contract/firestore-repository.test.js`
- `services/backend/test/contract/routing-repository.contract.js`
- `services/backend/test/unit/config.test.js`
- `services/backend/test/unit/domain.test.js`
- `services/backend/test/unit/routing-policy.test.js`
- `services/backend/test/unit/routing-budget.test.js`
- `services/backend/test/unit/routing-authorization.test.js`
- `services/backend/test/unit/ingestion-pipeline.test.js`
- `services/backend/test/integration/composition.test.js`
- `services/backend/test/integration/authoritative-routing-app.test.js`
- `services/backend/test/rules/firestore.rules.test.js`
- `services/backend/test/rules/storage.rules.test.js`
- `firebase/firestore.rules`
- `firebase/storage.rules`
- `services/backend/.env.example`
- `services/backend/README.md`
- `docs/Elsewhere_PRD_v3.0.md`
- `docs/Elsewhere_Google_First_Technical_Architecture_v1.0.md`
- `docs/implementation/backend-foundation-v1.md`
- `docs/implementation/authoritative-routing-v1.md`
- `docs/implementation/else-ai-service-v1.md`

---

### Task 1: Fail-Closed Provider Configuration

**Files:**
- Create: `services/backend/test/unit/capability-config.test.js`
- Modify: `services/backend/test/unit/config.test.js`
- Modify: `services/backend/src/config.js`

**Interfaces:**
- Produces: `loadConfig(env).capabilities` with `{ mode, cloudTasks, documentAi }` frozen configuration.
- Produces: `serviceMode` union `api | ingestion | capability-worker`.
- Consumes: no provider SDK and no ADC.

- [ ] **Step 1: Write the failing config tests**

Add exact cases proving safe defaults, root isolation, complete Google configuration, and test denial:

```js
test('capability providers are disabled by default', () => {
  const config = loadConfig({ NODE_ENV: 'test' });
  assert.deepEqual(config.capabilities, {
    mode: 'fake',
    ocr: {
      executorVersion: 'v1',
      provider: 'document-ai',
      providerVersion: 'fake-processor-v1',
    },
    cloudTasks: null,
    documentAi: null,
  });
});

test('a real ingestion root requires the complete Cloud Tasks tuple', () => {
  assert.throws(() => loadConfig({
    NODE_ENV: 'production',
    ELSEWHERE_SERVICE_MODE: 'ingestion',
    FIREBASE_PROJECT_ID: 'elsewhere-prod',
    ELSEWHERE_STORAGE_BUCKETS: 'elsewhere-prod.appspot.com',
    CAPABILITY_EXECUTION_MODE: 'google',
    CLOUD_TASKS_ENABLED: 'true',
  }), /Invalid backend configuration/);
});

test('a test process cannot enable real clients without the smoke guard', () => {
  assert.throws(() => loadConfig({
    NODE_ENV: 'test',
    ELSEWHERE_SERVICE_MODE: 'capability-worker',
    CAPABILITY_EXECUTION_MODE: 'google',
    DOCUMENT_AI_ENABLED: 'true',
    DOCUMENT_AI_PROJECT_ID: 'real-project',
    DOCUMENT_AI_LOCATION: 'us',
    DOCUMENT_AI_PROCESSOR_ID: 'processor-1',
    DOCUMENT_AI_PROCESSOR_VERSION: 'version-1',
    DOCUMENT_AI_ENDPOINT: 'us-documentai.googleapis.com',
  }), /Invalid backend configuration/);
});
```

- [ ] **Step 2: Run RED and commit the contract**

Run: `cd services/backend && node --test test/unit/config.test.js test/unit/capability-config.test.js`

Expected: FAIL because `capabilities` is absent and `capability-worker` is rejected.

Run: `git diff --check`

Commit: `test(capabilities): define fail-closed provider configuration`

- [ ] **Step 3: Implement the minimum frozen config**

Extend `EnvSchema` with strict boolean strings and all approved fields. Return `null` for a disabled provider and never expose `RUN_REAL_GOOGLE_PROVIDER_TESTS` in the returned object:

```js
const enabled = (value) => value === 'true';

const capabilities = Object.freeze({
  mode: value.CAPABILITY_EXECUTION_MODE,
  ocr: Object.freeze({
    executorVersion: 'v1',
    provider: 'document-ai',
    providerVersion: value.OCR_PROVIDER_VERSION,
  }),
  cloudTasks: enabled(value.CLOUD_TASKS_ENABLED) ? Object.freeze({
    projectId: value.CLOUD_TASKS_PROJECT_ID,
    location: value.CLOUD_TASKS_LOCATION,
    queue: value.OCR_TASK_QUEUE,
    workerUrl: value.OCR_WORKER_URL,
    audience: value.OCR_WORKER_AUDIENCE,
    serviceAccountEmail: value.OCR_TASK_SERVICE_ACCOUNT,
  }) : null,
  documentAi: enabled(value.DOCUMENT_AI_ENABLED) ? Object.freeze({
    projectId: value.DOCUMENT_AI_PROJECT_ID,
    location: value.DOCUMENT_AI_LOCATION,
    processorId: value.DOCUMENT_AI_PROCESSOR_ID,
    processorVersion: value.DOCUMENT_AI_PROCESSOR_VERSION,
    endpoint: value.DOCUMENT_AI_ENDPOINT,
  }) : null,
});
```

Use `OCR_PROVIDER_VERSION=fake-processor-v1` only as the fake-mode default. Google-mode ingestion and worker roots must both receive an explicit `OCR_PROVIDER_VERSION`; the worker must reject startup unless it exactly equals `DOCUMENT_AI_PROCESSOR_VERSION`. This non-secret shared value lets the scheduler include the fixed processor version in the database idempotency tuple without constructing a Document AI client. Reject fake mode with either real switch, API with either provider, ingestion with Document AI, worker with Cloud Tasks, incomplete tuples, and real test mode without the explicit smoke guard. Worker mode requires the same Storage bucket allowlist as ingestion because it materializes exact-generation originals and writes internal result artifacts.

- [ ] **Step 4: Run GREEN and commit**

Run: `cd services/backend && node --test test/unit/config.test.js test/unit/capability-config.test.js`

Expected: PASS.

Run: `git diff --check`

Commit: `feat(capabilities): add fail-closed provider configuration`

---

### Task 2: Routing Policy v2 and OCR Cost Model v2

**Files:**
- Modify: `services/backend/src/routing/policy.js`
- Modify: `services/backend/src/routing/budget.js`
- Modify: `services/backend/src/routing/service.js`
- Modify: `services/backend/test/unit/routing-policy.test.js`
- Modify: `services/backend/test/unit/routing-budget.test.js`
- Modify: `services/backend/test/unit/routing-service.test.js`
- Modify: `services/backend/test/fixtures/routing.js`

**Interfaces:**
- Produces: `POLICY_V2`, `COST_MODEL_V2`, `ROUTING_COST_MODEL_V2`.
- Produces: new plans with `router.policyVersion='v2'` and `costModelVersion='v2'`.
- Preserves: parsing and authorization of immutable historical v1 plans.

- [ ] **Step 1: Write policy and cost RED tests**

Add table-driven assertions:

```js
for (const [name, fragment, expected] of [
  ['small receipt JPEG', receipt({ format: 'jpeg', sizeBytes: 4_000_000, width: 2000, height: 3000 }), ['approve', 'document-ai-input-supported']],
  ['HEIC receipt', receipt({ format: 'heic' }), ['block', 'document-ai-format-unsupported']],
  ['missing pixels', receipt({ width: null, height: null }), ['defer', 'image-pixels-unknown']],
  ['over 40 MP', receipt({ width: 8000, height: 6000 }), ['block', 'document-ai-online-limit']],
  ['unknown-page PDF', pdf({ pageCount: null }), ['defer', 'page-count-unknown']],
]) {
  test(`policy v2: ${name}`, () => {
    const result = compileCapabilityIntents({ fragment, representation: independent(fragment.id) });
    assert.equal(result.intents.ocr.decision, expected[0]);
    assert.deepEqual(result.intents.ocr.reasonCodes, [expected[1]]);
  });
}

test('cost model v2 reserves exactly one Enterprise OCR image page', () => {
  assert.deepEqual(ROUTING_COST_MODEL_V2.capabilities.ocr, {
    estimatedMicros: 1500,
    ceilingMicros: 1500,
    maxBillableAttempts: 1,
  });
});
```

Also assert a document plan defers Embedding until OCR and that new router output is v2 while existing v1 budget tests remain green.

- [ ] **Step 2: Run RED and commit**

Run: `cd services/backend && node --test test/unit/routing-policy.test.js test/unit/routing-budget.test.js test/unit/routing-service.test.js`

Expected: FAIL because v1 approves PDF and does not expose v2 constants.

Run: `git diff --check`

Commit: `test(routing): define OCR policy and cost model v2`

- [ ] **Step 3: Implement the minimum versioned policy**

Add one deterministic eligibility function and a version lookup rather than provider code in the router:

```js
const DOCUMENT_AI_IMAGE_FORMATS = new Set(['jpeg', 'png', 'webp']);
const DOCUMENT_AI_MAX_BYTES = 40_000_000;
const DOCUMENT_AI_MAX_PIXELS = 40_000_000;

function documentOcrIntent(fragment, scope) {
  const { format, width, height, pageCount } = fragment.technicalMetadata ?? {};
  if (format === 'pdf') return pageCount === null
    ? defer('page-count-unknown', ['technical-facts-updated', 'policy-change'], scope)
    : block('document-ai-format-not-enabled', scope);
  if (['heic', 'heif'].includes(format)) return block('document-ai-format-unsupported', scope);
  if (!DOCUMENT_AI_IMAGE_FORMATS.has(format)) return block('document-ai-format-unsupported', scope);
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    return defer('image-pixels-unknown', ['technical-facts-updated', 'policy-change'], scope);
  }
  if (fragment.storage.sizeBytes > DOCUMENT_AI_MAX_BYTES
    || width * height > DOCUMENT_AI_MAX_PIXELS) {
    return block('document-ai-online-limit', scope);
  }
  return approve('document-ocr', 'document-ai-input-supported', scope);
}
```

Keep v1 constants, add v2 maps in `routing/budget.js`, select by the draft plan version, and have `routing/service.js` emit v2 for newly compiled revisions.

- [ ] **Step 4: Run GREEN and commit**

Run: `cd services/backend && node --test test/unit/routing-policy.test.js test/unit/routing-budget.test.js test/unit/routing-service.test.js`

Expected: PASS, including historical v1 assertions.

Run: `git diff --check`

Commit: `feat(routing): add deterministic OCR policy v2`

---

### Task 3: Capability Domain Contracts and Bounded Batch Summary

**Files:**
- Create: `services/backend/src/domain/capability-result.js`
- Modify: `services/backend/src/domain/routing-execution.js`
- Modify: `services/backend/src/domain/import-batch.js`
- Modify: `services/backend/src/domain/common.js`
- Modify: `services/backend/src/domain/index.js`
- Modify: `services/backend/src/imports/service.js`
- Create: `services/backend/test/unit/capability-domain.test.js`
- Modify: `services/backend/test/unit/domain.test.js`
- Modify: `services/backend/test/fixtures/import.js`
- Modify: `services/backend/test/fixtures/routing.js`
- Create: `services/backend/test/fixtures/capabilities.js`

**Interfaces:**
- Produces: `CapabilityArtifactRefSchema`, `CapabilityResultSchema`, `parseCapabilityResult`.
- Produces: versioned `CapabilityExecution` dispatch/lease/receipt contract.
- Produces: nullable `ImportBatch.capabilitySummary` partitioned by current executor/source revision.

- [ ] **Step 1: Write strict schema RED tests**

Use fixtures that prove extra fields fail, provider request ID may be null, client request ID is required, lease fields match states, and unsupported is not a failed batch item:

```js
test('provider receipt requires deterministic client ID and permits absent provider ID', () => {
  const execution = makeOcrExecution({
    state: 'provider_succeeded',
    receipt: makeOcrReceipt({ providerRequestId: null }),
    resultRef: { type: 'capabilityResult', id: 'result_12345678' },
  });
  assert.equal(parseCapabilityExecution(execution).receipt.clientRequestId, 'ocr-request-12345678');
});

test('capability result keeps artifact refs bounded and OCR facts suggested', () => {
  const result = parseCapabilityResult(makeOcrCapabilityResult());
  assert.equal(result.outcome, 'completed');
  assert.deepEqual(result.suggestedFactKeys, [
    'ocrLanguageCodes', 'ocrPageCount', 'ocrQualitySummary', 'ocrResultRef',
  ]);
});
```

- [ ] **Step 2: Run RED and commit**

Run: `cd services/backend && node --test test/unit/domain.test.js test/unit/capability-domain.test.js`

Expected: FAIL because result schemas, dispatch states, leases, and `capabilitySummary` do not exist.

Run: `git diff --check`

Commit: `test(capabilities): define execution and OCR result domains`

- [ ] **Step 3: Implement strict Zod schemas**

Use these frozen state and outcome sets:

```js
export const CAPABILITY_EXECUTION_STATES = Object.freeze([
  'reserved', 'queued', 'claimed', 'calling', 'provider_succeeded',
  'settling', 'completed', 'failed_retryable', 'failed_terminal',
  'billing_uncertain',
]);

export const CAPABILITY_RESULT_OUTCOMES = Object.freeze([
  'completed', 'insufficient_input', 'unsupported',
]);
```

`CapabilityExecution` must include `fragmentRef`, full `sourceRevision`, `routePlanRevision`, provider name/version, nullable task/queue timestamps, nullable lease owner/expiry, `billableAttempts`, nullable receipt/result/error fields, and lifecycle invariants. Receipt fields include `requestCount=1`, a nonnegative `taskDeliveryCount`, required `clientRequestId`, nullable `providerRequestId`, pricing version, and actual pages/cost. `CapabilityResult` must reference execution/plan/Fragment/source revision, include bounded provider and normalized artifact refs, an irreversible `processorAuditId`, exact usage/cost/pricing fields, quality summary, and sorted suggested fact keys. Add `capabilityResult` to the common provenance reference enum; do not store full OCR text in Fragment or ImportBatch. Add `capabilitySummary: null` to newly created ImportBatches and a nullable versioned summary schema for settled work.

- [ ] **Step 4: Run GREEN and commit**

Run: `cd services/backend && node --test test/unit/domain.test.js test/unit/capability-domain.test.js test/unit/import-domain.test.js test/unit/routing-domain.test.js`

Expected: PASS.

Run: `git diff --check`

Commit: `feat(capabilities): add execution and OCR result domains`

---

### Task 4: Deterministic Capability Identities and Ports

**Files:**
- Create: `services/backend/src/capabilities/identity.js`
- Create: `services/backend/src/capabilities/contract.js`
- Create: `services/backend/src/capabilities/errors.js`
- Create: `services/backend/test/unit/capability-identity.test.js`
- Create: `services/backend/test/unit/capability-contracts.test.js`

**Interfaces:**
- Produces: `makeCapabilityIdentity(input)` returning frozen `{ idempotencyKey, executionId, taskName, resultId, clientRequestId }`.
- Produces: `assertCapabilityDispatcher`, `assertOcrProvider`, `assertCapabilityArtifactStore`.
- Produces: `CapabilityError(code, { retryable, billingUncertain })` without raw causes/messages.

- [ ] **Step 1: Write identity/port RED tests**

```js
test('identity changes for every paid-call boundary field', () => {
  const base = makeIdentityInput();
  const original = makeCapabilityIdentity(base);
  for (const [field, value] of [
    ['ownerId', 'user_beta'],
    ['fragmentId', 'frag_87654321'],
    ['routePlanRevision', 2],
    ['providerVersion', 'processor-version-2'],
  ]) {
    assert.notEqual(makeCapabilityIdentity({ ...base, [field]: value }).executionId,
      original.executionId);
  }
});

test('ports reject extra methods and incomplete implementations', () => {
  assert.throws(() => assertCapabilityDispatcher({}), TypeError);
  assert.throws(() => assertOcrProvider({ process() {}, chat() {} }), TypeError);
});
```

- [ ] **Step 2: Run RED and commit**

Run: `cd services/backend && node --test test/unit/capability-identity.test.js test/unit/capability-contracts.test.js`

Expected: FAIL with module-not-found for the new capability files.

Run: `git diff --check`

Commit: `test(capabilities): define identities ports and stable errors`

- [ ] **Step 3: Implement length-prefixed SHA-256 identities and strict ports**

Identity input must contain the complete tuple and use deterministic prefixes:

```js
return Object.freeze({
  idempotencyKey: digest('capidem', fields),
  executionId: digest('execute', fields),
  taskName: `ocr-${digest('task', fields).slice(5)}`,
  resultId: digest('capresult', fields),
  clientRequestId: digest('ocrrequest', fields),
});
```

Do not include object bytes, OCR text, EXIF, GPS, or user notes in any identity.

- [ ] **Step 4: Run GREEN and commit**

Run: `cd services/backend && node --test test/unit/capability-identity.test.js test/unit/capability-contracts.test.js`

Expected: PASS.

Run: `git diff --check`

Commit: `feat(capabilities): add deterministic identities and ports`

---

### Task 5: Memory Repository Execution Lifecycle

**Files:**
- Create: `services/backend/src/repositories/capability-outcome.js`
- Modify: `services/backend/src/repositories/contract.js`
- Modify: `services/backend/src/repositories/memory.js`
- Modify: `services/backend/src/routing/authorization.js`
- Create: `services/backend/test/contract/capability-repository.contract.js`
- Modify: `services/backend/test/contract/memory-repository.test.js`
- Modify: `services/backend/test/unit/routing-authorization.test.js`
- Modify: `services/backend/test/unit/memory-state.test.js`

**Interfaces:**
- Produces repository methods:
  - `prepareCapabilityExecution(uid, command)`
  - `markCapabilityQueued(uid, command)`
  - `claimCapabilityExecution(uid, command)`
  - `markCapabilityCalling(uid, command)`
  - `recordCapabilityResult(uid, command)`
  - `settleCapabilityExecution(uid, command)`
  - `failCapabilityExecution(uid, command)`
  - `markCapabilityBillingUncertain(uid, command)`
- Produces: lease-based worker authorization that claims an existing reserved execution rather than creating one.

- [ ] **Step 1: Write the shared lifecycle RED contract**

The contract must seed a v2 approved OCR plan and assert this exact progression:

```js
const prepared = await repository.prepareCapabilityExecution(ownerId, prepareCommand);
assert.equal(prepared.execution.state, 'reserved');
assert.equal(prepared.execution.billableAttempts, 0);

const queued = await repository.markCapabilityQueued(ownerId, {
  executionId: prepared.execution.id,
  taskName: identity.taskName,
  queuedAt: NOW,
});
assert.equal(queued.execution.state, 'queued');

const claimed = await repository.claimCapabilityExecution(ownerId, {
  executionId: prepared.execution.id,
  leaseOwner: 'delivery_12345678',
  claimedAt: NOW,
  leaseExpiresAt: LATER,
  supportedVersions: OCR_SUPPORTED_VERSIONS,
});
assert.equal(claimed.execution.billableAttempts, 0);

const calling = await repository.markCapabilityCalling(ownerId, {
  executionId: prepared.execution.id,
  leaseOwner: 'delivery_12345678',
  calledAt: NOW,
});
assert.equal(calling.execution.billableAttempts, 1);
```

Also cover exact replay, conflicting replay, expired lease reclaim, stale head/source/plan rejection, provider-succeeded settlement without a second call, unsupported release, insufficient result plus pending escalation, and `billing_uncertain` retaining an auditable reservation.

- [ ] **Step 2: Run RED and commit**

Run: `cd services/backend && node --test test/contract/memory-repository.test.js test/unit/routing-authorization.test.js test/unit/memory-state.test.js`

Expected: FAIL because the repository still creates an execution at claim time and increments attempts too early.

Run: `git diff --check`

Commit: `test(capabilities): define durable execution lifecycle`

- [ ] **Step 3: Implement pure transitions and Memory writes**

Move new lifecycle logic to `capability-outcome.js`. Every transition must parse owner-scoped objects, re-check current `RoutingHead`, plan revision, source revision, reservation state, executor/provider versions, and immutable identity. `recordCapabilityResult` persists the result and receipt together; `settleCapabilityExecution` atomically updates execution, reservation, ledgers, Fragment OCR facts, ImportBatch capability summary, and RoutePlan completion. Derive summary counters by the unique key `fragmentId + capability + executorName + executorVersion + sourceRevision`; a late result from an older executor or source revision cannot increment the current summary, and supporting/skipped/deferred/unsupported work cannot increment `failed`.

Use a single Memory commit for every multi-object transition:

```js
commitWrites([
  capabilityExecutions.prepareWrite(uid, transition.execution),
  capabilityResults.prepareWrite(uid, transition.result),
  fragments.prepareWrite(uid, transition.fragment),
  importBatches.prepareWrite(uid, transition.batch),
]);
```

Exact duplicates return the stored object; different content at the same deterministic ID throws `repository/conflict`.

- [ ] **Step 4: Run GREEN and commit**

Run: `cd services/backend && node --test test/contract/memory-repository.test.js test/unit/routing-authorization.test.js test/unit/memory-state.test.js test/unit/routing-*.test.js`

Expected: PASS.

Run: `git diff --check`

Commit: `feat(capabilities): add durable execution lifecycle`

---

### Task 6: Scheduler and Ingestion Handoff

**Files:**
- Create: `services/backend/src/capabilities/scheduler.js`
- Create: `services/backend/test/unit/capability-scheduler.test.js`
- Modify: `services/backend/src/ingestion/pipeline.js`
- Modify: `services/backend/src/composition/ingestion.js`
- Modify: `services/backend/test/unit/ingestion-pipeline.test.js`
- Modify: `services/backend/test/integration/authoritative-routing-app.test.js`

**Interfaces:**
- Consumes: repository lifecycle from Task 5 and dispatcher `enqueueOcrTask(payload)`.
- Produces: `createCapabilityScheduler({ repository, dispatcher, providerVersion, clock })` with `handle({ uid, batchId })`.
- Produces: ingestion pipeline order `finalize → deterministic → route → capability schedule`.

- [ ] **Step 1: Write scheduler and pipeline RED tests**

Assert stable Fragment order, reference-only payload, no dispatch for skipped/deferred/blocked/supporting/stale plans, and recovery after router no-op:

```js
test('router no-op still scans persisted current approved OCR plans', async () => {
  const calls = [];
  const pipeline = createStorageFinalizedPipeline({
    originalFinalizer: handler('duplicate'),
    deterministicProcessor: handler('terminal_noop'),
    authoritativeRouter: handler('terminal_noop'),
    capabilityScheduler: { async handle(input) { calls.push(input); return { outcome: 'queued' }; } },
  });
  assert.deepEqual(await pipeline.handle(EVENT), { outcome: 'terminal_noop' });
  assert.deepEqual(calls, [{ uid: EVENT.uid, batchId: EVENT.batchId }]);
});
```

Verify dispatch failure leaves the execution `reserved` and makes ingestion return a retryable 503 through the existing route.

- [ ] **Step 2: Run RED and commit**

Run: `cd services/backend && node --test test/unit/capability-scheduler.test.js test/unit/ingestion-pipeline.test.js test/integration/authoritative-routing-app.test.js`

Expected: FAIL because the scheduler port and fourth pipeline stage are absent.

Run: `git diff --check`

Commit: `test(capabilities): define OCR scheduling handoff`

- [ ] **Step 3: Implement the minimal scheduler**

`handle()` loads the routing snapshot, selects only current approved v2 OCR decisions, derives the Task 4 identity, calls `prepareCapabilityExecution`, sends this strict payload, and marks queued only after `created|duplicate`:

```js
const payload = Object.freeze({
  capabilityExecutionId: identity.executionId,
  ownerId: uid,
  routePlanId: plan.id,
  routePlanRevision: plan.revision,
});
const dispatched = await dispatcher.enqueueOcrTask({ taskName: identity.taskName, payload });
if (!['created', 'duplicate'].includes(dispatched.outcome)) throw retryableCapabilityError();
await repository.markCapabilityQueued(uid, {
  executionId: identity.executionId,
  taskName: identity.taskName,
  queuedAt: clock(),
});
```

- [ ] **Step 4: Run GREEN and commit**

Run: `cd services/backend && node --test test/unit/capability-scheduler.test.js test/unit/ingestion-pipeline.test.js test/integration/authoritative-routing-app.test.js`

Expected: PASS.

Run: `git diff --check`

Commit: `feat(capabilities): schedule approved OCR executions`

---

### Task 7: Cloud Tasks Adapter and Official Dependency

**Files:**
- Create: `services/backend/src/adapters/cloud-tasks-dispatcher.js`
- Create: `services/backend/test/unit/cloud-tasks-dispatcher.test.js`
- Modify: `services/backend/package.json`
- Modify: `services/backend/package-lock.json`

**Interfaces:**
- Produces: `createCloudTasksDispatcher({ config, clientFactory })`.
- Returns: `{ outcome: 'created' | 'duplicate' }`.
- Calls: client `createTask({ parent, task })` only when `enqueueOcrTask` runs.

- [ ] **Step 1: Write the adapter RED tests**

Golden request assertion:

```js
assert.deepEqual(calls[0], {
  parent: 'projects/elsewhere/locations/us-central1/queues/elsewhere-ocr',
  task: {
    name: 'projects/elsewhere/locations/us-central1/queues/elsewhere-ocr/tasks/ocr-abc',
    httpRequest: {
      httpMethod: 'POST',
      url: 'https://worker.example/internal/capabilities/ocr',
      headers: { 'Content-Type': 'application/json' },
      body: Buffer.from(JSON.stringify(PAYLOAD)).toString('base64'),
      oidcToken: {
        serviceAccountEmail: 'tasks@elsewhere.iam.gserviceaccount.com',
        audience: 'https://worker.example',
      },
    },
  },
});
```

Assert strict payload rejection, code `6`/`ALREADY_EXISTS` mapping to duplicate, all other provider errors becoming stable retryable errors without leaking messages, and client constructor count remaining zero until first enqueue.

- [ ] **Step 2: Run RED and commit**

Run: `cd services/backend && node --test test/unit/cloud-tasks-dispatcher.test.js`

Expected: FAIL with module-not-found.

Run: `git diff --check`

Commit: `test(capabilities): define Cloud Tasks dispatch contract`

- [ ] **Step 3: Install and implement**

Run: `cd services/backend && npm install --save-exact @google-cloud/tasks@6.2.3`

Implement a cached lazy client:

```js
let client = null;
const getClient = () => {
  client ??= clientFactory();
  return client;
};
```

No constructor runs at module import or adapter construction.

- [ ] **Step 4: Run GREEN and commit**

Run: `cd services/backend && node --test test/unit/cloud-tasks-dispatcher.test.js test/unit/capability-scheduler.test.js`

Expected: PASS.

Run: `git diff --check`

Commit: `feat(capabilities): add lazy Cloud Tasks dispatcher`

---

### Task 8: OCR Normalization, Provenance, and Immutable Artifact Storage

**Files:**
- Create: `services/backend/src/capabilities/ocr-normalizer.js`
- Create: `services/backend/src/adapters/firebase-capability-artifact-store.js`
- Create: `services/backend/test/fixtures/document-ai/one-page-response.json`
- Create: `services/backend/test/unit/ocr-normalizer.test.js`
- Create: `services/backend/test/unit/firebase-capability-artifact-store.test.js`

**Interfaces:**
- Produces: `normalizeDocumentAiOcr({ document, resultId, fragmentId, executionId, observedAt })`.
- Produces: `{ normalized, suggestedFacts, outcome }` where outcome is `completed|insufficient_input`.
- Produces artifact port methods `putProviderArtifact()` and `putNormalizedArtifact()` returning immutable refs.

- [ ] **Step 1: Write golden normalization and Storage RED tests**

The sanitized golden response must contain one page, text anchors, language codes, layout confidences, and image-quality defects. Assert exact anchor extraction and no merchant/date/amount proposal:

```js
const result = normalizeDocumentAiOcr({ document: golden, ...CONTEXT });
assert.equal(result.normalized.text, 'COMMON GROUNDS\nAmericano 90.00\n');
assert.deepEqual(result.normalized.languageCodes, ['en']);
assert.equal(Object.hasOwn(result.suggestedFacts, 'merchantName'), false);
assert.deepEqual(Object.keys(result.suggestedFacts).sort(), [
  'ocrLanguageCodes', 'ocrPageCount', 'ocrQualitySummary', 'ocrResultRef',
]);
```

Artifact tests must prove gzip output, SHA-256, `ifGenerationMatch=0`, exact reuse after 412, conflict on mismatched bytes/metadata, and no original bytes in artifact metadata.

- [ ] **Step 2: Run RED and commit**

Run: `cd services/backend && node --test test/unit/ocr-normalizer.test.js test/unit/firebase-capability-artifact-store.test.js`

Expected: FAIL with module-not-found.

Run: `git diff --check`

Commit: `test(capabilities): define OCR normalization and artifact contracts`

- [ ] **Step 3: Implement deterministic normalization and immutable writes**

Text-anchor extraction must concatenate only valid, in-range segments and reject malformed offsets. Normalize pages/blocks/paragraphs/lines/tokens in page order and sort language codes. Create provenance like:

```js
const provenance = (value, confidence) => ({
  value,
  sourceType: 'ocr',
  sourceRefs: [
    { type: 'capabilityResult', id: resultId },
    { type: 'fragment', id: fragmentId },
  ],
  processor: {
    name: 'document-ai-enterprise-ocr',
    version: 'v1',
    modelAlias: null,
    promptVersion: null,
  },
  confidence,
  status: 'suggested',
  observedAt,
});
```

Use canonical key-sorted JSON, `gzip` with deterministic options, and server-only paths `users/{uid}/capability-results/{executionId}/{provider|normalized}.json.gz`.

- [ ] **Step 4: Run GREEN and commit**

Run: `cd services/backend && node --test test/unit/ocr-normalizer.test.js test/unit/firebase-capability-artifact-store.test.js test/unit/firebase-derivative-store.test.js`

Expected: PASS.

Run: `git diff --check`

Commit: `feat(capabilities): normalize and store immutable OCR results`

---

### Task 9: Fixed-Version Document AI OCR Adapter

**Files:**
- Create: `services/backend/src/capabilities/ocr-policy.js`
- Create: `services/backend/src/adapters/document-ai-ocr.js`
- Create: `services/backend/test/unit/document-ai-ocr.test.js`
- Create: `services/backend/scripts/document-ai-smoke.mjs`
- Modify: `services/backend/package.json`
- Modify: `services/backend/package-lock.json`

**Interfaces:**
- Produces: `assertOcrInput({ format, mimeType, sizeBytes, width, height })`.
- Produces: `createDocumentAiOcr({ config, clientFactory })` with `process(input)`.
- Provider output: frozen `{ document, providerRequestId }`, where provider request ID is nullable.

- [ ] **Step 1: Write provider RED tests**

Assert JPEG/PNG/WebP pass, every forbidden/oversized input fails before file read/client construction, and the request pins the full version resource:

```js
assert.deepEqual(calls.processDocument[0], {
  name: 'projects/elsewhere/locations/us/processors/processor-1/processorVersions/version-1',
  rawDocument: { content: SOURCE_BYTES, mimeType: 'image/jpeg' },
  fieldMask: OCR_FIELD_MASK,
  labels: { execution: CORRELATION_HASH, executor: 'v1' },
});
```

Assert no processor-management method is accessed, client construction is lazy, missing response document becomes a stable provider-result error, and raw Google errors are not exposed.

- [ ] **Step 2: Run RED and commit**

Run: `cd services/backend && node --test test/unit/document-ai-ocr.test.js`

Expected: FAIL with module-not-found.

Run: `git diff --check`

Commit: `test(capabilities): define fixed-version Document AI OCR contract`

- [ ] **Step 3: Install and implement**

Run: `cd services/backend && npm install --save-exact @google-cloud/documentai@9.6.2`

Define the exact response mask in the adapter and export it for the golden test:

```js
export const OCR_FIELD_MASK = [
  'text',
  'pages.pageNumber',
  'pages.dimension',
  'pages.layout',
  'pages.blocks',
  'pages.paragraphs',
  'pages.lines',
  'pages.tokens',
  'pages.detectedLanguages',
  'pages.imageQualityScores',
].join(',');
```

The adapter must construct `DocumentProcessorServiceClient({ apiEndpoint: config.endpoint })` only inside the cached `clientFactory`, read at most 40,000,000 bytes from the already verified temporary file, send the fixed field mask, and never call processor create/update/enable APIs.

The smoke script exits unless both guards are exact:

```js
if (process.env.RUN_REAL_GOOGLE_PROVIDER_TESTS !== 'true'
  || process.env.CAPABILITY_EXECUTION_MODE !== 'google') {
  throw new Error('Real Document AI smoke is explicitly disabled');
}
```

- [ ] **Step 4: Run GREEN and commit**

Run: `cd services/backend && node --test test/unit/document-ai-ocr.test.js test/unit/capability-config.test.js`

Expected: PASS with provider/client call counters at zero outside the injected fake.

Run: `git diff --check`

Commit: `feat(capabilities): add fixed-version Document AI OCR adapter`

---

### Task 10: Capability Worker Orchestration

**Files:**
- Create: `services/backend/src/capabilities/worker.js`
- Create: `services/backend/test/unit/capability-worker.test.js`
- Modify: `services/backend/src/routing/authorization.js`

**Interfaces:**
- Consumes: repository, source materializer, OCR provider, normalizer, artifact store, clock, lease owner factory.
- Produces: `createOcrCapabilityWorker(dependencies).handle(task)` returning `{ outcome, retryable }` without provider material.

- [ ] **Step 1: Write worker RED tests**

Cover these call-order and zero-repeat cases:

```js
assert.deepEqual(order, [
  'claim', 'materialize', 'markCalling', 'provider',
  'providerArtifact', 'normalize', 'normalizedArtifact',
  'recordResult', 'settle', 'cleanup',
]);
assert.equal(providerCalls, 1);
```

Additional tests:

- stale current plan/source/reservation: zero materializer and provider calls;
- provider-succeeded redelivery: skip materializer/provider and resume escalation/settlement;
- claimed pre-call Storage failure: `failed_retryable`, reservation retained, HTTP layer may return 503;
- provider promise rejects after invocation: `billing_uncertain`, exactly one provider call, no result publication, no retry request;
- empty OCR: persist result, submit escalation, then settle actual cost;
- worker-side unsupported input drift: zero provider calls, persist unsupported result, release the reservation, and do not count a batch failure;
- actual provider cost above the reservation ceiling: `billing_uncertain`, no Fragment fact publication, and no automatic second call;
- artifact/result persistence failure after provider success: billing uncertain and no automatic second call;
- cleanup runs exactly once on every materialized path.

- [ ] **Step 2: Run RED and commit**

Run: `cd services/backend && node --test test/unit/capability-worker.test.js test/unit/routing-authorization.test.js`

Expected: FAIL because worker orchestration and resume semantics do not exist.

Run: `git diff --check`

Commit: `test(capabilities): define OCR worker lifecycle`

- [ ] **Step 3: Implement minimum orchestration**

The paid-call boundary is explicit:

```js
await authorizer.markCalling({ uid: task.ownerId, executionId, leaseOwner });
let providerOutput;
try {
  providerOutput = await ocrProvider.process(providerInput);
} catch {
  await authorizer.markBillingUncertain({
    uid: task.ownerId,
    executionId,
    leaseOwner,
    errorCode: 'provider-call-uncertain',
  });
  return { outcome: 'billing_uncertain', retryable: false };
}
```

No catch after `markCalling` may return a retryable outcome unless code can prove the provider method was never invoked. Persist artifacts before `recordCapabilityResult`; submit an escalation only after the insufficient result exists; settle only after result and escalation persistence succeed.

- [ ] **Step 4: Run GREEN and commit**

Run: `cd services/backend && node --test test/unit/capability-worker.test.js test/unit/routing-authorization.test.js test/unit/source-materializer.test.js`

Expected: PASS.

Run: `git diff --check`

Commit: `feat(capabilities): execute and settle approved OCR work`

---

### Task 11: Worker Route and Three Isolated Composition Roots

**Files:**
- Create: `services/backend/src/capabilities/routes.js`
- Create: `services/backend/src/composition/capability-worker.js`
- Create: `services/backend/test/helpers/create-capability-worker-test-app.js`
- Create: `services/backend/test/integration/capability-worker-app.test.js`
- Modify: `services/backend/src/composition/runtime.js`
- Modify: `services/backend/src/composition/ingestion.js`
- Modify: `services/backend/test/integration/composition.test.js`
- Modify: `services/backend/test/integration/ingestion-app.test.js`

**Interfaces:**
- Produces: worker-only `POST /internal/capabilities/ocr`.
- Maps: invalid task `400`, safe retryable pre-call outcome `503`, all acknowledged terminal/uncertain outcomes `204`.
- Keeps: `/healthz` and `/readyz` public; no production `/protected` route.

- [ ] **Step 1: Write route/composition RED tests**

```js
test('only the worker root exposes the internal OCR task route', async () => {
  assert.equal((await api.inject({ method: 'POST', url: OCR_ROUTE })).statusCode, 404);
  assert.equal((await ingestion.inject({ method: 'POST', url: OCR_ROUTE })).statusCode, 404);
  assert.equal((await worker.inject({ method: 'POST', url: OCR_ROUTE, payload: TASK })).statusCode, 204);
});

test('worker errors use server request.id only', async () => {
  const response = await worker.inject({
    method: 'POST',
    url: OCR_ROUTE,
    payload: { ...TASK, requestId: 'forged-client-id' },
  });
  assert.equal(response.statusCode, 400);
  assert.notEqual(response.json().error.requestId, 'forged-client-id');
});
```

Factory spies must prove API constructs neither Tasks nor Document AI; ingestion can lazily own only Tasks; worker can lazily own only Document AI. All constructors remain zero in fake mode and before the relevant method is called. Parse optional `X-CloudTasks-TaskName`, retry-count, and execution-count headers only into bounded observability fields such as `taskDeliveryCount`; they never replace IAM identity or repository authorization.

- [ ] **Step 2: Run RED and commit**

Run: `cd services/backend && node --test test/integration/capability-worker-app.test.js test/integration/composition.test.js test/integration/ingestion-app.test.js`

Expected: FAIL because worker mode and route do not exist.

Run: `git diff --check`

Commit: `test(capabilities): define isolated worker composition`

- [ ] **Step 3: Implement root isolation and stable route semantics**

`createRuntimeApp` must branch before constructing root-specific adapters. Ingestion receives scheduler + fake/real dispatcher; capability-worker receives materializer + artifact store + fake/real OCR provider + worker service. API receives none. The route body uses a strict Zod object with exactly four fields. Cloud Tasks headers are optional observability only and never authorize the request.

Production documentation must state that Cloud Run IAM denies unauthenticated requests before Fastify and only `OCR_TASK_SERVICE_ACCOUNT` receives `run.invoker`.

- [ ] **Step 4: Run GREEN and commit**

Run: `cd services/backend && node --test test/integration/capability-worker-app.test.js test/integration/composition.test.js test/integration/ingestion-app.test.js test/integration/app.test.js`

Expected: PASS.

Run: `git diff --check`

Commit: `feat(capabilities): isolate the OCR worker runtime`

---

### Task 12: Firestore Transactions, Rules, and Emulator End-to-End

**Files:**
- Modify: `services/backend/src/repositories/firestore.js`
- Modify: `services/backend/test/contract/firestore-repository.test.js`
- Modify: `services/backend/test/contract/memory-repository.test.js`
- Modify: `services/backend/test/contract/capability-repository.contract.js`
- Create: `services/backend/test/emulator/capability-execution.emulator.test.js`
- Modify: `services/backend/package.json`
- Modify: `firebase/firestore.rules`
- Modify: `firebase/storage.rules`
- Modify: `services/backend/test/rules/firestore.rules.test.js`
- Modify: `services/backend/test/rules/storage.rules.test.js`

**Interfaces:**
- Produces Firestore behavior identical to the Memory contract.
- Produces client denial for `capabilityExecutions`, `capabilityResults`, `budget*`, and `capability-results/**` artifacts.
- Produces emulator flow `approved plan → fake dispatch → fake worker delivery → result → settlement`.

- [ ] **Step 1: Extend shared contracts and write Emulator/Rules RED tests**

The Emulator test captures the fake-dispatch payload, injects it into the worker harness, and asserts one provider call across a repeated Storage event and repeated task delivery:

```js
assert.equal(dispatchCalls.length, 1);
assert.equal(providerCalls.length, 1);
assert.equal(result.state, 'completed');
assert.equal(reservation.state, 'settled');
assert.equal(batch.capabilitySummary.completed, 1);
```

Rules tests must try read/create/update/delete for Firestore internal documents and read/create/overwrite/delete for both capability artifact paths as owner, other user, and anonymous client; every operation fails.

- [ ] **Step 2: Run RED and commit**

Run:

```bash
cd services/backend
PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" \
JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home" \
npm run test:emulator
```

Expected: FAIL because Firestore lacks capability-result transactions and the emulator script omits the new suite.

Run: `git diff --check`

Commit: `test(capabilities): define Firestore and Rules integration`

- [ ] **Step 3: Implement Firestore parity and deny-by-default Rules**

Use Firestore transactions for preparation, queue marking, claim, call boundary, result recording, settlement, failure, and billing uncertainty. Read the current head/plan/source/reservation inside each transaction; never trust task payload copies. Create `capabilityResults` with `transaction.create`, update all budget ledgers and batch/fragment projections in the same settlement transaction, and preserve exact-replay behavior.

Add explicit server-only rules:

```text
match /users/{userId}/capabilityResults/{resultId} {
  allow read, write: if false;
}

match /users/{userId}/capability-results/{path=**} {
  allow read, write: if false;
}
```

Append `test/emulator/capability-execution.emulator.test.js` to `test:emulator`; Firebase CLI owns startup and cleanup through `emulators:exec`.

- [ ] **Step 4: Run GREEN and commit**

Run:

```bash
cd services/backend
PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" \
JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home" \
npm run test:emulator
```

Expected: PASS with Auth, Firestore, and Storage emulators stopped by `emulators:exec` after the command.

Run: `git diff --check`

Commit: `feat(capabilities): persist OCR execution atomically`

---

### Task 13: Documentation, Zero-Call Proof, Audit, and Full Regression

**Files:**
- Create: `docs/implementation/capability-execution-ocr-v1.md`
- Modify: `docs/Elsewhere_PRD_v3.0.md`
- Modify: `docs/Elsewhere_Google_First_Technical_Architecture_v1.0.md`
- Modify: `docs/implementation/backend-foundation-v1.md`
- Modify: `docs/implementation/authoritative-routing-v1.md`
- Modify: `docs/implementation/else-ai-service-v1.md`
- Modify: `services/backend/.env.example`
- Modify: `services/backend/README.md`
- Modify: `services/backend/test/integration/composition.test.js`

**Interfaces:**
- Documents exact v1 operational boundary, configuration, IAM, processor provisioning, smoke guard, pricing version, recovery semantics, and verification evidence.
- Does not add production behavior.

- [ ] **Step 1: Add the final zero-call regression assertion**

Extend composition tests with injected constructor/method counters and run the ordinary suite with all Google credential variables deleted. Assert every real Tasks/Document AI counter is zero.

- [ ] **Step 2: Run RED and commit**

Run: `cd services/backend && env -u GOOGLE_APPLICATION_CREDENTIALS -u GOOGLE_CLOUD_PROJECT -u DOCUMENT_AI_PROJECT_ID node --test test/integration/composition.test.js`

Expected: FAIL until all fake/default roots expose and satisfy zero-call counters.

Run: `git diff --check`

Commit: `test(capabilities): prove default execution has zero cloud calls`

- [ ] **Step 3: Finish zero-call wiring and write operational docs**

Document:

- the three runtime roots and distinct service accounts;
- exact environment fields and fail-closed matrix;
- Cloud Tasks OIDC/IAM setup boundary without provisioning commands that grant broad roles;
- precreated processor + fixed version requirement;
- policy v2 migration from historical PDF-v1 behavior;
- `billing_uncertain` manual audit requirement;
- provider/normalized artifact privacy;
- current price snapshot identifier `document-ai-enterprise-ocr-2026-07-17`;
- manual smoke accepts only a synthetic/desensitized one-page fixture;
- Places, Embedding, and Gemini remain unimplemented.

- [ ] **Step 4: Run every fresh verification command**

Run:

```bash
cd services/backend
node --test test/unit/capability-*.test.js \
  test/unit/cloud-tasks-dispatcher.test.js \
  test/unit/document-ai-ocr.test.js \
  test/unit/ocr-normalizer.test.js \
  test/unit/firebase-capability-artifact-store.test.js
node --test test/integration/*.test.js
npm test
PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" \
JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home" \
npm run test:emulator
npm audit
npm audit --omit=dev
cd ../..
docker build -f services/backend/Dockerfile -t elsewhere-backend:module5a .
git diff --check
git status --short
```

Expected:

- all Node tests pass;
- all Emulator and Rules tests pass and emulators are cleaned up;
- both audits have no unexplained high/critical production issue;
- Docker build completes on Node 22;
- `git diff --check` prints nothing;
- `git status --short` lists only the intended documentation/zero-call edits before commit.

- [ ] **Step 5: Commit the implementation record**

Commit: `docs(capabilities): document OCR execution and verification`

- [ ] **Step 6: Stop at the Module 5A boundary**

Run: `git log --oneline --decorate -30 && git status --short`

Expected: every RED/GREEN/documentation phase is visible as a separate commit and the worktree is clean. Report the exact commands and fresh results. Do not begin Places, Embedding, Gemini, deployment, or frontend work.
