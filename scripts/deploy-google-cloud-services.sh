#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_ID="${PROJECT_ID:-elsewhere-memory-tyx-2026}"
PROJECT_NUMBER="${PROJECT_NUMBER:-352557422052}"
REGION="${REGION:-asia-southeast1}"
REPOSITORY="${REPOSITORY:-elsewhere-backend}"
QUEUE="${QUEUE:-elsewhere-ocr}"
API_SERVICE="${API_SERVICE:-elsewhere-api}"
INGESTION_SERVICE="${INGESTION_SERVICE:-elsewhere-ingestion}"
WORKER_SERVICE="${WORKER_SERVICE:-elsewhere-capability-worker}"
TRIGGER="${TRIGGER:-elsewhere-original-finalized}"
CLOUD_ENV_FILE="${CLOUD_ENV_FILE:-${ROOT}/services/backend/.env.cloud.local}"
IMAGE_TAG="${IMAGE_TAG:-$(git -C "${ROOT}" rev-parse --short HEAD)}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/elsewhere-backend:${IMAGE_TAG}"

API_ACCOUNT="elsewhere-api-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
INGESTION_ACCOUNT="elsewhere-ingestion-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
WORKER_ACCOUNT="elsewhere-worker-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
EVENTARC_ACCOUNT="elsewhere-eventarc-invoker@${PROJECT_ID}.iam.gserviceaccount.com"
TASK_ACCOUNT="elsewhere-task-invoker@${PROJECT_ID}.iam.gserviceaccount.com"

if [[ ! -f "${CLOUD_ENV_FILE}" ]]; then
  echo "Missing ignored cloud environment file: ${CLOUD_ENV_FILE}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${CLOUD_ENV_FILE}"
set +a

required=(
  FIREBASE_PROJECT_ID
  ELSEWHERE_ALLOWED_APP_IDS
  ELSEWHERE_STORAGE_BUCKETS
  OCR_PROVIDER_VERSION
  DOCUMENT_AI_PROJECT_ID
  DOCUMENT_AI_LOCATION
  DOCUMENT_AI_PROCESSOR_ID
  DOCUMENT_AI_PROCESSOR_VERSION
  DOCUMENT_AI_ENDPOINT
)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required cloud value: ${name}" >&2
    exit 1
  fi
done

if [[ "${FIREBASE_PROJECT_ID}" != "${PROJECT_ID}"
  || "${DOCUMENT_AI_PROJECT_ID}" != "${PROJECT_ID}"
  || "${DOCUMENT_AI_LOCATION}" != "${REGION}"
  || "${DOCUMENT_AI_PROCESSOR_VERSION}" != "${OCR_PROVIDER_VERSION}" ]]; then
  echo "Cloud environment does not match the frozen deployment boundary" >&2
  exit 1
fi

if [[ "${1:-}" == "--plan" ]]; then
  printf '%s\n' \
    "project=${PROJECT_ID}" \
    "region=${REGION}" \
    "image=${IMAGE}" \
    "services=${API_SERVICE},${INGESTION_SERVICE},${WORKER_SERVICE}" \
    "queue=${QUEUE}" \
    "trigger=${TRIGGER}" \
    "bucket=${ELSEWHERE_STORAGE_BUCKETS}"
  exit 0
fi

ensure_service_account() {
  local account="$1"
  local display_name="$2"
  if ! gcloud iam service-accounts describe "${account}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
    gcloud iam service-accounts create "${account%%@*}" \
      --project="${PROJECT_ID}" \
      --display-name="${display_name}"
  fi
}

grant_project_role() {
  local member="$1"
  local role="$2"
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="${member}" \
    --role="${role}" \
    --condition=None \
    --quiet >/dev/null
}

grant_bucket_role() {
  local member="$1"
  local role="$2"
  gcloud storage buckets add-iam-policy-binding "gs://${ELSEWHERE_STORAGE_BUCKETS}" \
    --member="${member}" \
    --role="${role}" \
    --condition=None \
    --quiet >/dev/null
}

gcloud services enable \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  cloudtasks.googleapis.com \
  eventarc.googleapis.com \
  pubsub.googleapis.com \
  documentai.googleapis.com \
  aiplatform.googleapis.com \
  --project="${PROJECT_ID}" \
  --quiet

STORAGE_AGENT="$(gcloud storage service-agent --project="${PROJECT_ID}" | tr -d '[:space:]')"
if [[ "${STORAGE_AGENT}" != "service-${PROJECT_NUMBER}@gs-project-accounts.iam.gserviceaccount.com" ]]; then
  echo "Unexpected Cloud Storage service agent: ${STORAGE_AGENT}" >&2
  exit 1
fi

ensure_service_account "${API_ACCOUNT}" "Elsewhere API runtime"
ensure_service_account "${INGESTION_ACCOUNT}" "Elsewhere ingestion runtime"
ensure_service_account "${WORKER_ACCOUNT}" "Elsewhere capability worker runtime"
ensure_service_account "${EVENTARC_ACCOUNT}" "Elsewhere Eventarc invoker"
ensure_service_account "${TASK_ACCOUNT}" "Elsewhere Cloud Tasks invoker"

grant_project_role "serviceAccount:${API_ACCOUNT}" roles/datastore.user
grant_project_role "serviceAccount:${API_ACCOUNT}" roles/aiplatform.user
grant_project_role "serviceAccount:${INGESTION_ACCOUNT}" roles/datastore.user
grant_project_role "serviceAccount:${WORKER_ACCOUNT}" roles/datastore.user
grant_project_role "serviceAccount:${WORKER_ACCOUNT}" roles/documentai.apiUser
grant_project_role "serviceAccount:${EVENTARC_ACCOUNT}" roles/eventarc.eventReceiver
grant_project_role "serviceAccount:${STORAGE_AGENT}" roles/pubsub.publisher
grant_bucket_role "serviceAccount:${INGESTION_ACCOUNT}" roles/storage.objectViewer
grant_bucket_role "serviceAccount:${INGESTION_ACCOUNT}" roles/storage.objectCreator
grant_bucket_role "serviceAccount:${WORKER_ACCOUNT}" roles/storage.objectViewer
grant_bucket_role "serviceAccount:${WORKER_ACCOUNT}" roles/storage.objectCreator

gcloud iam service-accounts add-iam-policy-binding "${TASK_ACCOUNT}" \
  --project="${PROJECT_ID}" \
  --member="serviceAccount:${INGESTION_ACCOUNT}" \
  --role=roles/iam.serviceAccountUser \
  --condition=None \
  --quiet >/dev/null

if ! gcloud artifacts repositories describe "${REPOSITORY}" \
  --project="${PROJECT_ID}" --location="${REGION}" >/dev/null 2>&1; then
  gcloud artifacts repositories create "${REPOSITORY}" \
    --project="${PROJECT_ID}" \
    --location="${REGION}" \
    --repository-format=docker \
    --description="Elsewhere shared backend image"
fi

if ! gcloud tasks queues describe "${QUEUE}" \
  --project="${PROJECT_ID}" --location="${REGION}" >/dev/null 2>&1; then
  gcloud tasks queues create "${QUEUE}" \
    --project="${PROJECT_ID}" \
    --location="${REGION}" \
    --max-dispatches-per-second=2 \
    --max-concurrent-dispatches=2
fi

gcloud builds submit "${ROOT}" \
  --project="${PROJECT_ID}" \
  --config="${ROOT}/cloudbuild.yaml" \
  --substitutions="_IMAGE=${IMAGE}" \
  --quiet

COMMON_ENV="NODE_ENV=production,HOST=0.0.0.0,FIREBASE_PROJECT_ID=${PROJECT_ID},ELSEWHERE_STORAGE_BUCKETS=${ELSEWHERE_STORAGE_BUCKETS},CAPABILITY_EXECUTION_MODE=google,OCR_PROVIDER_VERSION=${OCR_PROVIDER_VERSION}"

gcloud run deploy "${WORKER_SERVICE}" \
  --project="${PROJECT_ID}" --region="${REGION}" --image="${IMAGE}" \
  --service-account="${WORKER_ACCOUNT}" --no-allow-unauthenticated \
  --min=0 --max=2 --concurrency=1 --cpu=1 --memory=1Gi --timeout=300 \
  --set-env-vars="${COMMON_ENV},ELSEWHERE_SERVICE_MODE=capability-worker,CLOUD_TASKS_ENABLED=false,DOCUMENT_AI_ENABLED=true,DOCUMENT_AI_PROJECT_ID=${DOCUMENT_AI_PROJECT_ID},DOCUMENT_AI_LOCATION=${DOCUMENT_AI_LOCATION},DOCUMENT_AI_PROCESSOR_ID=${DOCUMENT_AI_PROCESSOR_ID},DOCUMENT_AI_PROCESSOR_VERSION=${DOCUMENT_AI_PROCESSOR_VERSION},DOCUMENT_AI_ENDPOINT=${DOCUMENT_AI_ENDPOINT}" \
  --quiet

WORKER_URL="$(gcloud run services describe "${WORKER_SERVICE}" \
  --project="${PROJECT_ID}" --region="${REGION}" --format='value(status.url)')"

gcloud run deploy "${INGESTION_SERVICE}" \
  --project="${PROJECT_ID}" --region="${REGION}" --image="${IMAGE}" \
  --service-account="${INGESTION_ACCOUNT}" --no-allow-unauthenticated \
  --min=0 --max=2 --concurrency=4 --cpu=1 --memory=1Gi --timeout=300 \
  --set-env-vars="${COMMON_ENV},ELSEWHERE_SERVICE_MODE=ingestion,CLOUD_TASKS_ENABLED=true,CLOUD_TASKS_PROJECT_ID=${PROJECT_ID},CLOUD_TASKS_LOCATION=${REGION},OCR_TASK_QUEUE=${QUEUE},OCR_WORKER_URL=${WORKER_URL}/internal/capabilities/ocr,OCR_WORKER_AUDIENCE=${WORKER_URL},OCR_TASK_SERVICE_ACCOUNT=${TASK_ACCOUNT},DOCUMENT_AI_ENABLED=false" \
  --quiet

gcloud run deploy "${API_SERVICE}" \
  --project="${PROJECT_ID}" --region="${REGION}" --image="${IMAGE}" \
  --service-account="${API_ACCOUNT}" --allow-unauthenticated \
  --min=0 --max=3 --concurrency=20 --cpu=1 --memory=512Mi --timeout=60 \
  --set-env-vars="NODE_ENV=production,HOST=0.0.0.0,FIREBASE_PROJECT_ID=${PROJECT_ID},ELSEWHERE_ALLOWED_APP_IDS=${ELSEWHERE_ALLOWED_APP_IDS},CAPABILITY_EXECUTION_MODE=fake,CLOUD_TASKS_ENABLED=false,DOCUMENT_AI_ENABLED=false,ELSE_QUERY_ENABLED=true,GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GOOGLE_CLOUD_LOCATION=global,ELSE_MODEL_FAST=gemini-2.5-flash,ELSE_QUERY_OWNER_DAILY_LIMIT=10,ELSE_QUERY_PROJECT_DAILY_LIMIT=100" \
  --quiet

gcloud run services add-iam-policy-binding "${INGESTION_SERVICE}" \
  --project="${PROJECT_ID}" --region="${REGION}" \
  --member="serviceAccount:${EVENTARC_ACCOUNT}" --role=roles/run.invoker --quiet >/dev/null
gcloud run services add-iam-policy-binding "${WORKER_SERVICE}" \
  --project="${PROJECT_ID}" --region="${REGION}" \
  --member="serviceAccount:${TASK_ACCOUNT}" --role=roles/run.invoker --quiet >/dev/null

gcloud tasks queues add-iam-policy-binding "${QUEUE}" \
  --project="${PROJECT_ID}" --location="${REGION}" \
  --member="serviceAccount:${INGESTION_ACCOUNT}" --role=roles/cloudtasks.enqueuer \
  --quiet >/dev/null

if ! gcloud eventarc triggers describe "${TRIGGER}" \
  --project="${PROJECT_ID}" --location="${REGION}" >/dev/null 2>&1; then
  for attempt in 1 2 3 4 5; do
    if gcloud eventarc triggers create "${TRIGGER}" \
      --project="${PROJECT_ID}" \
      --location="${REGION}" \
      --destination-run-service="${INGESTION_SERVICE}" \
      --destination-run-region="${REGION}" \
      --destination-run-path=/events/storage-finalized \
      --event-filters=type=google.cloud.storage.object.v1.finalized \
      --event-filters="bucket=${ELSEWHERE_STORAGE_BUCKETS}" \
      --service-account="${EVENTARC_ACCOUNT}" \
      --quiet; then
      break
    fi
    if [[ "${attempt}" == 5 ]]; then
      exit 1
    fi
    sleep 15
  done
fi

API_URL="$(gcloud run services describe "${API_SERVICE}" \
  --project="${PROJECT_ID}" --region="${REGION}" --format='value(status.url)')"
INGESTION_URL="$(gcloud run services describe "${INGESTION_SERVICE}" \
  --project="${PROJECT_ID}" --region="${REGION}" --format='value(status.url)')"

printf '%s\n' \
  "api=${API_URL}" \
  "ingestion=${INGESTION_URL}" \
  "worker=${WORKER_URL}" \
  "image=${IMAGE}" \
  "queue=${QUEUE}" \
  "trigger=${TRIGGER}"
