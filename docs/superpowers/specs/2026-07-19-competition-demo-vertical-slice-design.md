# Elsewhere Competition Demo Vertical Slice Design

**Date:** 2026-07-19

**Status:** Approved for immediate execution

## 1. Goal

Build one honest, recordable competition flow in less than one day. A user selects real JPEG/PNG/WebP files,
the existing backend saves and deterministically processes their bytes, and the visual prototype renders the
resulting Firestore data. The recording must show one real relationship becoming a Discovery and one Gemini
answer whose sources open the real uploaded Fragments.

This is a competition prototype, not a claim of production deployment. Firebase Emulator is the local data and
event environment; configured Document AI and Gemini calls are real external calls. No core recording screen may
read `src/fixtures/data.js` after live hydration completes.

## 2. Fixed Recording Story

The single supported story is Bangkok:

1. select 8–15 real demo originals;
2. save originals through an owner-scoped ImportBatch and Storage upload;
3. run signature validation, metadata extraction, SHA-256, dHash, thumbnailing, duplicate detection and routing;
4. show live processing and the real batch receipt;
5. show World, Bangkok City, Fragment Field and Fragment Lens from the persisted Fragments;
6. group at least three morning Fragments near the same place into one deterministic repeated-place candidate;
7. keep one incomplete Fragment as an Inbox item;
8. reveal a Discovery from the candidate evidence;
9. ask Else about the repeated mornings and return a Gemini answer with only persisted source IDs;
10. open one returned source in Fragment Lens.

The demo source pack is curated, but runtime results may not be hard-coded. A committed manifest may describe
source type, capture time and GPS for the supplied files when those facts cannot be preserved by the demo asset
format. The manifest is input data and is submitted through the same ImportBatch contract; the UI does not inject
prebuilt cities, connections, discoveries or answers.

## 3. Scope

### Included

- isolated competition demo composition; production `api`, `ingestion` and `capability-worker` roots stay intact;
- Firebase Auth/Firestore/Storage Emulator with owner-scoped documents and real uploaded bytes;
- a demo-only finalize coordinator that invokes the existing ingestion pipeline after an Emulator upload;
- deterministic read projection for cities, places, visits, connections, Inbox and Discoveries;
- frontend live-data bootstrap and fixture-shape compatibility projection for the existing renderers;
- real file picker, upload progress, processing state and receipt;
- real originals and derivatives in Fragment Field and Lens;
- Gemini-backed Else endpoint with server-built evidence and source allowlist validation;
- deterministic fallback copy only for an explicit missing-key/error state, never presented as an AI answer;
- one repeatable recording source pack, reset command and recording checklist.

### Excluded Today

- production Cloud Run/Eventarc/Cloud Tasks deployment;
- general multi-city place resolution or Google Photos import;
- vector search, embeddings, cross-trip discoveries, ADK/Agent Engine, BigQuery and FCM;
- HEIC/HEIF/PDF/audio demo inputs;
- generalized editing, export/delete workflows and all non-core pages;
- any weakening of production Auth/App Check, Rules, RoutePlan or IAM boundaries.

## 4. Architecture

### 4.1 Isolation

`services/backend/scripts/demo-server.mjs` is the only entrypoint that can construct the demo composition. The
production `src/server.js` does not import it and cannot register `/demo/*` routes. Demo configuration requires
`NODE_ENV=development`, Firebase Emulator host variables and an explicit `ELSEWHERE_DEMO_MODE=true`; otherwise
startup fails closed.

The demo API accepts a real Firebase Auth Emulator ID token. App Check has no Emulator, so only this isolated
composition accepts the literal local demo token. Production auth tests must prove that token remains invalid in
the production API composition.

### 4.2 Data Flow

```text
Browser file picker
→ anonymous Auth Emulator identity
→ POST /v1/import-batches
→ Firebase Storage Emulator upload at server-issued path
→ POST /demo/v1/finalize-upload with batch/fragment references
→ existing object inspection + original finalizer
→ existing deterministic processing
→ existing Authoritative Router
→ persisted Fragment / ImportBatch / duplicate / routing state
→ demo projection service reads current owner snapshot
→ frontend compatibility hydrator updates the visual data graph
```

The finalize request contains references only. The server re-reads manifest and Storage metadata; it does not trust
client size, MIME, generation, facts or owner fields.

### 4.3 Competition Projection

The projection is a pure deterministic function over owner-scoped Fragments and ImportBatches. It emits only the
minimum shapes used by World, City, Field, Lens, Inbox and Discovery:

- city: group GPS coordinates into the Bangkok bounding box; unknown coordinates remain `unplaced`;
- place: map coordinates to a small versioned demo anchor table using an 80 m maximum distance;
- visit: group same-place Fragments whose capture times are no more than 45 minutes apart;
- connection: emit same-visit and repeated-place edges with explicit evidence IDs;
- discovery candidate: require at least three distinct local dates, morning time 05:00–11:30, one place and no
  terminal processing failure;
- Inbox: emit missing-place or unresolved receipt items; user decision is persisted separately and recomputes the
  projection;
- Discovery: title and explanation are never inputs to the candidate rule. Evidence and common place exist first;
  presentation reveals the title only after those objects.

No deterministic rule claims emotion, intent or subjective meaning.

### 4.4 Frontend Live Hydration

The existing page renderers are retained. A live bootstrap fetches `/demo/v1/snapshot`, converts persisted objects
into the established renderer shapes and mutates only the canonical in-memory collections before the first render.
Particle targets continue to consume the same collections, so particle density and anchors change with the live
Fragment count.

Core routes display a blocking setup/error state if live bootstrap fails. They must never silently fall back to the
Bangkok fixture while `VITE_ELSEWHERE_DATA_MODE=live`.

### 4.5 Else

`POST /demo/v1/else/ask` accepts a question and current scope. The server constructs an evidence pack from the
owner snapshot, calls the configured Gemini model once, parses the answer and rejects every cited source ID not in
the pack. The response is direct answer, sources, uncertainty and one next step. Missing credentials return an
explicit unavailable response and block recording acceptance.

## 5. Interfaces

### Demo API

```text
POST /v1/import-batches
POST /demo/v1/finalize-upload
GET  /demo/v1/import-batches/:batchId
GET  /demo/v1/snapshot
POST /demo/v1/inbox/:itemId/decision
POST /demo/v1/else/ask
POST /demo/v1/reset
```

All routes except health checks require the Auth Emulator ID token. Demo-only routes also require
`X-Elsewhere-Demo: local-competition-v1`.

### Live Snapshot

```js
{
  ownerId,
  revision,
  world,
  cities,
  fragments,
  importBatches,
  places,
  visits,
  connections,
  inboxItems,
  discoveries
}
```

The snapshot contains Storage paths, not privileged URLs or private capability artifacts. The browser resolves
owner-readable originals/derivatives through the Firebase Storage Emulator SDK.

## 6. Failure Behaviour

- invalid file policy: reject before upload with a visible per-file reason;
- upload/finalize failure: preserve successful items, show retry for the failed item;
- processing failure: retain original and show failed/unresolved state;
- no GPS/time: retain Fragment and route to Inbox/unplaced rather than inventing a place;
- missing Document AI: receipt remains unresolved; no fake OCR text;
- missing Gemini: Else shows “Gemini 尚未配置” and no answer; recording gate fails;
- unknown Gemini source: remove it; if no valid source remains, mark answer uncertain and fail the source gate;
- live snapshot unavailable: show setup error; never load the old fixture in live mode.

## 7. Test and Recording Gates

Automated gates:

- existing backend suite remains green;
- existing frontend suite is repaired to zero failures before feature work;
- pure projection tests cover empty, 1, 3, 12 and changed-data inputs;
- integration test uploads bytes to the Storage Emulator and receives a changed live snapshot;
- frontend test proves live mode does not render the authority fixture before hydration;
- Playwright records import → receipt → World → City → Field → Lens → Discovery → Else source;
- one test proves production API has no `/demo/*` route and rejects the demo token.

Manual recording gates:

- fresh reset followed by one uninterrupted successful run;
- every visible count traces to the current snapshot;
- uploaded original is visibly the selected file;
- Discovery evidence IDs are persisted Fragment IDs;
- Else response is from a real Gemini call and every source opens;
- no fixture city/count appears after live bootstrap;
- `window.__ELSEWHERE_VISUAL_READY__ === true` before stable screenshots or recording marks.

## 8. Timebox and Stop Rule

Implementation order is fixed: baseline → import/processing → live core pages → projection/Discovery → Else → E2E.
At hour 12, if Gemini or Document AI credentials are still unavailable, continue all deterministic and UI work but
mark the corresponding external smoke blocked. Do not substitute fake output. At hour 16, freeze feature work and
spend the remaining time only on the recording path, reset reliability and visible failures.
