# Elsewhere Real Product Operation Adversarial Audit

Date: 2026-07-21

## Outcome

The deployed product now separates four execution authorities explicitly:

- owner-scoped domain mutations: authenticated Cloud Run API and Firestore;
- original ingestion: Firebase Auth, App Check, Storage, Eventarc and ingestion service;
- Else answers: evidence-bounded Cloud Run API and Vertex Gemini;
- navigation, camera, filters, overlays, downloads and cache: deliberate client or device operations.

The frontend no longer reports a domain mutation as successful before its server operation completes. A server failure leaves the local authority state unchanged.

## Operation map

| User operation | Authority | Persisted result |
| --- | --- | --- |
| Select and import originals | Firebase Import API + Storage | ImportBatch, original, Fragment |
| Confirm inbox item | Experience API | `reviewDecisions` |
| Confirm or reject connection | Experience API | `connectionDecisions` |
| Save or unsave discovery | Experience API | `savedDiscoveryIds` |
| Save private writing | Experience API | `notes` |
| Change privacy or AI tone | Experience API | `settings` |
| Remove a journey from current views | Experience API | `excludedJourneyIds`; original bytes remain |
| Ask Else | Else API + Vertex Gemini when evidence exists | budgeted answer with validated sources |
| Navigate, filter, move camera, open Lens | client UI | no server mutation by design |
| Export or share | device download | local file only |
| Clear preview cache | device cache | originals are not changed |

`ACTION_AUTHORITIES` and `STORE_ACTION_AUTHORITIES` are executable frontend contracts. Tests fail when a rendered action has no declared authority.

## Production evidence

Cloud Run revisions deployed from image `73746e3`:

- `elsewhere-api-00005-vgg`;
- `elsewhere-ingestion-00005-qjp`;
- `elsewhere-capability-worker-00005-85t`.

Firebase Hosting: <https://elsewhere-memory-tyx-2026.web.app>

The isolated live smoke command:

```bash
set -a
source services/backend/.env.cloud.local
source design-lab/prototypes-vanilla/.env.cloud.local
set +a
node scripts/verify-live-product.mjs
```

Fresh result:

```json
{
  "auth": "anonymous-owner-verified",
  "appCheck": "verified",
  "settingPersisted": true,
  "storageUpload": "complete",
  "ingestion": "finalized",
  "fragmentCount": 1,
  "elseState": "found",
  "elseSourceCount": 1
}
```

The evidence file is the repository's public Bangkok demo photo. The script does not print credentials, Firebase UID, object paths or internal document IDs.

## Adversarial browser scan

Routes checked in the deployed app:

- World;
- Import;
- Fragment Field;
- Inbox;
- Discover;
- Me;
- Writing;
- Privacy;
- AI preferences;
- Storage;
- Export.

For every route the audit asserted:

- no runtime error surface;
- no mojibake or unresolved JavaScript values;
- no horizontal overflow at the mobile viewport;
- no enabled button without an action handler;
- exactly one shared canvas;
- truthful zero-data copy for a fresh owner.

The privacy setting was changed in the deployed browser, returned a success state, and remained changed after a full reload. This uncovered and fixed two authentication lifecycle defects: a timestamped Firebase App name and signing in before persisted Auth state was ready.

## Verification

- frontend unit tests: 157 passed, 0 failed;
- backend ordinary tests: 624 passed, 0 failed, 10 Emulator-dependent tests skipped;
- frontend cloud build: passed;
- live Auth/App Check/Storage/Eventarc/Firestore/Vertex smoke: passed;
- `git diff --check`: passed.

## Honest limits

- The local Firebase Emulator suites could not run on this machine because no Java runtime is installed. The real Google Cloud smoke covers the primary production path but does not replace every Emulator rules test.
- Firestore and Storage security rules were not replaced during this deployment. Hosting-only deployment was used after the deployment safety boundary rejected an unreviewed live rules replacement.
- Empty owners have no discovery or connection to mutate. Those operation boundaries are covered by backend integration tests and frontend authority tests; the live smoke validates the shared persistence service through settings and import.
- Writing supports persistent editing of an existing note. Creating the first note is not presented as an available action in the empty state.
