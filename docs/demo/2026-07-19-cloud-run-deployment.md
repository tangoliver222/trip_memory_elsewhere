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
other paths remain the static SPA. The verified recording path may continue using the isolated local cloud-demo
composition until a production read-model and Else endpoint receive their own reviewed boundary.

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
Document AI, verifies the persisted result, and deletes the owner from Auth, Firestore, and Storage:

```bash
RUN_REAL_GOOGLE_PROVIDER_TESTS=true npm --prefix services/backend run smoke:cloud-run
```

This passed on 2026-07-20 in `asia-southeast1`; the cleanup audit returned zero Auth users, zero root user documents,
and zero `users/` Storage objects.

Firebase Hosting deployment is separate. A production cloud build may use:

```bash
cd design-lab/prototypes-vanilla
node --env-file=.env.cloud.local node_modules/vite/bin/vite.js build --mode cloud
cd ../../firebase
firebase deploy --project elsewhere-memory-tyx-2026 --only hosting
```

Hosting is intentionally not deployed yet. The production API currently exposes the reviewed ImportBatch write/receipt
boundary, not the demo snapshot and Else read model used by the visual prototype. Deploying the cloud-mode SPA now
would create a misleading partially live product. The Cloud Run ingestion chain is staging-verified; the Task 6
local-cloud browser gate remains the authoritative end-to-end recording path. No Gemini key is deployed to Cloud Run
because none of the three reviewed production composition roots consumes Gemini.
