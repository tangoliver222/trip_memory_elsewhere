# Deterministic Media Processing TDD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Module 4 as a recoverable, owner-scoped deterministic processing pipeline that preserves every original Fragment, computes bounded technical facts and hashes, creates safe derivatives, records exact/near duplicate suggestions, and updates versioned batch summaries exactly once.

**Architecture:** `elsewhere-ingestion` continues to receive the Storage finalized Eventarc request, completes Module 3 original finalization, then synchronously ensures and claims a persistent `ProcessingTask`. Domain code owns identities, state machines, dHash, candidate ordering and batch reducers; Firebase adapters own generation-pinned bytes, derivatives and Firestore transactions. The current request returns `204` only after a terminal task, Fragment result and ImportBatch summary commit; retryable or busy work returns `503` for Eventarc redelivery.

**Tech Stack:** Node.js `>=22`, Fastify `5.10.0`, Zod `4.4.3`, Firebase Admin `14.1.0`, Firebase Web SDK `12.16.0`, Node `node:test`, `sharp` `0.35.3`, `exifreader` `4.41.0`, Firebase Auth/Firestore/Storage Emulators, Docker/Cloud Run Linux image.

## Global Constraints

- Execute strict RED -> GREEN -> REFACTOR. Before each production behavior, run the smallest failing test and confirm its failure is caused by the missing behavior.
- Commit each RED contract and its corresponding GREEN/REFACTOR separately. Do not amend or combine the whole module into one commit.
- Work only in `/Users/tangyixuan/trip_memory_elsewhere/.worktrees/backend-foundation-v1` on branch `codex/backend-foundation-v1`.
- Do not modify `/design-lab`, frontend routes, frontend fixtures or visual assets.
- Do not implement Module 5: no OCR, Document AI, Gemini media understanding, Places, timezone resolution, entities, visits, scenes, connections or discoveries.
- Do not add Cloud Tasks, Pub/Sub, production deployment resources, user duplicate decisions, automatic merge/delete, malware scanning or semantic content safety classification.
- Add exactly two runtime dependencies, pinned without ranges: `sharp@0.35.3` and `exifreader@4.41.0`. Add no other runtime or development dependency.
- Preserve the original Fragment for every duplicate, partial capability and terminal processing failure.
- Processing task identity is the canonical tuple `ownerId + fragmentId + processorName + processorVersion + bucket + objectName + generation`; `inputHash` is never part of the initial task ID.
- Processor identity is exactly `processorName=deterministic-media`, `processorVersion=v1`, `schemaVersion=1`.
- Task states are exactly `pending|running|succeeded|failed_retryable|failed_terminal`; steps are exactly `queued|hashing|hash_registered|metadata|derivatives|duplicate_search|committing|complete`.
- Defaults are `softTimeout=180000`, `lease=240000`, `requestTimeout=300000`, `cleanupMargin=30000`; startup requires `softTimeout < lease <= requestTimeout - cleanupMargin`.
- Hard caps are 50 MiB input bytes, 60,000,000 input pixels, width/height 20,000, page/frame count 100 only when reliably reported, and 16 MiB decompressed metadata.
- Source reads are bucket/path/generation pinned, streamed to a random task directory with mode `0o700` and file mode `0o600`, bounded by authoritative size and deadline, and cleaned in `finally`.
- Current PDF behavior is `pageCount=null`, warning `processing/page-count-unsupported`, and no thumbnail/dHash. Never claim the PDF page limit was validated.
- Unsupported capability is a successful warning outcome, not a failure. Adapter capability states are exactly `complete|partial|unsupported|failed`.
- dHash is exactly orientation -> alpha on white -> grayscale -> Lanczos3 `9x8` -> row-major `left > right` -> MSB first -> 16 lowercase hex -> eight position-prefixed 8-bit bands.
- Near search is owner-scoped: band-match dedupe, self-exclusion, `fragmentId ASC`, exact distance for at most 200 candidates, threshold `<=6`, then `distance ASC, fragmentId ASC`, top 5.
- Near candidates persist `queryFragmentRef`, `matchedFragmentRef`, sorted `pairRefs`, sorted `pairKey`; `rank` is directional and only relative to `queryFragmentRef`.
- Batch processing counters are idempotent by `fragmentId + processorName + processorVersion`; a late old-version task cannot mutate the active version summary or top-level counters.
- Upload terminal failure and deterministic terminal failure remain separate internal counts. Top-level `failed` is the unique failed Fragment count. Unsupported capability never increments it.
- Derivative creation uses a deterministic path and `ifGenerationMatch:0`; an existing object is reusable only when all frozen custom/storage metadata matches.
- Return `204` only after terminal ProcessingTask + Fragment result + ImportBatch summary are committed. A terminal transaction failure returns `503`. `Retry-After` may be a hint but is never correctness-critical.
- Error responses and logs never expose raw Firebase/Storage/Sharp/ExifReader errors, object paths, original names, complete EXIF, Source Descriptor, credentials or temporary paths.
- `elsewhere-api` and `elsewhere-ingestion` continue to share one image but no production processing route is added. `/protected` remains test-harness-only.
- Run focused tests before every commit; before completion run ordinary tests, all Emulator tests, Docker Linux smoke, `npm audit --omit=dev`, and `git diff --check`.
- Stop after Module 4 is documented and verified. Do not enter Module 5 without explicit authorization.

## File Map and Responsibilities

### New production files

- `services/backend/src/domain/processing-task.js` — strict ProcessingTask schema and state/step invariants.
- `services/backend/src/domain/processing-result.js` — nullable technical metadata, derivative and Fragment processing result schemas.
- `services/backend/src/domain/duplicate-candidate.js` — exact/near candidate schemas and pair-role invariants.
- `services/backend/src/processing/identity.js` — canonical task, candidate, pair and derivative identities.
- `services/backend/src/processing/dhash.js` — pure 64-bit dHash packing, bands and Hamming distance.
- `services/backend/src/processing/near-duplicates.js` — deterministic candidate dedupe/scan/rank reducer.
- `services/backend/src/processing/errors.js` — stable processing errors and retryability mapping.
- `services/backend/src/processing/service.js` — orchestration, deadline, checkpoints and cleanup only.
- `services/backend/src/adapters/firebase-source-materializer.js` — generation-pinned streaming materialization and SHA-256.
- `services/backend/src/adapters/media-metadata-reader.js` — bounded whitelist metadata/text/PDF capability extraction.
- `services/backend/src/adapters/sharp-image-processor.js` — bounded thumbnail and dHash pixel pipeline.
- `services/backend/src/adapters/firebase-derivative-store.js` — create-only derivative persistence and strict reuse.
- `services/backend/src/repositories/processing-outcome.js` — pure claim/lease/batch transition normalization shared by adapters.
- `services/backend/src/ingestion/pipeline.js` — Module 3 finalizer -> Module 4 processor lifecycle.
- `services/backend/scripts/media-capability-smoke.mjs` — Linux image capability report with no customer files.
- `docs/implementation/deterministic-processing-v1.md` — implemented contract, operational limits and verification evidence.

### New test files

- `services/backend/test/fixtures/processing.js`
- `services/backend/test/fixtures/media.js`
- `services/backend/test/unit/processing-domain.test.js`
- `services/backend/test/unit/processing-identity.test.js`
- `services/backend/test/unit/dhash.test.js`
- `services/backend/test/unit/near-duplicates.test.js`
- `services/backend/test/contract/processing-repository.contract.js`
- `services/backend/test/unit/source-materializer.test.js`
- `services/backend/test/unit/media-metadata-reader.test.js`
- `services/backend/test/unit/sharp-image-processor.test.js`
- `services/backend/test/unit/firebase-derivative-store.test.js`
- `services/backend/test/unit/deterministic-processor.test.js`
- `services/backend/test/unit/ingestion-pipeline.test.js`
- `services/backend/test/integration/ingestion-processing-app.test.js`
- `services/backend/test/emulator/deterministic-processing.emulator.test.js`

### Existing files modified deliberately

- Domain: `services/backend/src/domain/fragment.js`, `import-batch.js`, `index.js`.
- Module 3 compatibility: `services/backend/src/ingestion/service.js`, `services/backend/test/fixtures/import.js`, existing Module 3 unit/contract/Emulator expectations.
- Repository ports/adapters: `services/backend/src/repositories/contract.js`, `errors.js`, `memory.js`, `firestore.js` and both repository contract entry tests.
- Runtime/composition: `services/backend/src/config.js`, `.env.example`, `composition/ingestion.js`, `composition/runtime.js`, `ingestion/routes.js` and test harnesses.
- Rules/indexes: `firebase/firestore.rules`, `firebase/storage.rules`, `firebase/firestore.indexes.json` only if the Emulator proves a composite index is required.
- Build/tests/docs: `services/backend/package.json`, `package-lock.json`, `Dockerfile`, `README.md`, root/backend test scripts and Module 4 implementation doc.

---

### Task 1: Processing domain, source revision and versioned batch contracts

**Files:**
- Create: `services/backend/test/fixtures/processing.js`
- Create: `services/backend/test/unit/processing-domain.test.js`
- Create: `services/backend/src/domain/processing-task.js`
- Create: `services/backend/src/domain/processing-result.js`
- Create: `services/backend/src/domain/duplicate-candidate.js`
- Modify: `services/backend/src/domain/fragment.js`
- Modify: `services/backend/src/domain/import-batch.js`
- Modify: `services/backend/src/domain/index.js`
- Modify: `services/backend/src/imports/service.js`
- Modify: `services/backend/src/ingestion/service.js`
- Modify: `services/backend/test/fixtures/import.js`
- Modify: `services/backend/test/unit/domain.test.js`
- Modify: `services/backend/test/unit/import-domain.test.js`
- Modify: `services/backend/test/unit/import-service.test.js`
- Modify: `services/backend/test/unit/original-finalizer.test.js`
- Modify: `services/backend/test/emulator/import-original.emulator.test.js`

**Interfaces:**
- Produces `ProcessingTaskSchema`, `parseProcessingTask(input)` and the frozen state/step enums.
- Produces `TechnicalMetadataSchema`, `ThumbnailDerivativeSchema` and `DeterministicFragmentProcessingSchema`.
- Produces `DuplicateCandidateSchema` and `parseDuplicateCandidate(input)`.
- Extends `Fragment.storage` with required `bucket` and adds explicit nullable hash/result fields.
- Extends `ImportBatch` with nullable `processingSummary`, initialized to `null` by Module 3.

- [ ] **Step 1: Write strict failing domain tests**

`processing-domain.test.js` must contain named tests proving:

```js
test('task identity fields exclude inputHash and require a complete source revision', () => {});
test('task states enforce lease deadline step and completion invariants', () => {});
test('fragment processing fields use null rather than empty or forged values', () => {});
test('near candidate keeps directional roles and sorted pairRefs', () => {});
test('exact candidate keeps canonical and candidate roles', () => {});
test('processing summary records active processor name and version', () => {});
test('PDF technical metadata keeps pageCount null and the unsupported warning', () => {});
```

The default ProcessingTask fixture must use `running`, `currentStep=hashing`, a complete lease, `inputHash=null`, and capability outputs set to null. Negative cases must cover missing bucket/generation, running without lease, terminal without `completedAt`, retryable with `completedAt`, invalid 15-character dHash, unsorted `pairRefs`, and rank on an exact candidate.

- [ ] **Step 2: Run RED and confirm the missing-domain failure**

```bash
cd services/backend
node --test test/unit/processing-domain.test.js test/unit/import-domain.test.js test/unit/original-finalizer.test.js
```

Expected: `ERR_MODULE_NOT_FOUND` for `src/domain/processing-task.js` or named exports missing from `domain/index.js`. Existing tests may also fail after fixtures are deliberately changed; confirm no unrelated runtime error.

- [ ] **Step 3: Commit the RED domain contract**

```bash
git add services/backend/test/fixtures/processing.js services/backend/test/fixtures/import.js services/backend/test/unit/processing-domain.test.js services/backend/test/unit/domain.test.js services/backend/test/unit/import-domain.test.js services/backend/test/unit/import-service.test.js services/backend/test/unit/original-finalizer.test.js services/backend/test/emulator/import-original.emulator.test.js
git commit -m "test(processing): define task and result contracts"
```

- [ ] **Step 4: Implement the minimum strict schemas**

Implement these exact persisted shapes:

```js
ProcessingTask = {
  id, ownerId, schemaVersion: 1, fragmentId, batchId,
  processorName: 'deterministic-media', processorVersion: 'v1',
  sourceRevision: { bucket, objectName, generation },
  inputHash: null | /^[a-f0-9]{64}$/,
  state, currentStep, leaseOwner, attemptCount, outputs,
  lastErrorCode, createdAt, updatedAt, firstStartedAt, attemptStartedAt,
  lastHeartbeatAt, softDeadlineAt, leaseAcquiredAt, leaseExpiresAt,
  completedAt, deletedAt
}
```

`outputs` is strict and contains nullable `metadataStatus`, `thumbnailStatus`, `perceptualHashStatus`, plus unique stable `warningCodes`. Fragment hashes are `{ sha256, perceptualHash, perceptualHashAlgorithm, perceptualHashVersion, perceptualHashBands }` with explicit nulls before processing. `technicalMetadata` and `derivatives.thumbnail` are nullable. `processing.deterministic` is nullable before claim.

ImportBatch initial shape adds:

```js
processingSummary: null | {
  deterministic: {
    processorName: 'deterministic-media', processorVersion: 'v1',
    eligible, running, succeeded, failedRetryable, failedTerminal,
    unsupportedCapabilities, updatedAt
  }
}
```

All summary counters are nonnegative integers; only `unsupportedCapabilities` may exceed `inputCount`. Update Module 3 creation/finalization fixtures so every new Fragment persists `storage.bucket`, explicit null processing fields, and every new ImportBatch persists `processingSummary:null`.
`imports/service.js` initializes that null summary but keeps the public Module 3 receipt unchanged.

- [ ] **Step 5: Run GREEN and regression**

```bash
node --test test/unit/processing-domain.test.js test/unit/import-domain.test.js test/unit/original-finalizer.test.js test/contract/memory-repository.test.js
npm test
git diff --check
```

Expected: focused tests and ordinary suite pass with zero failures; no frontend file changes.

- [ ] **Step 6: Commit the domain implementation**

```bash
git add services/backend/src/domain/processing-task.js services/backend/src/domain/processing-result.js services/backend/src/domain/duplicate-candidate.js services/backend/src/domain/fragment.js services/backend/src/domain/import-batch.js services/backend/src/domain/index.js services/backend/src/imports/service.js services/backend/src/ingestion/service.js services/backend/test/fixtures/import.js services/backend/test/unit/domain.test.js services/backend/test/unit/import-domain.test.js services/backend/test/unit/import-service.test.js services/backend/test/unit/original-finalizer.test.js services/backend/test/emulator/import-original.emulator.test.js
git commit -m "feat(processing): add deterministic processing domain"
```

---

### Task 2: Canonical identities, dHash and deterministic near ranking

**Files:**
- Create: `services/backend/test/unit/processing-identity.test.js`
- Create: `services/backend/test/unit/dhash.test.js`
- Create: `services/backend/test/unit/near-duplicates.test.js`
- Create: `services/backend/src/processing/identity.js`
- Create: `services/backend/src/processing/dhash.js`
- Create: `services/backend/src/processing/near-duplicates.js`

**Interfaces:**
- Produces `makeProcessingTaskId(sourceRevisionInput)`.
- Produces `makeExactCandidateId(input)`, `makeNearCandidateId(input)`, `makePairKey(fragmentIds)` and `makeDerivativePath(input)`.
- Produces `encodeDHash(grayscale9x8)`, `splitDHashBands(hash)` and `hammingDistance64(a,b)`.
- Produces `selectNearDuplicates({ queryFragmentId, queryHash, bandMatches, scanLimit=200, threshold=6, limit=5 })`.

- [ ] **Step 1: Write failing identity and algorithm tests**

Use fixed vectors, not snapshots:

```js
assert.equal(encodeDHash(new Uint8Array(72).fill(7)), '0000000000000000');
assert.deepEqual(splitDHashBands('0f1ea203917c40ee'), [
  '0:0f', '1:1e', '2:a2', '3:03', '4:91', '5:7c', '6:40', '7:ee',
]);
assert.equal(hammingDistance64('0000000000000000', '000000000000003f'), 6);
```

Add a descending-row fixture whose 64 comparisons are all true and therefore hashes to `ffffffffffffffff`; assert equal pixels produce bit `0`. Task ID tests must prove changing `inputHash` has no effect while changing bucket/path/generation/version does. Near identity must be directional; pair key and pair refs must remain sorted.

For ranking, construct 205 shuffled band matches plus duplicate hits and self. Assert the reducer first deduplicates and sorts IDs, computes exact distance for only the first 200 non-self IDs, excludes a perfect match at stable position 201, sorts accepted results by distance then ID, and returns ranks 1-5. Assert `truncated=true` and no natural input order affects output.

- [ ] **Step 2: Run RED**

```bash
node --test test/unit/processing-identity.test.js test/unit/dhash.test.js test/unit/near-duplicates.test.js
```

Expected: `ERR_MODULE_NOT_FOUND` for `src/processing/identity.js`. Do not create algorithm stubs before observing the failure.

- [ ] **Step 3: Commit the RED algorithm contract**

```bash
git add services/backend/test/unit/processing-identity.test.js services/backend/test/unit/dhash.test.js services/backend/test/unit/near-duplicates.test.js
git commit -m "test(processing): define deterministic identities and hashing"
```

- [ ] **Step 4: Implement pure minimal algorithms**

Use Node `createHash('sha256')` over a length-prefixed canonical tuple, never string concatenation with ambiguous delimiters. Validate all inputs before hashing. `encodeDHash` requires exactly 72 one-byte grayscale values and emits MSB-first row-major bits. Hamming distance uses `BigInt` XOR and a bounded popcount loop.

`selectNearDuplicates()` must normalize each match to `{ fragmentId, perceptualHash }`, dedupe by Fragment ID, exclude self, sort by ID, slice the stable scan window before distance calculation, discard distance above six, then sort and rank. It returns a frozen `{ matches, truncated }` and never mutates input.

- [ ] **Step 5: Run GREEN and regression**

```bash
node --test test/unit/processing-identity.test.js test/unit/dhash.test.js test/unit/near-duplicates.test.js
npm test
git diff --check
```

- [ ] **Step 6: Commit the algorithms**

```bash
git add services/backend/src/processing
git commit -m "feat(processing): add deterministic identities and dHash"
```

---

### Task 3: Runtime processing limits and stable errors

**Files:**
- Create: `services/backend/src/processing/errors.js`
- Create: `services/backend/test/unit/processing-config.test.js`
- Modify: `services/backend/src/config.js`
- Modify: `services/backend/test/unit/config.test.js`
- Modify: `services/backend/.env.example`

**Interfaces:**
- Extends `loadConfig()` with frozen `processing` limits.
- Produces `ProcessingError`, `retryableProcessingError(code)` and `terminalProcessingError(code)`.

- [ ] **Step 1: Write failing config/error tests**

Assert exact safe defaults and the invariant:

```js
assert.deepEqual(config.processing.timeouts, {
  softMs: 180000, leaseMs: 240000, requestMs: 300000, cleanupMarginMs: 30000,
});
```

Test rejection of `soft>=lease`, `lease>request-cleanup`, zero/negative values, bytes/pixels/dimensions/pages/metadata above hard caps, and raw invalid values not appearing in the error message. Test stable processing errors expose only code/message/retryable and never a cause message.

- [ ] **Step 2: Run RED**

```bash
node --test test/unit/processing-config.test.js test/unit/config.test.js
```

Expected: assertions fail because `config.processing` and `processing/errors.js` do not exist.

- [ ] **Step 3: Commit RED**

```bash
git add services/backend/test/unit/processing-config.test.js services/backend/test/unit/config.test.js
git commit -m "test(processing): define runtime safety limits"
```

- [ ] **Step 4: Add minimal validated config and errors**

Add the exact environment fields from the design. Parse integers with Zod, enforce every relational invariant after parsing, return a deeply frozen `processing` object, and document the fields in `.env.example`. Do not add scan threshold/top-K configuration; those are frozen algorithm constants.

Stable codes are exactly:

```text
processing/task-busy
processing/soft-timeout
processing/storage-unavailable
processing/repository-unavailable
processing/media-limits-exceeded
processing/invalid-media
processing/derivative-conflict
```

- [ ] **Step 5: Run GREEN and regression**

```bash
node --test test/unit/processing-config.test.js test/unit/config.test.js
npm test
git diff --check
```

- [ ] **Step 6: Commit implementation**

```bash
git add services/backend/src/config.js services/backend/src/processing/errors.js services/backend/.env.example
git commit -m "feat(processing): enforce runtime safety limits"
```

---

### Task 4: Memory repository lease lifecycle and versioned summary

**Files:**
- Create: `services/backend/test/contract/processing-repository.contract.js`
- Create: `services/backend/src/repositories/processing-outcome.js`
- Modify: `services/backend/test/contract/memory-repository.test.js`
- Modify: `services/backend/src/repositories/contract.js`
- Modify: `services/backend/src/repositories/errors.js`
- Modify: `services/backend/src/repositories/memory.js`

**Interfaces:**
- Produces repository methods `claimProcessingTask`, `heartbeatProcessingTask`, `registerContentHash`, `findNearDuplicateInputs`, `completeDeterministicProcessing`, `failDeterministicProcessing`.
- This task implements claim, heartbeat and retryable failure in memory; Task 5 completes the remaining methods before production orchestration uses the port.

- [ ] **Step 1: Add failing memory contract cases for leases**

Create a reusable contract with named cases:

```js
test(`${name}: creates and claims one versioned processing task`, async () => {});
test(`${name}: an active lease is busy and cannot be stolen`, async () => {});
test(`${name}: an expired lease is reclaimed with attemptCount plus one`, async () => {});
test(`${name}: only the current lease owner can heartbeat or transition`, async () => {});
test(`${name}: retryable failure releases lease and moves summary exactly once`, async () => {});
test(`${name}: terminal tasks are claim no-ops`, async () => {});
```

Seed a finalized Fragment and batch. Assert the first claim moves Fragment `uploaded -> processing`, initializes active `processingSummary.deterministic`, sets `eligible=1/running=1`, and never changes upload counters. Retry identical calls and mutate returned objects to prove idempotency and cloning.

- [ ] **Step 2: Run RED**

```bash
node --test test/contract/memory-repository.test.js
```

Expected: FAIL with `repository.claimProcessingTask is not a function`.

- [ ] **Step 3: Commit RED lease contract**

```bash
git add services/backend/test/contract/processing-repository.contract.js services/backend/test/contract/memory-repository.test.js
git commit -m "test(processing): define task lease repository contract"
```

- [ ] **Step 4: Implement the minimum in-memory lease state machine**

`processing-outcome.js` must normalize IDs/timestamps, compare ISO instants, verify lease ownership and calculate one task's old/new contribution to the active summary. It must be pure and return parsed next objects. `memory.js` stores tasks in a private owner-scoped map and commits Fragment, Task and Batch together by calculating all values before any map write.

Claim result is one of:

```js
{ outcome: 'claimed', task, fragment, batch }
{ outcome: 'busy', task }
{ outcome: 'terminal', task }
```

Do not expose a mutable store or test-only repository method.

- [ ] **Step 5: Run GREEN and regression**

```bash
node --test test/contract/memory-repository.test.js test/unit/import-service.test.js test/unit/original-finalizer.test.js
npm test
git diff --check
```

- [ ] **Step 6: Commit lease implementation**

```bash
git add services/backend/src/repositories
git commit -m "feat(processing): add recoverable task leases in memory"
```

---

### Task 5: Memory exact hash, near inputs and terminal atomicity

**Files:**
- Modify: `services/backend/test/contract/processing-repository.contract.js`
- Modify: `services/backend/src/repositories/processing-outcome.js`
- Modify: `services/backend/src/repositories/memory.js`

**Interfaces:**
- Completes every processing repository method declared in Task 4.
- `registerContentHash()` returns `{ canonicalFragmentRef, exactCandidate }` and is idempotent for the same Fragment/version/hash.
- `completeDeterministicProcessing()` atomically persists terminal Task, Fragment outputs, near candidates and active batch summary.

- [ ] **Step 1: Add failing hash, candidate and terminal contract cases**

Extend the shared contract with these exact behaviors:

```js
test(`${name}: concurrent equal hashes select one owner-scoped canonical`, async () => {});
test(`${name}: repeated hash registration does not increment fragmentCount`, async () => {});
test(`${name}: near inputs are owner scoped deduplicated and document-id ordered`, async () => {});
test(`${name}: success atomically persists task fragment candidates and batch`, async () => {});
test(`${name}: terminal failure is distinct from upload failure`, async () => {});
test(`${name}: unsupported capabilities do not increment failed`, async () => {});
test(`${name}: suggested time and GPS never overwrite user or other-source facts`, async () => {});
test(`${name}: a late old processor version cannot mutate the active summary`, async () => {});
test(`${name}: repeating terminal completion is a no-op`, async () => {});
```

Use two finalized Fragments with equal SHA-256. Run registrations through `Promise.all`; assert one ContentHash canonical, one deterministic exact candidate, two preserved Fragments and `fragmentCount=2`. Complete a task with two unsupported capability outcomes and assert `unsupportedCapabilities=2`, `succeeded=1`, `processed=1`, `failed=0`. Complete a terminal failure and assert `processingSummary.deterministic.failedTerminal=1` and top-level failed counts the unique Fragment once.

Inject a transaction-failure hook only through the contract factory, not the production repository API. Assert no Task terminal state, Fragment result or batch counter changes when the simulated commit throws.

- [ ] **Step 2: Run RED**

```bash
node --test test/contract/memory-repository.test.js
```

Expected: FAIL because `registerContentHash`, near lookup or terminal methods are missing/not atomic. Confirm the earlier lease cases remain green.

- [ ] **Step 3: Commit RED terminal contract**

```bash
git add services/backend/test/contract/processing-repository.contract.js
git commit -m "test(processing): define hash and terminal repository contracts"
```

- [ ] **Step 4: Implement content hash and terminal transitions**

Use private owner-scoped maps for ContentHash and DuplicateCandidate. Exact registration validates that the Fragment is owned, finalized, and attached to the claimed task before writing. Candidate IDs and sorted refs come only from Task 2 identity helpers.

`completeDeterministicProcessing()` accepts:

```js
{
  taskId, leaseOwner, completedAt,
  technicalMetadata,
  factSuggestions,
  derivative: null | thumbnailFacts,
  perceptualHash: null | { value, bands },
  capabilityStatuses,
  warningCodes,
  nearMatches
}
```

It validates near match ranks/roles, computes all next parsed objects first, then writes them together. Active-version summary changes by subtracting the task's previous contribution and adding the terminal contribution. Top-level `failed` is `uploadFailed + activeVersionFailedTerminal`; the invariant that processing tasks exist only for finalized uploads makes the sets disjoint and therefore unique by Fragment ID.

`factSuggestions` contains only whitelisted EXIF local time/offset and GPS Provenance values. The
terminal reducer may create a missing fact or refresh a fact owned by the same processor/source revision;
it preserves user, confirmed, corrected and other-source facts and adds a stable conflict warning instead.
It never mutates the persisted Source Descriptor.

Batch status derivation after upload convergence is exact:

```text
pending upload -> open
active tasks not terminal -> processing
all eligible success and no upload failure -> completed
terminal upload/process failure -> completed_with_errors
all uploads failed -> failed
```

- [ ] **Step 5: Run GREEN and regression**

```bash
node --test test/contract/memory-repository.test.js test/unit/import-domain.test.js
npm test
git diff --check
```

- [ ] **Step 6: Commit memory terminal implementation**

```bash
git add services/backend/src/repositories
git commit -m "feat(processing): commit hashes and processing outcomes"
```

---

### Task 6: Firestore processing repository parity

**Files:**
- Modify: `services/backend/test/contract/firestore-repository.test.js`
- Modify: `services/backend/test/contract/processing-repository.contract.js`
- Modify: `services/backend/src/repositories/firestore.js`
- Modify only if Emulator requests it: `firebase/firestore.indexes.json`

**Interfaces:**
- Firestore implements the exact processing repository contract already green in memory.
- All task/content-hash/candidate reads and writes stay under `users/{uid}`.

- [ ] **Step 1: Enable the full processing contract against Firestore Emulator**

Wire `runProcessingRepositoryContract()` into `firestore-repository.test.js`. Its factory must create a unique owner/batch namespace per test and clean it through Admin `recursiveDelete`. Add a Firestore-only concurrency case that registers the same hash from two independently claimed Fragments and asserts one canonical after transaction retries.

- [ ] **Step 2: Run RED under Emulator**

```bash
npx firebase emulators:exec --project demo-elsewhere --config ../../firebase/firebase.json --only firestore "node --test --test-concurrency=1 test/contract/firestore-repository.test.js"
```

Expected: FAIL with a missing processing method in `createFirestoreRepository()`; memory contract remains green. If a query index error appears later, capture its exact query shape before adding an index.

- [ ] **Step 3: Commit RED Firestore contract**

```bash
git add services/backend/test/contract/firestore-repository.test.js services/backend/test/contract/processing-repository.contract.js
git commit -m "test(processing): require Firestore task transaction parity"
```

- [ ] **Step 4: Implement transactional Firestore methods**

Use these exact paths:

```text
users/{uid}/processingTasks/{taskId}
users/{uid}/contentHashes/{sha256}
users/{uid}/duplicateCandidates/{candidateId}
users/{uid}/fragments/{fragmentId}
users/{uid}/importBatches/{batchId}
```

Claim, heartbeat, retryable failure, hash registration and terminal completion each use a Firestore transaction. Transaction bodies contain only Firestore reads/writes and pure reducers. Verify `leaseOwner` in every checkpoint/terminal transaction. Exact hash registration uses ContentHash document creation/read as the serialization point. Near lookup uses `array-contains-any` on eight prefixed bands, explicit document-ID ascending order, and retrieves at most one extra non-self candidate only to report truncation; it returns no cross-owner result.

Do not catch and mislabel owner/state validation as retryable infrastructure errors. Map only Firestore availability/transaction exhaustion to the stable repository-unavailable path at the service boundary.

- [ ] **Step 5: Run GREEN contract and Emulator regression**

```bash
npx firebase emulators:exec --project demo-elsewhere --config ../../firebase/firebase.json --only firestore "node --test --test-concurrency=1 test/contract/firestore-repository.test.js"
npm run test:emulator
npm test
git diff --check
```

Expected: memory and Firestore contracts have identical outcomes; all Emulator suites have zero failures and zero environment skips.

- [ ] **Step 6: Commit Firestore parity**

```bash
git add services/backend/src/repositories/firestore.js services/backend/test/contract firebase/firestore.indexes.json
git commit -m "feat(processing): persist task transactions in Firestore"
```

If no index change was required, omit `firebase/firestore.indexes.json` from `git add` and record that fact in the implementation doc later.

---

### Task 7: Generation-pinned source materializer and streaming SHA-256

**Files:**
- Create: `services/backend/test/unit/source-materializer.test.js`
- Create: `services/backend/src/adapters/firebase-source-materializer.js`

**Interfaces:**
- Produces `createFirebaseSourceMaterializer({ storage, allowedBuckets, tempRoot? })`.
- `materialize({ sourceRevision, expectedStorageFacts, maxBytes, signal, deadlineAt })` returns frozen `{ path, sizeBytes, inputHash, cleanup }`.

- [ ] **Step 1: Write failing materializer tests**

Use a fake Storage `file.createReadStream()` built from Node `Readable`. Cover:

```js
test('pins bucket object and generation and computes streaming SHA-256', async () => {});
test('revalidates generation size content type and crc32c before byte streaming', async () => {});
test('creates a random 0700 directory and a 0600 non-user-named file', async () => {});
test('rejects bytes beyond authoritative size or the 50 MiB hard cap', async () => {});
test('aborts the source stream at deadline or AbortSignal', async () => {});
test('cleans partial material after stream and filesystem failures', async () => {});
test('cleanup is idempotent and removes successful material', async () => {});
test('redacts bucket object path original name and raw Storage errors', async () => {});
```

Use known bytes `new TextEncoder().encode('elsewhere-original')` and assert the exact SHA-256 literal calculated in the test with Node `createHash`, plus exact byte count. Inspect `stat.mode & 0o777` while the material exists. Include a user original name containing path traversal text and prove it never appears in the temp path.

- [ ] **Step 2: Run RED**

```bash
node --test test/unit/source-materializer.test.js
```

Expected: `ERR_MODULE_NOT_FOUND` for `firebase-source-materializer.js`.

- [ ] **Step 3: Commit RED materializer tests**

```bash
git add services/backend/test/unit/source-materializer.test.js
git commit -m "test(processing): define bounded source materialization"
```

- [ ] **Step 4: Implement the minimal materializer**

Use `mkdtemp`, `chmod`, `createWriteStream({ flags:'wx', mode:0o600 })`, `Transform`, `pipeline` and `crypto.createHash`. Storage handle is `storage.bucket(bucket).file(objectName, { generation })`; no unpinned fallback is allowed. Before opening the data stream, read metadata from that pinned handle and require exact generation, size, content type and crc32c equality with the Fragment facts; nullable MD5 is not a gate. The Transform checks byte count before forwarding each chunk and updates the hash.

On any error, destroy source/destination streams, remove task material and throw only a stable processing error. Successful cleanup uses `rm(directory, { recursive:true, force:true })` and is safe when called twice. The adapter does not read the whole source into a Buffer.

- [ ] **Step 5: Run GREEN and regression**

```bash
node --test test/unit/source-materializer.test.js
npm test
git diff --check
```

- [ ] **Step 6: Commit materializer**

```bash
git add services/backend/src/adapters/firebase-source-materializer.js
git commit -m "feat(processing): materialize generation-pinned originals"
```

---

### Task 8: Pin media dependencies and extract bounded metadata

**Files:**
- Create: `services/backend/test/fixtures/media.js`
- Create: `services/backend/test/unit/media-metadata-reader.test.js`
- Create: `services/backend/src/adapters/media-metadata-reader.js`
- Modify: `services/backend/package.json`
- Modify: `services/backend/package-lock.json`

**Interfaces:**
- Adds only `sharp@0.35.3` and `exifreader@4.41.0` as exact runtime dependencies.
- Produces `createMediaMetadataReader({ limits, warningSink? })` and `read({ path, sourceType, contentType, signal, deadlineAt }) -> { technicalMetadata, factHints, metadataStatus, warningCodes }`.

- [ ] **Step 1: Write dependency/metadata tests before installation**

`media.js` exports deterministic byte fixtures for strict UTF-8, malformed UTF-8, minimal PDF, PNG with alpha, JPEG with EXIF orientation/date/GPS, and JPEG without timezone. Store bytes in JS builders/hex arrays so fixtures are reviewable and contain no user data.

Tests must assert:

```js
test('JPEG returns only the frozen EXIF whitelist and unresolved local time', async () => {});
test('explicit EXIF offset yields an instant but remains suggested', async () => {});
test('GPS becomes a suggested fact and never confirmed user truth', async () => {});
test('PDF reports pageCount null and page-count-unsupported', async () => {});
test('text is revalidated as strict streaming UTF-8 with byte count', async () => {});
test('metadata decompression above 16 MiB becomes a stable bounded failure', async () => {});
test('third-party warnings and parser errors are converted and redacted', async () => {});
test('unsupported HEIC metadata is partial or unsupported rather than fabricated', async () => {});
```

The expected metadata object lists every nullable field explicitly. The reader returns only raw, bounded
`factHints.capturedAt` and `factHints.geo` values for whitelisted EXIF time and GPS; it has no owner,
Fragment or Firestore knowledge. Assert MakerNote, serial number, XMP, ICC, embedded thumbnail and
unknown tags are absent.

- [ ] **Step 2: Run RED before adding dependencies**

```bash
node --test test/unit/media-metadata-reader.test.js
```

Expected: `ERR_MODULE_NOT_FOUND` for `media-metadata-reader.js`. This proves the production adapter is absent; do not add a stub merely to manufacture a second failure.

- [ ] **Step 3: Commit RED metadata contract**

```bash
git add services/backend/test/fixtures/media.js services/backend/test/unit/media-metadata-reader.test.js
git commit -m "test(processing): define bounded metadata extraction"
```

- [ ] **Step 4: Install the two exact dependencies**

```bash
npm install --save-exact sharp@0.35.3 exifreader@4.41.0
npm ls sharp exifreader --depth=0
npm audit --omit=dev
```

Expected: exactly those versions at depth zero and zero production vulnerabilities. If audit reports a vulnerability, stop; do not suppress it or add an override without a new design decision.

- [ ] **Step 5: Commit the audited dependency lock**

```bash
git add services/backend/package.json services/backend/package-lock.json
git commit -m "build(processing): pin media runtime dependencies"
```

- [ ] **Step 6: Implement the whitelist reader**

For images, call Sharp metadata with `limitInputPixels=60000000`, `failOn='error'`, `pages=1`; reject reliable width/height/page/frame facts above configured limits. Call ExifReader on the local path with `length:'auto'`, `expanded:true`, `includeOffsets:true`, a strict includeTags list, and `decompress.maxDecompressedSize=16777216`. Convert parser warnings/errors to stable warning codes through `warningSink`; never forward raw values to the app logger.

For PDF return basic format/byte facts, `pageCount:null`, metadata status `partial`, and warning `processing/page-count-unsupported`. For text use a file stream and fatal `TextDecoder`; return no image dimensions. Unknown fields remain null.

- [ ] **Step 7: Run GREEN, audit and regression**

```bash
node --test test/unit/media-metadata-reader.test.js
npm test
npm audit --omit=dev
git diff --check
```

- [ ] **Step 8: Commit metadata implementation**

```bash
git add services/backend/src/adapters/media-metadata-reader.js
git commit -m "feat(processing): extract bounded technical metadata"
```

---

### Task 9: Sharp thumbnail, dHash and decoder capability report

**Files:**
- Create: `services/backend/test/unit/sharp-image-processor.test.js`
- Create: `services/backend/src/adapters/sharp-image-processor.js`

**Interfaces:**
- Produces `createSharpImageProcessor({ limits })` with `process({ path, contentType, signal, deadlineAt })`.
- Produces `getImageCapabilityReport()` with explicit HEIC/HEIF decode booleans and library versions.

- [ ] **Step 1: Write failing pixel-pipeline tests**

Use generated PNG/JPEG fixtures with non-square orientation, transparency and deterministic gradients. Cover:

```js
test('applies orientation before 512px inside thumbnail sizing', async () => {});
test('does not enlarge a small image and emits WebP quality 82 without source EXIF', async () => {});
test('flattens alpha on white and produces the frozen dHash vector', async () => {});
test('uses Lanczos3 9x8 row-major MSB dHash and eight bands', async () => {});
test('rejects reliable pixel dimension and frame counts above limits', async () => {});
test('processes only the first reliable frame and never all frames', async () => {});
test('abort or deadline destroys the Sharp pipeline', async () => {});
test('reports HEIC capability from the actual runtime instead of the extension', () => {});
```

For the dHash assertion, decode the processor's raw 9x8 grayscale output through the pure Task 2 function and assert a fixed 16-character literal. The test must fail if comparison direction, bit order, kernel, alpha background or orientation changes.

- [ ] **Step 2: Run RED**

```bash
node --test test/unit/sharp-image-processor.test.js
```

Expected: `ERR_MODULE_NOT_FOUND` for `sharp-image-processor.js`.

- [ ] **Step 3: Commit RED image contract**

```bash
git add services/backend/test/unit/sharp-image-processor.test.js
git commit -m "test(processing): define thumbnail and dHash pipeline"
```

- [ ] **Step 4: Implement the smallest bounded Sharp adapter**

Inspect metadata first. For supported raster inputs, create separate clones for:

```text
thumbnail: rotate -> resize inside 512 without enlargement -> webp quality 82
dHash: rotate -> flatten white -> grayscale -> resize 9x8 fill lanczos3 -> raw
```

Return `{ thumbnail:{ buffer,width,height,contentType }, perceptualHash:{ value,bands }, warnings }`. Do not keep source EXIF in the thumbnail. PDF/text return unsupported before Sharp decode. HEIC/HEIF returns unsupported when the runtime report says decode is unavailable.

- [ ] **Step 5: Run GREEN and media regression**

```bash
node --test test/unit/dhash.test.js test/unit/media-metadata-reader.test.js test/unit/sharp-image-processor.test.js
npm test
git diff --check
```

- [ ] **Step 6: Commit image adapter**

```bash
git add services/backend/src/adapters/sharp-image-processor.js
git commit -m "feat(processing): generate bounded thumbnails and dHash"
```

---

### Task 10: Create-only derivative store and strict reuse

**Files:**
- Create: `services/backend/test/unit/firebase-derivative-store.test.js`
- Create: `services/backend/src/adapters/firebase-derivative-store.js`

**Interfaces:**
- Produces `createFirebaseDerivativeStore({ storage, allowedBuckets })`.
- `putThumbnail(input)` returns authoritative derivative facts and never overwrites an object.

- [ ] **Step 1: Write failing derivative store tests**

Build a Storage fake that records bucket/path, `save()` options and `getMetadata()`. Cover:

```js
test('creates the deterministic thumbnail path with generation zero precondition', async () => {});
test('returns authoritative generation metageneration size crc32c and dimensions', async () => {});
test('a 412 reuses only an object with every frozen metadata field matching', async () => {});
test('a 412 with any path owner hash version MIME size checksum or dimension mismatch is terminal conflict', async () => {});
test('transient save and metadata errors are retryable and redacted', async () => {});
test('unallowlisted buckets and cross-owner paths fail before Storage access', async () => {});
```

Assert exact save options include:

```js
{
  resumable: false,
  preconditionOpts: { ifGenerationMatch: 0 },
  metadata: {
    contentType: 'image/webp',
    metadata: { ownerId, fragmentId, processorName, processorVersion, inputHash,
      width: '512', height: '384' }
  }
}
```

Do not assert a client-controllable object path. Path comes only from Task 2 identity helper.

- [ ] **Step 2: Run RED**

```bash
node --test test/unit/firebase-derivative-store.test.js
```

Expected: `ERR_MODULE_NOT_FOUND` for `firebase-derivative-store.js`.

- [ ] **Step 3: Commit RED derivative contract**

```bash
git add services/backend/test/unit/firebase-derivative-store.test.js
git commit -m "test(processing): define create-only derivative storage"
```

- [ ] **Step 4: Implement create/reuse without overwrite**

Use the deterministic path:

```text
users/{ownerId}/derived/{fragmentId}/deterministic-media/v1/{inputHash}/thumbnail.webp
```

On a recognized `412` only, read live metadata and normalize string/number fields before exact comparison. Require matching generation/metageneration/contentType/size/crc32c/custom metadata/width/height. Return normalized facts when matched; throw `processing/derivative-conflict` otherwise. All non-412 infrastructure errors map to retryable storage-unavailable.

- [ ] **Step 5: Run GREEN and regression**

```bash
node --test test/unit/firebase-derivative-store.test.js
npm test
git diff --check
```

- [ ] **Step 6: Commit derivative store**

```bash
git add services/backend/src/adapters/firebase-derivative-store.js
git commit -m "feat(processing): persist immutable thumbnails"
```

---

### Task 11: Deterministic processor orchestration and terminal semantics

**Files:**
- Create: `services/backend/test/unit/deterministic-processor.test.js`
- Create: `services/backend/src/processing/service.js`

**Interfaces:**
- Produces `createDeterministicProcessor({ repository, materializer, metadataReader, imageProcessor, derivativeStore, processingConfig, clock, randomUUID })`.
- `handle(event)` returns frozen `{ outcome:'succeeded'|'failed_terminal'|'terminal_noop' }` or throws stable retryable/busy errors.

- [ ] **Step 1: Write failing orchestration tests with strict spies**

Use fakes for every port and record call order. Required cases:

```js
test('claims hashes checkpoints extracts derives searches and commits in order', async () => {});
test('same terminal task is a no-op with no Storage or decoder call', async () => {});
test('active lease returns task-busy without reading the original', async () => {});
test('stale lease resumes from hash checkpoint without changing task identity', async () => {});
test('PDF succeeds with unsupported derivative and page-count warning', async () => {});
test('unsupported HEIC decode succeeds without thumbnail or dHash', async () => {});
test('media limit and derivative conflict persist terminal failure before return', async () => {});
test('Storage Firestore and soft-timeout failures persist retryable state and throw 503-class error', async () => {});
test('terminal transaction failure never reports terminal success', async () => {});
test('temporary material cleanup runs once on every success and failure path', async () => {});
```

The success spy order is exact:

```text
claim -> materialize -> register hash with atomic checkpoint -> metadata -> image -> derivative
-> find near inputs -> pure rank -> terminal commit -> cleanup
```

Assert all adapter calls receive the same `AbortSignal` and absolute `deadlineAt`. Assert log/error values contain none of the injected secret object path, filename, EXIF or raw exception strings.

- [ ] **Step 2: Run RED**

```bash
node --test test/unit/deterministic-processor.test.js
```

Expected: `ERR_MODULE_NOT_FOUND` for `processing/service.js`.

- [ ] **Step 3: Commit RED processor behavior**

```bash
git add services/backend/test/unit/deterministic-processor.test.js
git commit -m "test(processing): define deterministic processor lifecycle"
```

- [ ] **Step 4: Implement the minimum orchestration**

The service owns no Firebase API and no media decoding. It:

1. derives task ID and execution ID;
2. claims through repository;
3. short-circuits busy/terminal outcomes;
4. starts one abort timer at the configured soft deadline;
5. materializes, then atomically registers ContentHash while checkpointing Task/Fragment hash;
6. runs only supported capabilities;
7. creates/reuses derivative only when a thumbnail exists;
8. asks repository for owner-scoped band matches and applies the pure selector;
9. converts bounded `capturedAt`/`geo` hints to `ProvenanceSchema` suggestions referencing the current
   Fragment, processor/version and observed time;
10. commits success or a stable terminal failure;
11. records retryable failure when possible and rethrows retryable;
12. always clears timer, aborts outstanding work and awaits cleanup in `finally`.

Do not catch a terminal transaction failure and then return terminal. If the retryable-failure write also fails, throw repository-unavailable and rely on the still-running/expired lease for later reclaim.

- [ ] **Step 5: Run GREEN and processing regression**

```bash
node --test test/unit/deterministic-processor.test.js test/contract/memory-repository.test.js
npm test
git diff --check
```

- [ ] **Step 6: Commit processor**

```bash
git add services/backend/src/processing/service.js
git commit -m "feat(processing): orchestrate recoverable media processing"
```

---

### Task 12: Ingestion lifecycle, composition roots and HTTP acknowledgement

**Files:**
- Create: `services/backend/test/unit/ingestion-pipeline.test.js`
- Create: `services/backend/test/integration/ingestion-processing-app.test.js`
- Create: `services/backend/src/ingestion/pipeline.js`
- Modify: `services/backend/src/ingestion/routes.js`
- Modify: `services/backend/src/composition/ingestion.js`
- Modify: `services/backend/src/composition/runtime.js`
- Modify: `services/backend/test/helpers/create-ingestion-test-app.js`
- Modify: `services/backend/test/integration/ingestion-app.test.js`
- Modify: `services/backend/test/integration/composition.test.js`

**Interfaces:**
- Produces `createStorageFinalizedPipeline({ originalFinalizer, deterministicProcessor })`.
- Ingestion composition requires one processor dependency; API composition remains unchanged.
- No new production route is registered.

- [ ] **Step 1: Write failing pipeline and HTTP integration tests**

Pipeline cases:

```js
test('applied original continues into deterministic processing', async () => {});
test('same-generation duplicate still ensures and resumes deterministic processing', async () => {});
test('rejected upload never creates a processing task', async () => {});
test('retryable processing propagates instead of acknowledging the event', async () => {});
```

HTTP/composition cases:

```js
test('persisted succeeded failed-terminal and terminal-noop outcomes return 204', async () => {});
test('busy soft-timeout and terminal-transaction failure return stable 503', async () => {});
test('Retry-After is optional and no test relies on it for retry correctness', async () => {});
test('API composition has no finalized or processing route', async () => {});
test('ingestion composition has no protected business API route', async () => {});
test('server request id is the only error requestId', async () => {});
```

Update the test harness to inject a complete event handler; do not register a test route in production composition.

- [ ] **Step 2: Run RED**

```bash
node --test test/unit/ingestion-pipeline.test.js test/integration/ingestion-processing-app.test.js test/integration/composition.test.js
```

Expected: missing `ingestion/pipeline.js` and current composition not invoking the processor.

- [ ] **Step 3: Commit RED lifecycle tests**

```bash
git add services/backend/test/unit/ingestion-pipeline.test.js services/backend/test/integration/ingestion-processing-app.test.js services/backend/test/integration/ingestion-app.test.js services/backend/test/integration/composition.test.js services/backend/test/helpers/create-ingestion-test-app.js
git commit -m "test(processing): define Eventarc processing acknowledgement"
```

- [ ] **Step 4: Compose the already-tested services**

`createStorageFinalizedPipeline.handle(event)` first awaits Module 3. For `applied|duplicate`, it awaits deterministic processing. For `rejected`, it returns immediately. Routes treat only persisted terminal outcomes as `204`; all processing errors with `retryable=true` or busy map to `503` with stable redacted JSON.

`createRuntimeApp()` builds processing adapters only in ingestion mode:

```text
Firebase Storage -> source materializer + derivative store
local sharp/exif -> metadata reader + image processor
Firestore repository -> task/hash/candidate transactions
all ports -> deterministic processor -> finalized pipeline
```

API mode imports/registers none of these routes. Keep one Firebase Admin graph and the existing shared image/runtime service-account split.

- [ ] **Step 5: Run GREEN and full ordinary regression**

```bash
node --test test/unit/ingestion-pipeline.test.js test/integration/ingestion-processing-app.test.js test/integration/ingestion-app.test.js test/integration/composition.test.js
npm test
git diff --check
```

- [ ] **Step 6: Commit lifecycle integration**

```bash
git add services/backend/src/ingestion services/backend/src/composition services/backend/test
git commit -m "feat(processing): run processing before Eventarc acknowledgement"
```

---

### Task 13: Rules, full Emulator path, Linux smoke and implementation evidence

**Files:**
- Create: `services/backend/test/emulator/deterministic-processing.emulator.test.js`
- Create: `services/backend/scripts/media-capability-smoke.mjs`
- Create: `docs/implementation/deterministic-processing-v1.md`
- Modify: `services/backend/test/rules/firestore.rules.test.js`
- Modify: `services/backend/test/rules/storage.rules.test.js`
- Modify: `firebase/firestore.rules`
- Modify: `firebase/storage.rules`
- Modify: `services/backend/package.json`
- Modify: `services/backend/Dockerfile`
- Modify: `services/backend/README.md`

**Interfaces:**
- Owner clients can read Fragment, ImportBatch, DuplicateCandidate and derived objects.
- Clients cannot read ProcessingTask/ContentHash or write any server-derived object/document.
- Adds `npm run test:emulator` coverage for Module 4 and `npm run smoke:media`.

- [ ] **Step 1: Write failing Rules and Emulator tests**

Firestore Rules additions must prove:

```text
owner reads own DuplicateCandidate
other/unauthenticated users cannot read it
owner cannot write/update/delete DuplicateCandidate
owner/other/unauthenticated cannot read or write ProcessingTask/ContentHash
existing Fragment/ImportBatch behavior remains unchanged
```

Storage Rules additions must prove:

```text
owner reads exact users/{uid}/derived/** object
other/unauthenticated users cannot read it
all clients cannot create/update/delete any derived object
original upload rules remain unchanged
```

The new Emulator E2E uses Auth anonymous login, real Firestore/Storage Emulators and a fake App Check verifier only in test composition. Upload a deterministic real PNG, dispatch the finalized event twice, and assert:

- one uploaded original Fragment with bucket/generation facts;
- one succeeded ProcessingTask for the source revision;
- SHA-256, 16-char dHash, eight bands and nullable metadata persisted;
- one immutable WebP derivative with authoritative generation/checksum;
- batch processed count is 1, failed is 0 and status is completed;
- the second event is a 204 no-op with unchanged task attempt/counts;
- uploading the same bytes as a second Fragment preserves both and creates one exact candidate/canonical ContentHash;
- no test composition fake is imported by production source.

- [ ] **Step 2: Run RED with all Emulators**

```bash
npm run test:emulator
```

Expected: new Rules assertions are denied incorrectly or new E2E fails because derived/task processing has not been wired into the Emulator script. Confirm existing Module 2/3 Emulator tests still pass.

- [ ] **Step 3: Commit RED Rules/E2E coverage**

```bash
git add services/backend/test/emulator/deterministic-processing.emulator.test.js services/backend/test/rules services/backend/package.json
git commit -m "test(processing): cover deterministic pipeline with Emulators"
```

- [ ] **Step 4: Apply the smallest Rules and test-script changes**

Add explicit Firestore matches for duplicate candidates (owner read/server write) and task/content hash (no client access). Add a derived Storage match (owner read/no client write) before the catch-all deny. Extend `test:emulator` to run the new E2E with `--test-concurrency=1`; keep Auth/Firestore/Storage startup and cleanup inside `firebase emulators:exec`.

- [ ] **Step 5: Run GREEN Emulator verification**

```bash
npm run test:emulator
```

Expected: zero failures and zero skips caused by missing Emulator environment. Each test deletes its users, objects and Admin/client apps in `t.after`/`finally`.

- [ ] **Step 6: Commit Rules and E2E implementation**

```bash
git add firebase/firestore.rules firebase/storage.rules services/backend/package.json services/backend/test
git commit -m "feat(processing): secure derived processing data"
```

- [ ] **Step 7: Add Linux capability smoke before claiming support**

`media-capability-smoke.mjs` imports the production capability report, prints only JSON library/capability facts, creates a synthetic PNG in memory, and exits nonzero unless JPEG/PNG/WebP input plus WebP output work. HEIC/HEIF is reported true/false but does not fail the smoke. Update Dockerfile to copy the `scripts` directory; add `smoke:media` without changing the production command.

Run locally:

```bash
npm run smoke:media
```

Then from repository root:

```bash
docker build -f services/backend/Dockerfile -t elsewhere-backend:module4 .
docker run --rm elsewhere-backend:module4 npm run smoke:media
```

Expected: both commands exit 0; JSON explicitly names Sharp/libvips versions and HEIC decode capability. Do not claim HEIC decode if false.

- [ ] **Step 8: Commit build smoke**

```bash
git add services/backend/scripts/media-capability-smoke.mjs services/backend/Dockerfile services/backend/package.json
git commit -m "test(processing): verify media capabilities in Linux image"
```

- [ ] **Step 9: Write implementation evidence from actual results**

Create `docs/implementation/deterministic-processing-v1.md` only after all preceding commands have run. Document:

- actual dependency versions and capability smoke output;
- task identity/state/lease and retry behavior;
- owner-scoped exact/near duplicate semantics;
- current format matrix, explicitly PDF `pageCount=null` and HEIC runtime result;
- source/derivative paths and Rules boundaries without secrets;
- runtime limits and Cloud Tasks migration triggers;
- separate upload/deterministic failure semantics;
- explicit limitation that signatures/decoders are not malware scans or semantic parsers;
- exact fresh verification commands and their real pass/fail counts.

Update `services/backend/README.md` with only the minimal run/test/config instructions and a link to the implementation doc.

- [ ] **Step 10: Run final verification in order**

From `services/backend`:

```bash
node --test test/unit/processing-domain.test.js test/unit/processing-identity.test.js test/unit/dhash.test.js test/unit/near-duplicates.test.js test/unit/processing-config.test.js test/unit/source-materializer.test.js test/unit/media-metadata-reader.test.js test/unit/sharp-image-processor.test.js test/unit/firebase-derivative-store.test.js test/unit/deterministic-processor.test.js test/unit/ingestion-pipeline.test.js
node --test test/integration/ingestion-processing-app.test.js test/integration/ingestion-app.test.js test/integration/composition.test.js
npm run test:emulator
npm test
npm audit --omit=dev
npm run smoke:media
```

From repository root:

```bash
docker build -f services/backend/Dockerfile -t elsewhere-backend:module4 .
docker run --rm elsewhere-backend:module4 npm run smoke:media
rg -n "(/protected|test/helpers|test/fixtures)" services/backend/src
git diff --check
git status --short
```

Expected:

- every focused, integration, Emulator and ordinary test reports zero failures;
- Emulator suite has no environment skip;
- audit reports zero production vulnerabilities;
- local and container smoke exit 0;
- production-source scan has no test route/helper/fixture import;
- diff check has no output;
- status lists only the intended documentation edits before the final docs commit.

- [ ] **Step 11: Commit final documentation**

```bash
git add docs/implementation/deterministic-processing-v1.md services/backend/README.md
git commit -m "docs(processing): document deterministic pipeline verification"
```

- [ ] **Step 12: Verify final commit chain and stop**

```bash
git status --short
git log --oneline --decorate -30
git show --check --stat HEAD
```

Expected: clean worktree, independently reviewable RED/GREEN commits, no whitespace errors. Stop Module 4 and report the exact commands/results; do not start OCR or any Module 5 work.

---

## Spec Coverage Self-Review Checklist

- [ ] Task identity excludes `inputHash`; source revision includes bucket/path/generation.
- [ ] ProcessingTask states, steps, lease, heartbeat, deadline and terminal invariants are tested.
- [ ] Same-generation Module 3 duplicate still enters Module 4.
- [ ] Generation-pinned streaming SHA, byte cap, temp permissions, abort and cleanup are tested.
- [ ] Metadata whitelist, provenance, strict UTF-8, PDF null page count and parser redaction are tested.
- [ ] Sharp orientation/alpha/kernel/bit-order dHash and capability report are tested.
- [ ] Derivative generation-zero creation and strict 412 reuse are tested.
- [ ] Owner-scoped ContentHash concurrency yields one canonical and preserves every Fragment.
- [ ] Near query dedupe/self exclusion/stable 200 scan/distance+ID top 5 and directional rank are tested.
- [ ] Versioned processing summary and unique failed Fragment counters are transaction-idempotent.
- [ ] Unsupported capability is counted separately and never treated as failure.
- [ ] Only a fully persisted terminal state yields 204; busy/retryable/terminal-transaction failure yields 503.
- [ ] Firestore and Storage Rules expose only owner-readable product data and block client writes/internal collections.
- [ ] Auth + Firestore + Storage Emulator proves the real end-to-end path and cleanup.
- [ ] Linux image smoke reports actual HEIC capability without promising unsupported formats.
- [ ] No Cloud Tasks, external AI, production deployment, new business endpoint or Module 5 code is introduced.

## Execution Notes

- Keep a short task log under the relevant checklist item with the exact RED failure and GREEN command output summary.
- If a RED fails for malformed fixtures, fix the fixture before implementation; do not treat a test bug as product evidence.
- If a proposed implementation needs a third dependency, a global index, a new endpoint or a changed source-type contract, stop and request a new design decision.
- If Docker is unavailable locally, do not mark Module 4 complete. Report the external blocker with all other verified evidence.
