# Elsewhere Cloud Run Deployment

## Boundary

The deployment reuses one immutable backend image for three mutually exclusive production composition roots:

| Service | Cloud Run access | Runtime authority | Explicitly absent |
| --- | --- | --- | --- |
| `elsewhere-api` | public transport; Firebase ID Token + App Check in application | Firestore owner-scoped ImportBatch API | Storage, Tasks, Document AI |
| `elsewhere-ingestion` | Eventarc invoker only | Firestore, original/derivative Storage, enqueue `elsewhere-ocr` | Document AI |
| `elsewhere-capability-worker` | Cloud Tasks OIDC invoker only | Firestore, original/artifact Storage, fixed Document AI OCR | enqueue Tasks |

`elsewhere-task-invoker` is an invocation identity only. `elsewhere-eventarc-invoker` is an Eventarc delivery identity
only. Neither identity is used as a runtime service account. Minimum instances remain zero and the queue is capped at two
dispatches per second and two concurrent deliveries.

The production API contains no `/demo/v1/**` route. Firebase Hosting rewrites only `/v1/**` to `elsewhere-api`; all
other paths remain the static SPA. Production exposes the reviewed ImportBatch routes and the bounded owner-scoped
`GET /v1/memory-snapshot` read boundary. Else and all demo reset/manual-finalize controls remain isolated.

## Deploy

The ignored file `services/backend/.env.cloud.local` must contain the verified Firebase bucket, Web App ID, and fixed
Document AI tuple. The deployment script validates the project, region, and processor version before mutating cloud
resources. It does not read or upload the Gemini API key.

```bash
scripts/deploy-google-cloud-services.sh --plan
scripts/deploy-google-cloud-services.sh
```

The script is idempotent for service accounts, Artifact Registry, the queue, services, IAM bindings, and Eventarc
trigger. `.gcloudignore` limits the build context to the backend and its fixture dependency, while `cloudbuild.yaml`
explicitly selects `services/backend/Dockerfile`. A new Git commit produces a new image tag, and all three services are
then pinned to that same tag. Storage access is granted on the single Firebase bucket rather than at project scope.

## Verification

After deployment:

```bash
gcloud run services list --project=elsewhere-memory-tyx-2026 --region=asia-southeast1
gcloud tasks queues describe elsewhere-ocr --project=elsewhere-memory-tyx-2026 --location=asia-southeast1
gcloud eventarc triggers describe elsewhere-original-finalized --project=elsewhere-memory-tyx-2026 --location=asia-southeast1
```

Required checks:

- API `/readyz` returns 200 without exposing credentials. Cloud Run's Google Front End intercepts the exact
  `/healthz` path with a platform 404 before Fastify; retain that route for container-level probes and use `/readyz`
  for the external check.
- ingestion and worker reject unauthenticated requests at the Cloud Run boundary. The current platform response is a
  non-application 404; the service IAM policy remains the authority for the denial.
- the task identity can invoke only the worker and the Eventarc identity can invoke only ingestion.
- API runtime has no Cloud Tasks or Document AI role.
- ingestion runtime has no Document AI role.
- worker runtime has no Cloud Tasks enqueuer role.
- the Eventarc trigger filters only the verified Firebase bucket.
- `services/backend/.env.cloud.local` still has `ELSEWHERE_DOCUMENT_AI_DEMO_ALLOWED=false`.

The production ingestion smoke uses no `/demo/v1/**` route and never manually invokes the finalized handler. It uses a
real anonymous Firebase identity and App Check token to create one batch, uploads the project-owned Common Grounds
receipt through Storage Rules, waits for Eventarc, deterministic processing, Authoritative Routing, Cloud Tasks, and
Document AI, verifies the persisted result through `GET /v1/memory-snapshot`, and verifies owner-specific cleanup in
Auth, Firestore, and Storage:

```bash
RUN_REAL_GOOGLE_PROVIDER_TESTS=true npm --prefix services/backend run smoke:cloud-run
```

This passed on 2026-07-20 in `asia-southeast1`; `test_owner_cleanup=passed` verifies the generated smoke uid only.
Historical anonymous Auth identities are outside the smoke cleanup boundary and are not deleted.

Firebase Hosting deployment is separate. A production cloud build may use:

```bash
cd design-lab/prototypes-vanilla
node --env-file=.env.cloud.local node_modules/vite/bin/vite.js build --mode cloud
cd ../../firebase
firebase deploy --project elsewhere-memory-tyx-2026 --only hosting
```

Hosting is deployed as the fixture-backed judge build. The production API exposes the reviewed ImportBatch
write/receipt boundary and a generic persisted memory snapshot, but not the Bangkok-specific competition projection or
Else. Switching the public SPA wholesale to cloud mode would therefore still be misleading. No Gemini key is deployed
to Cloud Run because none of the three reviewed production composition roots consumes Gemini.
