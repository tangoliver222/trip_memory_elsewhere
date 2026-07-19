# Elsewhere Google Ecosystem Competition Expansion Design

**Date:** 2026-07-19

**Status:** Approved for continuous execution

**Project ID:** `elsewhere-memory-tyx-2026` (append a short suffix only if unavailable)

**Primary region:** `asia-southeast1` (Singapore)

## 1. Goal

Extend the already verified Bangkok competition path into a visible Google ecosystem story without replacing its
deterministic-first architecture. The recording must show real Firebase identity and persistence, a RoutePlan-approved
Document AI OCR execution, evidence-first Discovery, and a real Gemini answer whose sources open the persisted original.

This remains a competition vertical slice, not a claim that every Elsewhere page or every production operation is
complete. The fixed story must stay recordable throughout the work.

## 2. Product and engineering invariants

- Original bytes are saved before derived processing.
- AI is never the first import step.
- Document AI and Gemini may run only from the capability or query boundary that owns them.
- A processor cannot silently upgrade its own RoutePlan.
- Supporting and suppressed Fragments remain visible and exportable.
- OCR provider payloads and normalized artifacts remain server-private.
- The browser receives only bounded, user-readable provenance and suggested facts.
- Evidence appears before a Discovery title or Gemini observation.
- The production `api`, `ingestion`, and `capability-worker` composition roots remain isolated.
- No production route accepts the local demo App Check token.
- No secret, service-account JSON, provider response, bucket path, task ID, or internal error enters browser copy.
- The existing vanilla frontend, Three.js scene manager, router, and visual composition remain in place.

## 3. Delivery strategy

### 3.1 Layer one: mandatory cloud-backed recording path

Layer one is the non-negotiable recording gate:

```text
Browser on localhost
→ Firebase Authentication in the real project
→ direct original upload to Firebase Storage
→ owner-scoped ImportBatch and Fragment state in Firestore
→ local guarded cloud-demo coordinator
→ existing deterministic processing
→ existing Authoritative Router and Budget Gate
→ existing OCR worker invoked only for a queued approved execution
→ real Document AI processor
→ private provider and normalized artifacts in Storage
→ bounded OCR projection in the live snapshot
→ evidence-first Discovery
→ real Gemini Else answer with source allowlist validation
```

The local cloud-demo coordinator is a development-only bridge while Cloud Run is being deployed. It uses real Firebase,
real ADC, and real Google providers, but it must fail closed unless all of these are true:

- `NODE_ENV=development`;
- `ELSEWHERE_CLOUD_DEMO_MODE=true`;
- the project ID is not prefixed with `demo-`;
- Firebase Emulator variables are absent;
- the configured Storage bucket belongs to the configured project;
- a real App Check token is verified by Firebase Admin.

The coordinator does not invent task authorization. After the existing scheduler prepares and marks an execution queued,
it reloads the current routing snapshot and calls the existing worker only with the stored queued execution identity,
current RoutePlan revision, and owner identity.

### 3.2 Layer two: Cloud Run deployment attempt

After layer one passes its complete browser gate, deploy the existing service roots rather than creating a fourth
production architecture:

```text
Firebase Hosting
→ elsewhere-api (Cloud Run)
Storage finalized event
→ elsewhere-ingestion (Cloud Run)
→ Cloud Tasks
→ elsewhere-capability-worker (Cloud Run)
→ Document AI
```

The three services use one image but distinct runtime service accounts and IAM boundaries. Firebase Hosting may rewrite
API traffic to `elsewhere-api`. The ingestion service allows only its Eventarc invoker. The worker allows only the Cloud
Tasks OIDC identity. If deployment cannot reach a clean IAM and end-to-end gate before the recording freeze, retain the
verified layer-one path and describe Cloud Run as implemented but not yet staging-verified; never fake a deployment.

## 4. Google Cloud resources

Create one dedicated Blaze Firebase/Google Cloud project. The user performs only the billing-account and consent steps
that cannot be automated safely.

Required resources:

- one Firebase Web App;
- Anonymous Authentication enabled;
- App Check configured for the web app, with a registered local debug token during layer one;
- Firestore Native database in `asia-southeast1`;
- Firebase Storage default bucket in `asia-southeast1`;
- Firebase Hosting site;
- Document AI Enterprise OCR processor in `asia-southeast1`, using a fixed processor version;
- one Cloud Tasks queue in `asia-southeast1` for layer two;
- Artifact Registry and three Cloud Run services in `asia-southeast1` for layer two;
- separate API, ingestion, worker, Eventarc invoker, and task invoker service accounts;
- Secret Manager entry for Gemini only when Cloud Run is deployed.

Enable only the APIs used by the two layers. Do not enable Places, Vertex AI Vector Search, BigQuery, Pub/Sub beyond an
Eventarc-created dependency, or Agent Engine in this slice.

Cost controls:

- one curated receipt enters OCR during the fixed recording;
- OCR stays at one page, one attempt, and the existing 1,500 micro-dollar reservation ceiling;
- exact duplicates, near-duplicate supporting items, photos, text, PDF, and low-information media do not receive OCR;
- Gemini Else performs one request per explicit user question;
- Cloud Run minimum instances remain zero;
- create billing alerts, while documenting that alerts are not hard spending caps;
- do not add automated retry outside the existing bounded provider lifecycle.

## 5. Source pack correction

Replace the current receipt-labelled copy of a coffee photo with one genuinely readable receipt already owned by the
project or newly supplied by the user. The file must remain a real input, not a generated OCR fixture. Its manifest may
provide source provenance, capture time, and GPS only; merchant, amount, and OCR text must not appear in the input
manifest.

The source pack remains eight items and preserves the three Common Grounds mornings, Riverside evidence, an unplaced
item, and one note. The receipt must be the only first-pass OCR-approved item.

## 6. Backend changes

### 6.1 Cloud demo configuration

Add a strict cloud-demo environment loader distinct from emulator demo and production config. It reads real Firebase Web
App configuration only in the browser and ADC/provider configuration only on the server. It never serializes server
credentials into Vite variables.

### 6.2 Real App Check

The browser initializes Firebase App Check and includes its token in protected requests. The cloud-demo server delegates
both ID token and App Check verification to the existing Firebase Admin verifier. The literal emulator token remains
accepted only by the emulator demo composition.

### 6.3 Approved OCR bridge

Add one cloud-demo OCR coordinator that:

1. receives the server-derived owner and batch ID after successful finalize;
2. loads the routing snapshot;
3. stable-sorts current queued OCR executions;
4. invokes the existing `createOcrCapabilityWorker()` with reference-only tasks;
5. permits only `completed`, `insufficient_input`, `unsupported`, or terminal no-op outcomes;
6. returns 503 for safe retryable pre-provider failures;
7. exposes no automatic retry for `billing_uncertain`;
8. reloads the persisted snapshot before acknowledging completion.

### 6.4 Bounded OCR projection

Add a server-only normalized artifact reader that verifies bucket, object path, generation, size, gzip content type,
SHA-256, and owner/execution metadata before bounded decompression. It projects only:

- provider name and fixed version;
- outcome and page count;
- actual cost micros;
- normalized text excerpt with a fixed length cap;
- suggested merchant/date/time/amount fields already emitted by the OCR normalizer;
- user-readable provenance status.

Raw layout tokens, geometry, confidence arrays, and provider artifacts stay private.

### 6.5 Snapshot and receipt

Extend the demo snapshot and import receipt projection with persisted deterministic, routing, and capability stages.
Every stage uses one of `pending`, `completed`, `skipped`, `unresolved`, or `failed`. No stage may be synthesized from a
timer or page route.

## 7. Frontend changes

### 7.1 Cloud Firebase client

The existing client gains explicit `emulator` and `cloud` infrastructure modes. Cloud mode never calls
`connectAuthEmulator()` or `connectStorageEmulator()`, initializes App Check, and uses the real Web App configuration.
Missing cloud variables render a setup error instead of falling back to emulator values.

### 7.2 Processing and receipt

Show a compact evidence-first pipeline:

```text
原件已保存             Firebase Storage
确定性整理完成         格式 / 时间 / GPS / Hash / 重复
执行计划已批准         Authoritative Router
票据识别完成或跳过     Google Document AI + reason
记忆关系已形成         Firestore projection
```

The receipt shows persisted counts, representative/supporting roles, OCR status, and actual merchant/date/time/amount
only when present. “OCR sufficient” or “GPS sufficient” explains why Gemini or Places did not run.

### 7.3 Fragment Lens

Add a restrained provenance section for the selected Fragment: original source, deterministic facts, routing decision,
Document AI result, and unresolved fields. Internal IDs and infrastructure paths remain absent from user copy.

### 7.4 Discovery and Else

Discovery retains the existing evidence-first reveal. OCR evidence may enrich a source but cannot create a Discovery by
itself. Else displays the current scope, direct Gemini answer, source objects, uncertainty, and next step, plus one quiet
line stating that the answer was generated from the current Firebase originals and every source is reviewable.

World, City, Fragment Field, particle targets, and navigation retain their current composition and consume the changed
live collections.

## 8. Failure behavior

- Billing not linked: stop cloud provisioning before Storage or Document AI creation and show the exact console step.
- Firebase Auth unavailable: block import and preserve selected local files without uploading.
- App Check invalid: reject before handlers and show a setup error, never disable the boundary.
- Upload partially fails: finalize only successful bytes and preserve per-file failure states.
- Document AI unavailable before provider invocation: keep the original, return retryable processing state, and permit one
  deliberate retry.
- Provider call is billing-uncertain: persist the state, stop automatic retry, and keep OCR unresolved.
- OCR text is empty or insufficient: persist evidence, request controlled escalation, and do not invent merchant/amount.
- Gemini fails: preserve the complete deterministic product and show an explicit unavailable answer.
- Cloud Run deployment fails: do not disturb the verified layer-one path.

## 9. Testing and acceptance

TDD applies to every code change. Existing 580 ordinary backend tests, 70 Emulator tests, 75 frontend tests, and the
production build remain green.

New automated gates:

- cloud config rejects missing variables and never enables an emulator;
- production compositions still contain no demo routes;
- App Check tokens are real in cloud mode and literal only in emulator mode;
- OCR coordinator cannot execute unapproved, stale, supporting, or already terminal work;
- normalized artifact reader rejects owner/path/generation/hash/size contradictions and decompression overflow;
- snapshot stages and OCR fields come only from persisted records;
- frontend pipeline contains no timer-driven fake completion;
- cloud-mode browser test uploads one real receipt and shows the changed persisted snapshot;
- real provider smoke returns one persisted Document AI result;
- Gemini answer retains at least one valid source and opens Fragment Lens.

Manual recording gate:

1. start from an empty real Firebase owner;
2. upload the eight real files;
3. show Storage and Firestore-backed progress;
4. show the Router approving OCR only for the receipt;
5. show real Document AI output and cost/provenance summary;
6. show World, City, Field, Lens, Discovery, and Gemini Else;
7. open one Gemini source;
8. verify no fixture totals or invented OCR text appear.

## 10. Commit and stop discipline

Each independently testable stage receives its own commit:

1. cloud project/config documentation;
2. cloud Firebase client and Auth/App Check boundary;
3. approved OCR bridge and artifact projection;
4. processing/receipt/Lens provenance UI;
5. real cloud browser and provider verification;
6. Cloud Run/IAM deployment assets and verification, if layer one is green;
7. final recording runbook and evidence.

Feature work freezes immediately if it threatens the verified recording path. Places, Embedding, vector search, Google
Photos import, Notes import, Agent Engine, generalized cross-city inference, and non-core page backend wiring remain out
of this competition expansion.
