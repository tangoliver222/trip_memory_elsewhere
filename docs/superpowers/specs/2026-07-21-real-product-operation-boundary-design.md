# Elsewhere Real Product Operation Boundary Design

**Date:** 2026-07-21

## Outcome

The production frontend must stop mixing fixture state, demo-only routes, and real Google Cloud
services. Every user action receives one explicit execution owner:

- **UI-local:** navigation, filters, camera/particle transforms, overlay open/close;
- **device-local:** preview-cache clearing, export-file creation, share-image creation;
- **owner-persisted:** Inbox decisions, connection decisions, saved discoveries, notes,
  preferences, and journey exclusion;
- **Google-backed:** anonymous Firebase Auth, App Check, Firebase Storage imports,
  Firestore persistence, deterministic ingestion, Document AI when approved by RoutePlan,
  and Vertex AI Gemini for Else questions.

UI-local and device-local actions must not call a server merely to look connected. All
owner-persisted and Google-backed actions must use verified identity, stable error contracts,
and real persistence. Live cloud mode must never fall back to fixture answers or demo routes.

## Current root causes

1. `action-controller.js` mutates local store for review, connection, discovery, note, settings,
   and deletion actions.
2. Cloud `askElse()` calls `/demo/v1/else/ask` even though the production API exposes
   `/v1/else/ask`.
3. Cloud `saveInboxDecision()` calls a demo-only route absent from the production composition.
4. The production snapshot is a safe raw memory projection; the frontend needs an authenticated
   experience projection plus persisted user state to render the product truthfully.
5. There is no mutation status/error state, so failed remote operations can look successful.

## Architecture

### Backend

Add an `experience` application boundary:

```text
verified uid
  -> Experience routes
  -> Experience service
  -> Firestore owner-state repository
  -> deterministic experience projection
```

One owner-scoped Firestore document stores bounded user-authored state. The document is updated
in transactions and never trusts `ownerId`, `uid`, timestamps, or request IDs from the client.
The service combines the existing deterministic fragment/batch reader with the existing
competition projection. The production snapshot remains source-grounded; user state only changes
explicit user choices.

The persisted state contains:

- review decisions;
- connection decisions;
- saved discovery IDs;
- notes;
- preference values;
- excluded journey IDs;
- monotonically increasing revision and server timestamp.

Journey exclusion is deliberately not byte deletion. It removes the journey from the product
view while original Storage objects remain recoverable/exportable. The UI copy must state this
truthfully. Destructive original-byte deletion is a separate future operation requiring a
Storage-capable deletion worker and retention policy.

### Frontend

Cloud runtime endpoints are selected explicitly:

- experience snapshot: `/v1/experience-snapshot`;
- Else: `/v1/else/ask`;
- user mutations: `/v1/experience/...`;
- import manifest/receipt: existing `/v1/import-batches...`;
- original bytes: existing Firebase Storage upload.

The action controller follows one rule: in live mode, update visible domain state only after the
remote operation succeeds. While pending it exposes a visible busy state; on failure it exposes a
visible error and preserves the prior value. Fixture mode remains a deliberate design-lab mode,
not a production fallback.

## Operation map

| Operation | Owner | Production capability |
| --- | --- | --- |
| Navigate/filter/camera/Lens | UI | Router/store/WebGL |
| Share/export/cache | Device | Blob download/browser cache state |
| Import | Google-backed | Auth + App Check + API + Storage + Eventarc pipeline |
| Else question | Google-backed | Auth + App Check + `/v1/else/ask` + Vertex AI budget gate |
| Inbox decision | Owner-persisted | Firestore transaction + refreshed projection |
| Connection decision | Owner-persisted | Firestore transaction |
| Save discovery | Owner-persisted | Firestore transaction |
| Save note | Owner-persisted | Firestore transaction |
| Preferences | Owner-persisted | Firestore transaction |
| Exclude journey | Owner-persisted | Firestore transaction; original bytes retained |

## Security and failure rules

- Production routes use the existing Firebase Auth + App Check pre-handler.
- Every route derives the owner from frozen `request.authContext.uid`.
- Request bodies are strict and bounded with Zod.
- Internal Firebase errors never reach the client.
- A remote failure never produces a local success state.
- Else never uses fixture copy after a production provider/budget failure.
- All user-state responses are bounded and contain no original Storage credentials.

## Adversarial acceptance criteria

1. Forge `uid`, `ownerId`, and `requestId`: no cross-owner read/write and only server request ID.
2. Repeat the same explicit mutation: stable idempotent state, no duplicate arrays.
3. Simulate 401/403/409/503: UI shows failure and does not display saved/confirmed state.
4. Refresh after each mutation: the choice remains because it came from Firestore.
5. Ask Else in cloud mode: request reaches `/v1/else/ask`, not `/demo/...`; source IDs remain
   server-validated.
6. Upload a real file: Storage object, import receipt, deterministic projection, and page data all
   refer to the same owner and fragment ID.
7. Empty owner: zero-data UI remains honest and does not hydrate Bangkok fixture content.
8. Every rendered button is either mapped to one documented operation or explicitly disabled.

