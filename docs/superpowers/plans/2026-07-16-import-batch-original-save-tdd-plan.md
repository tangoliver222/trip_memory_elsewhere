# Import Batch and Original Save TDD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Module 3 as the first complete protected business path: create a bounded, server-owned upload manifest; upload originals directly through Firebase Storage; validate finalized objects by generation and actual bytes; atomically create an uploaded Fragment; and return a minimal owner-scoped receipt.

**Architecture:** The public `elsewhere-api` composition owns Firebase Auth/App Check and the two Import Batch routes. The private `elsewhere-ingestion` composition owns only the Storage finalized receiver and relies on Cloud Run IAM before performing its own CloudEvent, manifest, metadata and signature checks. Both services share the package and container image, but use separate composition roots, runtime service accounts and IAM policies. Application services depend only on repository and object-inspector ports. The memory and Firestore repositories implement the same idempotent transaction contract.

**Tech Stack:** Node.js `>=22`, Fastify `5.10.0`, Zod `4.4.3`, Firebase Admin `14.1.0`, Firebase Web SDK `12.16.0`, Firebase Rules Unit Testing `5.0.1`, Firebase Tools `15.22.2`, Node `node:test`, OpenJDK 21. Use only existing dependencies and Node built-ins.

## Global Constraints

- Execute strict RED -> GREEN -> REFACTOR. Record the exact expected failure before adding the corresponding production behavior.
- Commit every completed task separately after its focused tests and relevant regression tests pass.
- Do not add runtime or development dependencies; `package.json` and lockfile dependency graphs must remain unchanged.
- Do not implement Module 4 processing: no EXIF extraction, SHA-256, thumbnails, OCR, scene/place inference, connections or AI.
- Do not add frontend login/import UI, signed URLs, upload proxying, malware scanning, roles, sessions, replay protection or rate limiting.
- `POST /v1/import-batches` and `GET /v1/import-batches/:batchId` are the only new production API business endpoints.
- The Storage finalized receiver exists only in the ingestion composition. It must never be registered by the API composition or a shared base app.
- The `/protected` route remains test-harness-only. Do not add a production finalize bypass route.
- Public API routes continue to require the Module 2 ID Token + App Check boundary and the environment-specific `allowedAppIds` allowlist.
- ImportBatch upload manifests contain 1-50 entries. IDs and paths come only from server-side `crypto.randomUUID()` with stable prefixes.
- Supported Module 3 source types are `photo`, `receipt`, `ticket`, `screenshot`, `menu`, and `text`. Reject `audio`.
- Supported Source Descriptor v1 providers are only `local_file`, `device_camera`, `google_photos`, and `pasted_text`. Reject unknown fields and credential-bearing fields.
- Preserve stable source information, but never persist OAuth tokens, picker sessions, cookies, temporary base/download URLs or access credentials.
- Per-source-type `allowedContentTypes` and `maxBytes` are server-derived. The maximum is 50 MiB per item.
- Storage Rules use one Firestore read of the owner-scoped ImportBatch, allow only exact manifest `create`, and deny update/delete/all other paths.
- Finalization is metadata-first and generation-pinned. Binary formats read only the signature prefix. `text/plain` is validated as strict UTF-8 with streaming `TextDecoder(..., { fatal: true })`.
- `storageFacts.generation`, `sizeBytes`, and `crc32c` are required. `md5Hash` is nullable and its absence is valid.
- File signature checks establish only format plausibility and source-type compatibility; they are not malware scans or semantic parsing.
- Batch state is derived exactly as frozen in the design:
  - any pending item -> `uploadStatus=pending`, `status=open`;
  - all success -> `uploadStatus=complete`, `status=processing`;
  - partial success -> `uploadStatus=complete_with_errors`, `status=processing`;
  - all failure -> `uploadStatus=complete_with_errors`, `status=failed`.
- `counters.processed` remains `0` throughout Module 3.
- Eventarc is at-least-once and unordered. Idempotency key is `(bucket, objectName, generation)`.
- Retryable Storage/Firestore failures leave the item pending and return a retryable response. Permanent format/integrity/policy failures atomically record one failure.
- Cloud Storage App Check enforcement is a staging/production deployment gate. Cloud Run IAM denial is a Module 10 deployment test. Do not fake either claim in local Emulator tests.
- Error responses and logs never expose raw Zod, Firebase, Firestore, Storage or provider errors. Response `requestId` comes only from Fastify `request.id`.

---

### Task 1: Source Descriptor v1 and upload policy contracts

**Files:**
- Create: `services/backend/test/unit/import-contracts.test.js`
- Create: `services/backend/src/domain/source-descriptor.js`
- Create: `services/backend/src/imports/upload-policy.js`
- Modify: `services/backend/src/domain/index.js`

**Interfaces:**
- Produces `SourceTypeSchema` with the six Module 3 source types.
- Produces `SourceDescriptorSchema` and `parseSourceDescriptor(input)`.
- Produces `getUploadPolicy(sourceType) -> frozen { allowedContentTypes, maxBytes }`.
- Produces `validateDeclaredUpload({ sourceType, declaredContentType, declaredSizeBytes })`.

- [ ] **Step 1: Write the strict schema and policy tests**

Create `services/backend/test/unit/import-contracts.test.js` with these named cases:

1. `accepts each frozen Source Descriptor v1 provider`:
   - `local_file/file_picker` with original name, modified time and dimensions;
   - `device_camera/camera_capture` with capture time, timezone and `camera_device` location;
   - `google_photos/google_photos_picker` with persistent item ID and only the documented camera metadata whitelist;
   - `pasted_text/paste` with nullable original name and `{ title }` provider metadata.
2. `rejects provider/import method mismatches and unknown fields`.
3. `rejects credential and temporary URL fields even when nested in providerMetadata`.
4. `rejects invalid RFC 3339 timestamps, timezone offsets, coordinates and dimensions`.
5. `derives immutable policy by sourceType` and checks exact MIME lists:
   - photos/screenshots: JPEG, PNG, WebP, HEIC, HEIF;
   - receipts/tickets/menus: the image list plus PDF;
   - text: `text/plain` only.
6. `rejects audio, unsupported MIME, zero bytes and values above 50 MiB`.
7. Mutating one returned policy must not change a later returned policy.

Use explicit fixtures; do not use arbitrary provider JSON. Assert Zod failures without snapshotting or exposing their raw messages as a public contract.

- [ ] **Step 2: Run RED and record the missing module failure**

Working directory: `services/backend`.

```bash
node --test test/unit/import-contracts.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/domain/source-descriptor.js` or `src/imports/upload-policy.js`. This is the correct RED reason.

- [ ] **Step 3: Commit the RED contract**

```bash
git add services/backend/test/unit/import-contracts.test.js
git commit -m "test(import): define source and upload contracts"
```

- [ ] **Step 4: Implement the minimal strict Source Descriptor union**

In `source-descriptor.js`:

- define reusable strict nullable timestamp, media and location schemas;
- use a discriminated union keyed by `provider`;
- fix each provider's `importMethod` with `z.literal()`;
- use strict provider metadata objects:
  - local file and device camera: empty strict object;
  - pasted text: `{ title: string|null }`;
  - Google Photos: nullable `cameraMake`, `cameraModel`, `focalLengthMm`, `apertureFNumber`, `isoEquivalent`, and `exposureTimeSeconds` only;
- require `providerItemId` for Google Photos and require it to be null for the other three providers;
- do not add a generic catch-all record.

Export the new parsers from `domain/index.js`.

- [ ] **Step 5: Implement server-derived upload policies**

In `upload-policy.js`, export `MAX_ORIGINAL_BYTES = 50 * 1024 * 1024`,
`getUploadPolicy(sourceType)`, and `validateDeclaredUpload(input)`. The policy getter returns a
deeply frozen clone; the validator returns normalized declared MIME/size plus that derived policy.

Do not accept client-provided policy overrides. `validateDeclaredUpload()` returns only the normalized declared fields and derived policy.

- [ ] **Step 6: Run GREEN and ordinary regression**

```bash
node --test test/unit/import-contracts.test.js
npm test
npm audit --omit=dev
git diff --check
```

Expected: import contract tests pass; ordinary suite has 0 failures; audit reports 0 vulnerabilities; diff check has no output.

- [ ] **Step 7: Commit the implementation**

```bash
git add services/backend/src/domain/source-descriptor.js services/backend/src/imports/upload-policy.js services/backend/src/domain/index.js
git commit -m "feat(import): add source descriptors and upload policies"
```

---

### Task 2: ImportBatch, upload item and Fragment storage schemas

**Files:**
- Create: `services/backend/test/fixtures/import.js`
- Create: `services/backend/test/unit/import-domain.test.js`
- Modify: `services/backend/test/unit/domain.test.js`
- Modify: `services/backend/test/contract/repository.contract.js`
- Modify: `services/backend/src/domain/import-batch.js`
- Modify: `services/backend/src/domain/fragment.js`
- Modify: `services/backend/src/domain/index.js`

**Interfaces:**
- Extends `ImportBatchSchema` with `uploadStatus` and bounded `uploads` map.
- Produces `UploadManifestItemSchema`.
- Produces `deriveImportBatchState(uploads, previousCounters)`.
- Extends `FragmentSchema.storage` with authoritative Storage facts and adds `source`.

- [ ] **Step 1: Add reusable valid fixtures and failing domain tests**

Create `test/fixtures/import.js` with `NOW = '2026-07-16T00:00:00.000Z'` and three pure factory
functions: `makeLocalFileSource(overrides)`, `makePendingBatch(overrides)`, and
`makeUploadedFragment(overrides)`. Their defaults must be complete valid Descriptor, one-item
pending batch, and uploaded Fragment values respectively, including the exact owner-scoped path
and required Storage facts.

The factories must return new objects and accept only shallow top-level overrides plus explicit nested overrides in tests; do not create a general deep-merge utility.

Create `test/unit/import-domain.test.js` covering:

- one, a normal multi-item batch, and 50-item batch parse;
- zero and 51 uploads fail;
- `uploads` key, `fragmentId`, `originalPath`, `ownerId`, `batchId`, `inputCount` consistency;
- client-derived fields cannot be omitted from persisted model;
- counters cannot exceed inputCount and `saved + failed` cannot exceed inputCount;
- exact four frozen status derivations;
- Fragment requires generation, sizeBytes and crc32c;
- `md5Hash: null` succeeds;
- source is copied as a complete Source Descriptor;
- original path remains owner/batch/fragment scoped.

Update existing domain and repository fixture shapes so their expected valid objects include `uploadStatus`, `uploads`, full storage facts and `source`. Do not weaken old owner/path checks.

- [ ] **Step 2: Run RED**

```bash
node --test test/unit/import-domain.test.js test/unit/domain.test.js test/contract/memory-repository.test.js
```

Expected: FAIL because current schemas do not accept `uploadStatus`, `uploads`, full Storage facts or Source Descriptor. Confirm failures are schema-contract failures, not malformed test fixtures.

- [ ] **Step 3: Implement the smallest schema extension and state reducer**

In `import-batch.js`:

- define strict upload item state `pending|finalized|failed`;
- require `finalizedGeneration` and `failureCode` as nullable strings;
- require `uploads` to contain 1-50 entries;
- enforce pending items have null generation/failure, finalized items have generation/no failure, and failed items have generation/failure;
- enforce map key, fragment ID and exact path consistency;
- expose a pure `deriveImportBatchState()` that counts upload states and preserves `processed` and `needsReview` from its input counters.

In `fragment.js` require:

```text
storage.originalPath
storage.generation
storage.contentType
storage.sizeBytes
storage.crc32c
storage.md5Hash (nullable)
source (SourceDescriptorSchema)
```

Keep `hashes` and `facts` as empty-capable strict records; do not populate them.

- [ ] **Step 4: Run GREEN and regression**

```bash
node --test test/unit/import-domain.test.js test/unit/domain.test.js test/contract/memory-repository.test.js
npm test
git diff --check
```

Expected: focused tests and ordinary suite pass with 0 failures.

- [ ] **Step 5: Commit**

```bash
git add services/backend/src/domain services/backend/test/fixtures/import.js services/backend/test/unit/import-domain.test.js services/backend/test/unit/domain.test.js services/backend/test/contract/repository.contract.js
git commit -m "feat(import): model bounded upload manifests"
```

---

### Task 3: Batch creation and minimal receipt application service

**Files:**
- Create: `services/backend/test/unit/import-service.test.js`
- Create: `services/backend/src/imports/errors.js`
- Create: `services/backend/src/imports/service.js`

**Interfaces:**
- Produces `createImportService({ repository, randomUUID, clock })`.
- Produces `service.createBatch(uid, request) -> { batch, uploads }`.
- Produces `service.getReceipt(uid, batchId) -> minimal receipt`.
- Produces stable `ImportServiceError` codes without raw causes in public messages.

- [ ] **Step 1: Write failing use-case tests**

Cover these named cases:

1. `creates IDs, paths, policy and counters only on the server` using deterministic UUID sequence and clock.
2. `creates 1, normal, and 50-item batches`.
3. `rejects 0, 51, audio, unsupported MIME, oversize and unknown request fields before repository execution`.
4. `rejects forged uid ownerId batchId fragmentId originalPath state generation counters and policy overrides`.
5. `does not include Source Descriptor or private source fields in the create response uploads`.
6. `returns only the frozen minimal owner receipt` with item `fragmentId/sourceType/state`.
7. `maps absent and other-owner batch identically to import/batch-not-found` by relying only on owner-scoped repository lookup.
8. `converts repository create collision to import/batch-conflict`.

The service test repository is a tiny spy object implementing the asserted repository contract; use `createMemoryRepository()` for stateful happy paths instead of creating another in-memory store.

- [ ] **Step 2: Run RED**

```bash
node --test test/unit/import-service.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/imports/service.js`.

- [ ] **Step 3: Implement minimal service logic**

- parse a strict `{ items: z.array(...).min(1).max(50) }` request;
- validate each declared upload through Task 1 policy code;
- allocate `batch_` and `frag_` IDs with injected `randomUUID`;
- build exact owner-scoped paths;
- persist full Source Descriptors only in the batch manifest;
- return the public create projection and receipt projection from explicit functions, never by deleting private fields from a persisted object;
- freeze the response projections;
- never log request contents.

The `clock` returns an ISO string; reject a non-string clock result during construction tests rather than adding runtime recovery branches.

- [ ] **Step 4: Run GREEN and regression**

```bash
node --test test/unit/import-service.test.js test/unit/import-contracts.test.js test/unit/import-domain.test.js
npm test
git diff --check
```

- [ ] **Step 5: Commit**

```bash
git add services/backend/src/imports services/backend/test/unit/import-service.test.js
git commit -m "feat(import): create bounded upload manifests"
```

---

### Task 4: Idempotent repository transactions

**Files:**
- Create: `services/backend/src/repositories/import-outcome.js`
- Modify: `services/backend/src/repositories/contract.js`
- Modify: `services/backend/src/repositories/errors.js`
- Modify: `services/backend/src/repositories/memory.js`
- Modify: `services/backend/src/repositories/firestore.js`
- Modify: `services/backend/test/contract/repository.contract.js`

**Interfaces:**
- Extends repository port with `finalizeOriginal(uid, validatedOriginal)`.
- Extends repository port with `rejectOriginal(uid, rejectedOriginal)`.
- Both return `{ outcome: 'applied'|'duplicate', batch, fragment? }`.
- Produces stable repository errors for unregistered original and original conflict.

The validated success input is strict:

```js
{
  batchId, fragmentId, originalPath, generation, updatedAt,
  fragment // complete parseable uploaded Fragment
}
```

The rejected input is strict:

```js
{
  batchId, fragmentId, originalPath, generation, failureCode, updatedAt
}
```

- [ ] **Step 1: Extend the shared repository contract tests**

Add assertions, automatically exercised by memory and Firestore adapters, for:

- finalize creates exactly one Fragment, sets item finalized/generation, increments saved once and derives all-success status;
- same-generation success replay is a no-op and returns duplicate;
- reject sets stable failure code, increments failed once and derives all-failure status;
- same-generation failure replay is a no-op;
- a partial success/failure batch derives `complete_with_errors/processing`;
- any remaining pending item keeps `pending/open`;
- same path with a different generation raises `repository/original-conflict`;
- unregistered item, wrong exact path and wrong owner raise `repository/unregistered-original` or owner mismatch without writes;
- a pre-existing Fragment not represented by the same finalized generation conflicts;
- every returned object is a clone and cannot mutate stored state.

- [ ] **Step 2: Run memory RED**

```bash
node --test test/contract/memory-repository.test.js
```

Expected: FAIL because `assertRepository()` and memory repository do not implement `finalizeOriginal()` and `rejectOriginal()`.

- [ ] **Step 3: Implement the shared outcome validator and memory atomic section**

`repositories/import-outcome.js` must:

- validate identifiers/path/generation before mutation;
- classify same generation as duplicate;
- classify different generation on a settled item as conflict;
- return the next parsed batch using `deriveImportBatchState()`;
- build no Fragment during rejection.

The memory adapter performs each outcome synchronously between its first lookup and Map writes; clone both inputs and outputs.

- [ ] **Step 4: Implement one Firestore transaction per outcome**

For each method:

1. read the owner-scoped batch and fragment document references inside one transaction;
2. parse and revalidate the current manifest item and exact path;
3. perform duplicate/conflict classification before writes;
4. success: transaction `create` Fragment and `set` updated batch;
5. permanent rejection: only `set` updated batch;
6. never pre-create a Fragment outside the transaction.

Do not catch transient Firestore errors as permanent failures. Only map known already-exists conflicts.

- [ ] **Step 5: Run memory GREEN and Firestore Emulator contract**

```bash
node --test test/contract/memory-repository.test.js
npx firebase emulators:exec --project demo-elsewhere --config ../../firebase/firebase.json --only firestore "node --test --test-concurrency=1 test/contract/firestore-repository.test.js"
npm test
git diff --check
```

Expected: both adapters pass the same contract; ordinary suite has 0 failures.

- [ ] **Step 6: Commit**

```bash
git add services/backend/src/repositories services/backend/test/contract/repository.contract.js
git commit -m "feat(import): persist idempotent original outcomes"
```

---

### Task 5: Protected Import Batch API routes

**Files:**
- Create: `services/backend/test/helpers/create-import-api-app.js`
- Create: `services/backend/test/integration/import-api.test.js`
- Create: `services/backend/src/imports/routes.js`

**Interfaces:**
- Produces `registerImportRoutes(app, { requireAuth, importService })`.
- Registers only `POST /v1/import-batches` and `GET /v1/import-batches/:batchId`.

- [ ] **Step 1: Build a test-only API composition and write failing route tests**

The helper composes `createApp()`, Module 2 `registerAuthBoundary()`, a supplied import service and the two import routes. It may use deterministic test tokens, but it must not be imported by `src/`.

Test:

- POST returns 201 and exact public projection;
- GET returns 200 and exact minimal receipt;
- missing/invalid ID Token and App Check return the existing four stable 401 responses;
- auth failure does not call service or repository spies;
- forged body owner/uid/path/id fields return 400 and do not influence persisted owner scope;
- body/query/header requestId fields never replace `request.id`;
- absent and other-owner batch both return 404 `import/batch-not-found`;
- duplicate server ID returns 409 `import/batch-conflict`;
- invalid body returns 400 without raw Zod details;
- unexpected service failure returns generic 500 without raw message;
- source/private manifest fields are absent from both public response shapes.

- [ ] **Step 2: Run RED**

```bash
node --test test/integration/import-api.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/imports/routes.js`.

- [ ] **Step 3: Implement routes and stable response mapping**

- attach `requireAuth` as route `preHandler`;
- derive uid only from frozen `request.authContext.uid`;
- call service methods in a narrow `try/catch`;
- send only the four user API errors from the frozen design plus existing 401s;
- use `request.id` in every error body;
- never include `error.cause`, validation issues or provider data.

Do not register these routes in `app.js`; production composition happens in Task 9.

- [ ] **Step 4: Run GREEN and auth regression**

```bash
node --test test/integration/import-api.test.js test/integration/auth-boundary-app.test.js test/unit/auth-boundary.test.js
npm test
git diff --check
```

- [ ] **Step 5: Commit**

```bash
git add services/backend/src/imports/routes.js services/backend/test/helpers/create-import-api-app.js services/backend/test/integration/import-api.test.js
git commit -m "feat(import): expose protected batch API"
```

---

### Task 6: Manifest-bound Storage and Firestore Rules

**Files:**
- Modify: `firebase/storage.rules`
- Modify: `services/backend/test/rules/storage.rules.test.js`
- Modify: `services/backend/test/rules/firestore.rules.test.js`

**Rules contract:**

For `users/{uid}/originals/{batchId}/{fragmentId}`, `create` requires authenticated owner, existing owner batch, manifest key membership, pending state, exact `originalPath`, MIME membership, `size <= maxBytes`, and no existing resource. Read remains owner-only. Update/delete and all other paths remain denied.

- [ ] **Step 1: Rewrite Storage Rules tests around a seeded ImportBatch**

Initialize one Rules Unit Testing environment with both Firestore and Storage rule text. Seed ImportBatch documents inside `withSecurityRulesDisabled()`; do not add a client write escape hatch.

Test:

- owner can create an exact registered pending object at maximum allowed size;
- unauthenticated and other user fail;
- missing batch and unregistered fragment fail;
- finalized/failed manifest items fail;
- wrong batch/fragment path fail;
- valid global MIME but MIME not in that sourceType policy fails;
- size one byte above item max fails;
- overwrite/update and delete fail;
- arbitrary other Storage paths fail;
- owner can read and other user cannot read;
- Firestore client cannot create/update/delete a batch containing forged uploads, counters or derived status.

- [ ] **Step 2: Run RED with Storage and Firestore Emulators**

```bash
npx firebase emulators:exec --project demo-elsewhere --config ../../firebase/firebase.json --only firestore,storage "node --test --test-concurrency=1 test/rules/firestore.rules.test.js test/rules/storage.rules.test.js"
```

Expected: FAIL because the current Storage rule accepts any owner object with a generic MIME and size and does not read the manifest. Confirm at least the unregistered-fragment or source-specific-MIME assertion fails for that reason.

- [ ] **Step 3: Implement the single-document manifest rule**

Use a helper equivalent to:

```text
firestore.get(/databases/(default)/documents/users/$(uid)/importBatches/$(batchId))
```

Read it once into a local variable in the allow expression/helper. Guard map membership before indexing. Compare `item.originalPath` with the exact path string. Use MIME membership, not a broad regex. Use `<= item.maxBytes`. Keep only `allow create`; explicitly deny update/delete.

- [ ] **Step 4: Run GREEN and rules regression**

```bash
npx firebase emulators:exec --project demo-elsewhere --config ../../firebase/firebase.json --only firestore,storage "node --test --test-concurrency=1 test/rules/firestore.rules.test.js test/rules/storage.rules.test.js"
npm test
git diff --check
```

- [ ] **Step 5: Commit**

```bash
git add firebase/storage.rules services/backend/test/rules/storage.rules.test.js services/backend/test/rules/firestore.rules.test.js
git commit -m "feat(import): enforce storage upload manifests"
```

---

### Task 7: Generation-pinned object inspector and signature validation

**Files:**
- Create: `services/backend/test/unit/file-signature.test.js`
- Create: `services/backend/test/unit/firebase-object-inspector.test.js`
- Create: `services/backend/src/ingestion/errors.js`
- Create: `services/backend/src/ingestion/file-signature.js`
- Create: `services/backend/src/adapters/firebase-object-inspector.js`
- Modify: `services/backend/test/unit/firebase.test.js`
- Modify: `services/backend/src/adapters/firebase.js`

**Interfaces:**
- Produces `detectBinaryFormat(prefix) -> jpeg|png|webp|heic|heif|pdf|null`.
- Produces `createFirebaseObjectInspector({ storage, allowedBuckets })`.
- Produces `inspectOriginal({ bucket, objectName, generation, expectedPolicy }) -> frozen { detectedFormat, storageFacts }`.
- Extends `createFirebaseAdmin()` return with Admin Storage without a new dependency.

- [ ] **Step 1: Write failing signature tests**

Use literal byte arrays for valid and invalid:

- JPEG SOI marker;
- complete PNG signature;
- RIFF length prefix plus `WEBP` brand;
- `%PDF-`;
- ISO BMFF `ftyp` with HEIC and HEIF-compatible brands;
- random bytes and truncated signatures.

Assert AVIF or unsupported brands are not silently accepted.

- [ ] **Step 2: Write failing inspector tests with a narrow fake Admin Storage object**

The fake records calls to `storage.bucket(bucket).file(name, { generation })`, `getMetadata()` and `createReadStream()`.

Test:

- bucket allowlist and generation are required before any Storage call;
- the exact requested generation is passed to `file()`;
- metadata validation runs before byte reads;
- generation mismatch, missing size, missing crc32c, disallowed content type, zero/oversize object are permanent invalid-original failures;
- missing `md5Hash` succeeds and returns `md5Hash: null`;
- JPEG/PNG/WebP/HEIC/HEIF/PDF read only the minimum bounded prefix;
- content type/signature mismatch fails;
- PDF is rejected for photo/screenshot policy but accepted for receipt/ticket/menu policy;
- strict UTF-8 accepts a multibyte code point split across stream chunks;
- malformed UTF-8 fails;
- text validation consumes chunks incrementally and never uses an unbounded `Buffer.concat` path;
- transient metadata/read stream errors are marked retryable and preserve no raw provider message.

- [ ] **Step 3: Run RED**

```bash
node --test test/unit/file-signature.test.js test/unit/firebase-object-inspector.test.js
```

Expected: FAIL with missing ingestion/inspector modules.

- [ ] **Step 4: Implement format detection and stable ingestion errors**

Keep signature code pure and bounded. Return only a normalized format or null; do not attempt image decoding or semantic validation.

Define an error type with `code`, `permanent` and a generic message. Do not attach or serialize the original provider error. Preserve original error only through the runtime logger's safe category if a later task adds such logging; Module 3 code must not log it.

- [ ] **Step 5: Implement metadata-first inspector**

Order is mandatory:

1. validate allowed bucket, exact object name/generation and expected policy shape;
2. get metadata on a generation-bound file handle;
3. require and normalize `generation`, numeric `size`, `crc32c`, `contentType`; normalize missing MD5 to null;
4. enforce generation equality, positive size, policy max and actual MIME membership;
5. for binary MIME read a bounded prefix only;
6. for text use async iteration and streaming fatal TextDecoder, then final `decoder.decode()` flush;
7. compare actual MIME, detected format and source policy compatibility;
8. return a deeply frozen projection without raw metadata.

Update `firebase.js` to return `storage: getStorage(app)`. Verify existing Firebase unit tests still assert the exact adapter shape.

- [ ] **Step 6: Run GREEN and regression**

```bash
node --test test/unit/file-signature.test.js test/unit/firebase-object-inspector.test.js test/unit/firebase.test.js
npm test
npm audit --omit=dev
git diff --check
```

- [ ] **Step 7: Commit**

```bash
git add services/backend/src/ingestion services/backend/src/adapters/firebase-object-inspector.js services/backend/src/adapters/firebase.js services/backend/test/unit/file-signature.test.js services/backend/test/unit/firebase-object-inspector.test.js services/backend/test/unit/firebase.test.js
git commit -m "feat(ingestion): verify finalized object bytes"
```

---

### Task 8: CloudEvent validation and original finalization service

**Files:**
- Create: `services/backend/test/unit/storage-event.test.js`
- Create: `services/backend/test/unit/original-finalizer.test.js`
- Create: `services/backend/test/integration/ingestion-app.test.js`
- Create: `services/backend/test/helpers/create-ingestion-test-app.js`
- Create: `services/backend/src/ingestion/storage-event.js`
- Create: `services/backend/src/ingestion/service.js`
- Create: `services/backend/src/ingestion/routes.js`

**Interfaces:**
- Produces `parseStorageFinalizedEvent({ headers, body, allowedBuckets })`.
- Produces `createOriginalFinalizer({ repository, objectInspector, clock })`.
- Produces `finalizer.handle(event) -> applied|duplicate|rejected`.
- Produces `registerIngestionRoutes(app, { finalizer, allowedBuckets })`.

- [ ] **Step 1: Write strict CloudEvent parser tests**

Accept only binary-mode Eventarc input with:

- `ce-type=google.cloud.storage.object.v1.finalized`;
- non-empty server-received `ce-id`;
- source exactly matching `//storage.googleapis.com/projects/_/buckets/{bucket}`;
- allowlisted `data.bucket` equal to source bucket;
- path exactly `users/{uid}/originals/{batchId}/{fragmentId}` with one segment per identifier;
- non-empty `data.generation` equal to any envelope generation field if supplied.

Reject missing, duplicate/array/comma-merged CloudEvent headers, wrong type/source/bucket/path/generation and source/data contradictions with `ingestion/invalid-event`. The parsed result contains only eventId, bucket, objectName, generation, uid, batchId and fragmentId.

- [ ] **Step 2: Write failing finalizer tests**

Test:

- unregistered owner batch/item returns permanent `ingestion/unregistered-original` and never calls inspector;
- exact manifest item supplies sourceType, allowed MIME and maxBytes to inspector;
- successful inspection builds a Fragment with authoritative facts, copied Source Descriptor, empty hashes/facts and null journey/scene/place, then calls `finalizeOriginal` once;
- permanent inspector failure calls `rejectOriginal` once with stable failureCode and never creates Fragment;
- retryable inspector failure leaves repository untouched and remains retryable;
- repository duplicate returns success no-op;
- different generation becomes `ingestion/original-conflict`;
- no private source/path/object metadata appears in errors.

- [ ] **Step 3: Write failing ingestion route tests**

The test helper registers the receiver on a base app. Assert:

- applied/duplicate/rejected terminal outcomes return 204 so Eventarc need not retry;
- invalid event returns stable 400;
- conflict returns stable 409;
- retryable dependency failure returns stable 503;
- response requestId comes only from Fastify `request.id`;
- no Firebase ID Token/App Check header is required at this application route because Cloud Run IAM is the outer boundary;
- the helper is test-only and is never imported by production API source.

- [ ] **Step 4: Run RED**

```bash
node --test test/unit/storage-event.test.js test/unit/original-finalizer.test.js test/integration/ingestion-app.test.js
```

Expected: FAIL with missing event/finalizer/route modules.

- [ ] **Step 5: Implement parser, use case and route**

The use case sequence is fixed:

1. load owner-scoped batch;
2. locate and recheck exact pending/settled manifest item;
3. call inspector with event identity and server manifest policy;
4. on valid object, construct the uploaded Fragment and call the atomic success repository port;
5. on permanent object error, call the atomic rejection port;
6. propagate retryable failures without state mutation.

The repository transaction remains the final authority and must revalidate current item state/generation to close races between step 1 and step 4/5.

- [ ] **Step 6: Run GREEN and repository regression**

```bash
node --test test/unit/storage-event.test.js test/unit/original-finalizer.test.js test/integration/ingestion-app.test.js test/contract/memory-repository.test.js
npm test
git diff --check
```

- [ ] **Step 7: Commit**

```bash
git add services/backend/src/ingestion services/backend/test/unit/storage-event.test.js services/backend/test/unit/original-finalizer.test.js services/backend/test/integration/ingestion-app.test.js services/backend/test/helpers/create-ingestion-test-app.js
git commit -m "feat(ingestion): finalize originals idempotently"
```

---

### Task 9: Separate production composition roots and configuration

**Files:**
- Create: `services/backend/test/integration/composition.test.js`
- Create: `services/backend/src/composition/api.js`
- Create: `services/backend/src/composition/ingestion.js`
- Create: `services/backend/src/composition/runtime.js`
- Modify: `services/backend/test/unit/config.test.js`
- Modify: `services/backend/src/config.js`
- Modify: `services/backend/src/server.js`
- Modify: `services/backend/README.md`

**Interfaces:**
- Produces `createApiComposition(dependencies)`.
- Produces `createIngestionComposition(dependencies)`.
- Produces `createRuntimeApp(config)` selecting one composition by `ELSEWHERE_SERVICE_MODE`.

- [ ] **Step 1: Write failing config and route-isolation tests**

Configuration tests cover:

- `ELSEWHERE_SERVICE_MODE=api|ingestion` only;
- required Firebase project ID;
- comma-separated values normalized into non-empty unique `allowedAppIds` and storage bucket allowlists;
- API mode rejects an empty App ID allowlist;
- ingestion mode rejects an empty bucket allowlist;
- invalid/empty/duplicate-comma values fail without echoing secrets.

Composition tests inject fakes and assert:

- both compositions expose public `/healthz` and `/readyz`;
- API exposes the two protected Import Batch routes and returns 404 for `/events/storage-finalized`;
- ingestion exposes only `/events/storage-finalized` and returns 404 for both Import Batch routes and `/protected`;
- API uses token verifier/App Check; ingestion does not install the application Auth boundary;
- neither production composition imports any test helper;
- selection by service mode builds exactly one Firebase Admin app/dependency graph.

- [ ] **Step 2: Run RED**

```bash
node --test test/unit/config.test.js test/integration/composition.test.js
```

Expected: FAIL because service-mode config and composition roots do not exist.

- [ ] **Step 3: Implement mode-specific configuration and roots**

Add environment fields:

```text
ELSEWHERE_SERVICE_MODE=api|ingestion
FIREBASE_PROJECT_ID
ELSEWHERE_ALLOWED_APP_IDS (API mode)
ELSEWHERE_STORAGE_BUCKETS (ingestion mode)
```

Keep existing AI config untouched. Parse lists once, trim, reject empty members and freeze outputs.

API production graph:

```text
Firebase Admin -> Firestore repository + Auth/App Check verifier
base app -> auth boundary -> import service -> import routes
```

Ingestion production graph:

```text
Firebase Admin -> Firestore repository + Storage inspector
base app -> original finalizer -> Storage finalized route
```

`server.js` creates only the selected graph and retains current graceful shutdown. The same Docker image therefore serves two Cloud Run services, while runtime service-account and IAM differences remain deployment configuration, not application conditionals.

Document explicitly in `services/backend/README.md`:

- `elsewhere-api`: browser-reachable, Firebase Auth/App Check, API runtime service account;
- `elsewhere-ingestion`: unauthenticated disabled, Eventarc invoker only, ingestion runtime service account;
- local Emulator does not prove Cloud Run IAM or Storage App Check enforcement.

- [ ] **Step 4: Run GREEN, scan production routes and build/start sanity**

```bash
node --test test/unit/config.test.js test/integration/composition.test.js test/integration/import-api.test.js test/integration/ingestion-app.test.js
rg -n "(/protected|create-import-api-app|create-ingestion-test-app)" services/backend/src
npm test
npm audit --omit=dev
git diff --check
```

Expected: focused and ordinary tests pass; `rg` returns no production test-route/helper matches; audit is clean; diff check has no output. Do not run a long-lived server in this phase.

- [ ] **Step 5: Commit**

```bash
git add services/backend/src/composition services/backend/src/config.js services/backend/src/server.js services/backend/test/unit/config.test.js services/backend/test/integration/composition.test.js services/backend/README.md
git commit -m "feat(runtime): separate API and ingestion services"
```

---

### Task 10: Full Auth + Firestore + Storage Emulator path

**Files:**
- Create: `services/backend/test/emulator/import-original.emulator.test.js`
- Modify: `services/backend/package.json`

**Test composition boundary:**

- Use Firebase Web SDK anonymous Auth and Storage against Emulators.
- Use the real Firebase Admin ID Token verifier and Firestore/Storage adapters.
- Use a fake App Check verifier only inside this test composition root because there is no App Check Emulator.
- Inject the finalized CloudEvent directly into the ingestion Fastify composition.
- Do not claim to test Cloud Run IAM or production Storage App Check enforcement.

- [ ] **Step 1: Write the skipped-outside-emulators end-to-end test**

The test must:

1. skip unless Auth, Firestore and Storage Emulator host variables all exist;
2. anonymously sign in through Web SDK and obtain a real Emulator ID Token;
3. POST one photo import request to API with that ID Token and test-only App Check token;
4. assert API created a pending Firestore manifest and returned its exact upload path/policy;
5. upload a minimally valid JPEG-signature object through Web SDK Storage at that path and allowed content type;
6. obtain authoritative generation/size/crc32c from Admin Storage metadata;
7. inject one matching Storage finalized CloudEvent into ingestion;
8. inject the exact event again and assert duplicate success;
9. GET receipt through the protected API and assert saved=1, processed=0, finalized state, `complete/processing`;
10. read Fragment through repository and assert copied Source Descriptor, generation/size/crc32c, nullable MD5, empty hashes/facts;
11. assert there is only one Fragment and one saved count;
12. clean Auth app, Admin app and Rules test state in test teardown even on assertion failure.

- [ ] **Step 2: Run the first full-path integration verification under all Emulators**

Update `test:emulator` only after the new test exists so it includes the new file. Then run:

```bash
npm run test:emulator
```

This task adds no new production behavior: each constituent behavior already had an observed RED in
Tasks 1-9. Record the actual first-run result. If it fails, confirm the failure is at a real integration
boundary and proceed to Step 3. If it passes, treat it as end-to-end confirmation and do not introduce
an artificial failure. A skip is not acceptable while all three Emulators are running.

- [ ] **Step 3: Make only Emulator wiring corrections**

Permitted fixes are limited to:

- emulator host/bucket initialization;
- deterministic teardown;
- CloudEvent header/body shape matching Eventarc;
- test script file inclusion.

Do not weaken production schema, Storage Rules, signature validation or Auth/App Check behavior to make the Emulator test pass.

- [ ] **Step 4: Run GREEN twice and verify no leaked emulator processes**

```bash
npm run test:emulator
npm run test:emulator
pgrep -fl "firebase.*emulator|cloud-firestore-emulator" || true
npm test
git diff --check
```

Expected: both Emulator runs finish with 0 failures; ordinary tests have 0 failures; no new long-lived Emulator process remains after `emulators:exec`; diff check is clean.

- [ ] **Step 5: Commit**

```bash
git add services/backend/test/emulator/import-original.emulator.test.js services/backend/package.json
git commit -m "test(import): verify original save with Firebase Emulators"
```

---

### Task 11: Module 3 documentation, final regression and stop

**Files:**
- Create: `docs/implementation/import-batch-original-save-v1.md`

- [ ] **Step 1: Write the operational boundary document**

Document only implemented behavior:

- API request/response and stable errors;
- Source Descriptor v1 provider whitelist and prohibited credential fields;
- per-source upload policy table;
- exact Storage path and Rules dependency on ImportBatch;
- finalized CloudEvent contract and metadata/signature order;
- nullable MD5 and required generation/size/crc32c;
- idempotency and exact batch state table;
- retryable vs permanent failure behavior;
- two Cloud Run services, distinct runtime service accounts and IAM boundaries;
- local test limitations and Module 10 deployment gates;
- Module 4 stop boundary.

Do not document malware scanning, semantic parsing, EXIF extraction, Cloud Run IAM denial or Storage App Check enforcement as already implemented/tested.

- [ ] **Step 2: Run every final verification from a clean process state**

Working directory: `services/backend` unless stated otherwise.

```bash
node --test test/unit/import-contracts.test.js test/unit/import-domain.test.js test/unit/import-service.test.js test/unit/file-signature.test.js test/unit/firebase-object-inspector.test.js test/unit/storage-event.test.js test/unit/original-finalizer.test.js
node --test test/integration/import-api.test.js test/integration/ingestion-app.test.js test/integration/composition.test.js
node --test test/unit/auth-contracts.test.js test/unit/firebase-token-verifier.test.js test/unit/auth-boundary.test.js test/integration/auth-boundary-app.test.js
node --test test/contract/memory-repository.test.js
npm run test:emulator
npm test
npm audit --omit=dev
rg -n "(/protected|create-import-api-app|create-ingestion-test-app)" src
git diff --check
git status --short
```

Expected:

- all focused tests 0 fail;
- Emulator suite 0 fail and no in-emulator skip;
- ordinary suite 0 fail (emulator-only tests may skip outside Emulator hosts);
- audit reports 0 vulnerabilities;
- production route/helper scan has no matches;
- diff check has no output;
- status contains only the new documentation file before commit.

- [ ] **Step 3: Commit documentation**

From repository root:

```bash
git add docs/implementation/import-batch-original-save-v1.md
git commit -m "docs(import): document original save boundary"
```

- [ ] **Step 4: Verify final commit chain and clean worktree**

```bash
git log --oneline --decorate -14
git status --short
```

Expected: the plan plus Task 1-11 commits are individually visible and the worktree is clean.

Stop after Module 3. Do not begin Module 4 Deterministic Processing without a new explicit user instruction.
