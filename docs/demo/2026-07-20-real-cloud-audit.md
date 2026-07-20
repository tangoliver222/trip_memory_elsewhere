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

The confirmed product gap is narrower: the production API has no reviewed owner-scoped memory
snapshot endpoint. The public Hosting build therefore remains a read-only judge fixture even though
the import and processing services are real. The isolated demo composition has a projection, Else,
reset, and manual-finalize surface; it must not be promoted wholesale because the reset and manual
finalize routes are test controls, not production product APIs.

## Live Google Cloud evidence

The following resources were queried directly from project `elsewhere-memory-tyx-2026`.

| Resource | Current state | Boundary |
| --- | --- | --- |
| `elsewhere-api` | Ready, revision `elsewhere-api-00002-q9b` | Public Cloud Run transport; Firebase ID Token and App Check enforced in Fastify |
| `elsewhere-ingestion` | Ready, revision `elsewhere-ingestion-00002-lzw` | Eventarc invoker only |
| `elsewhere-capability-worker` | Ready, revision `elsewhere-capability-worker-00002-z44` | Cloud Tasks OIDC invoker only |
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
| Owner memory projection | implemented only in isolated demo composition | Missing reviewed production read boundary |
| Else sourced answer | implemented and real-provider verified in isolated demo composition | Missing reviewed production API and secret/runtime boundary |
| Places and Embedding | intentionally not implemented | RoutePlan can skip/defer them; no provider is claimed |

## Fresh test results

Backend ordinary suite:

```text
tests 610
pass 602
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
unit tests: 88/88
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

Add one production owner-scoped, bounded, read-only memory snapshot boundary. It will reuse the
existing server-owned Firestore facts but will not register demo reset, manual finalize, or demo gate
routes. The slice must be proven by RED/GREEN integration tests before deployment. A production Else
endpoint remains a separate follow-up because it adds a provider secret and cost boundary; it must
not be smuggled into the read-model change.

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
