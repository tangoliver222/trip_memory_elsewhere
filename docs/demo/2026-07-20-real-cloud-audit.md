# Elsewhere real-cloud audit

Audit date: 2026-07-20 (Asia/Bangkok)

## Outcome

The production write and processing path is deployed and healthy. It is not a frontend-only mock:

```text
Firebase Auth + App Check
  -> elsewhere-api / ImportBatch
  -> Firebase Storage original
  -> Eventarc
  -> elsewhere-ingestion
  -> deterministic facts
  -> authoritative RoutePlan and Budget Gate
  -> Cloud Tasks
  -> elsewhere-capability-worker
  -> Google Document AI
  -> Firestore and private Storage artifacts
```

The audit identified one bounded gap and this release closed it: the production API now exposes a
reviewed owner-scoped memory snapshot endpoint. The public Hosting build remains a read-only judge
fixture because the production snapshot is intentionally a generic persisted-data boundary rather
than the Bangkok-specific competition projection. The isolated demo composition still owns Else,
reset, and manual-finalize controls; it was not promoted wholesale.

## Live Google Cloud evidence

The following resources were queried directly from project `elsewhere-memory-tyx-2026`.

| Resource | Current state | Boundary |
| --- | --- | --- |
| `elsewhere-api` | Ready, revision `elsewhere-api-00003-gcp` | Public Cloud Run transport; Firebase ID Token and App Check enforced in Fastify |
| `elsewhere-ingestion` | Ready, revision `elsewhere-ingestion-00003-zdd` | Eventarc invoker only |
| `elsewhere-capability-worker` | Ready, revision `elsewhere-capability-worker-00003-p2h` | Cloud Tasks OIDC invoker only |
| Firestore `(default)` | `FIRESTORE_NATIVE`, `asia-southeast1` | Server-derived collections are client-write denied |
| Cloud Tasks `elsewhere-ocr` | `RUNNING` | 2 dispatches/second, 2 concurrent deliveries |
| Eventarc `elsewhere-original-finalized` | Active configuration | Exact bucket and `google.cloud.storage.object.v1.finalized` filter |
| Firebase Hosting | Published | `https://elsewhere-memory-tyx-2026.web.app` |

Runtime identities remain separated:

- API: `elsewhere-api-runtime@elsewhere-memory-tyx-2026.iam.gserviceaccount.com`
- ingestion: `elsewhere-ingestion-runtime@elsewhere-memory-tyx-2026.iam.gserviceaccount.com`
- worker: `elsewhere-worker-runtime@elsewhere-memory-tyx-2026.iam.gserviceaccount.com`
- Eventarc delivery: `elsewhere-eventarc-invoker@elsewhere-memory-tyx-2026.iam.gserviceaccount.com`

Required APIs are enabled, including Cloud Run, Firestore, Firebase Storage, Eventarc, Cloud Tasks,
Document AI, Firebase App Check, and Identity Toolkit.

## Verification matrix

| Capability | Status | Evidence |
| --- | --- | --- |
| Auth and App Check boundary | real-cloud deployed; Emulator verified | Stable four-error contract, app ID allowlist, frozen server auth context |
| ImportBatch create and receipt | real-cloud deployed | Production API composition exposes only reviewed import routes |
| Original Storage authorization | Emulator verified; real-cloud vertical slice previously verified | Owner, manifest, content type, and size are rule-bound |
| Storage finalized ingestion | real-cloud deployed and previously exercised | Exact Eventarc bucket filter and private ingestion IAM |
| Deterministic media facts | real-cloud deployed and previously exercised | Format, metadata, hash, thumbnail, duplicate facts precede paid processing |
| Authoritative routing and budget | real-cloud deployed and previously exercised | Versioned approved RoutePlan controls capability execution |
| OCR execution | real-cloud deployed and previously exercised | Cloud Tasks plus Document AI worker; private normalized artifacts |
| Owner memory snapshot | real-cloud deployed and verified | Authenticated, bounded Firestore projection with redacted internals |
| Bangkok competition projection | implemented only in isolated demo composition | Kept separate from the generic production snapshot |
| Else sourced answer | implemented and real-provider verified in isolated demo composition | Missing reviewed production API and secret/runtime boundary |
| Places and Embedding | intentionally not implemented | RoutePlan can skip/defer them; no provider is claimed |

## Fresh test results

Backend ordinary suite:

```text
tests 614
pass 606
fail 0
skipped 8
```

The eight skips are the expected Emulator-only cases when `npm test` does not start Firebase
Emulators.

Firebase Auth, Firestore, Storage, Rules, repository, deterministic processing, routing, and
capability suite:

```text
tests 70
pass 70
fail 0
skipped 0
```

Frontend release gates immediately before this audit:

```text
unit tests: 89/89
mobile routes and performance: 60/60
recording visual flow: 1/1 at 390x844 and 430x932
public Hosting smoke: 3/3
production build: passed
```

## Environment handling

The ignored local cloud configuration files are present and contain the required variable names.
No secret value was printed or committed. `services/backend/.env` remains safe for local/fake mode;
`services/backend/.env.cloud.local` carries real-cloud deployment configuration; the frontend cloud
configuration remains in `design-lab/prototypes-vanilla/.env.cloud.local`.

## Confirmed next slice

The next backend slice is a separately reviewed production Else boundary. It adds an interactive
provider-cost policy and a provider credential or Vertex runtime authority, so it was not smuggled
into this read-model change. Demo reset and manual-finalize routes remain absent from production.

## Production snapshot release evidence

The released image is:

```text
asia-southeast1-docker.pkg.dev/elsewhere-memory-tyx-2026/
  elsewhere-backend/elsewhere-backend:d69e154
```

The endpoint is `GET /v1/memory-snapshot`. It requires the same verified Firebase ID Token and App
Check boundary as ImportBatch. It returns at most 200 fragments and 50 batches, plus aggregate counts
and explicit truncation flags. It omits storage bucket, generation, CRC/MD5, hashes, provider item
identifiers, provider metadata, source references, and processor internals.

The post-deploy production smoke passed:

```text
cloud-run-ingestion-smoke: PASS
authenticated_api=passed
owner_memory_snapshot=passed
storage_eventarc_routing_tasks=passed
document_ai_result=completed
test_owner_cleanup=passed
```

The project currently has historical anonymous Auth identities that are not owned by this smoke and
were not deleted. The smoke verifies its own uid is absent from Auth, its Firestore owner document is
absent, and its Storage prefix is empty.

## Commands executed

```bash
npm --prefix services/backend test

PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH \
  npm --prefix services/backend run test:emulator

gcloud run services list \
  --project elsewhere-memory-tyx-2026 \
  --region asia-southeast1

gcloud tasks queues describe elsewhere-ocr \
  --project elsewhere-memory-tyx-2026 \
  --location asia-southeast1

gcloud eventarc triggers describe elsewhere-original-finalized \
  --project elsewhere-memory-tyx-2026 \
  --location asia-southeast1

gcloud firestore databases describe \
  --database='(default)' \
  --project elsewhere-memory-tyx-2026
```
