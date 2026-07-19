# Elsewhere Google Cloud Setup

## Fixed project

- Firebase / Google Cloud project: `elsewhere-memory-tyx-2026`
- Primary region: `asia-southeast1`
- Firebase Web App: `Elsewhere Web`
- Firestore mode: Native
- Storage: default Firebase bucket in Singapore
- Document AI: Enterprise OCR processor in Singapore

The Firebase project, Web App, and the mandatory cloud-backed recording resources are active.

## Local files

- Frontend cloud values: `design-lab/prototypes-vanilla/.env.cloud.local`
- Backend shared values and Gemini key: `services/backend/.env`
- Backend real Firebase / Document AI values: `services/backend/.env.cloud.local`
- Public frontend template: `design-lab/prototypes-vanilla/.env.cloud.example`
- Public backend template: `services/backend/.env.example`

The two local files are ignored by Git. Never commit Firebase Web API keys, App Check debug tokens, ADC files, Gemini keys, Document AI processor IDs, or billing data.

## Billing and cost guardrail

Cloud Billing is linked and the project is on Blaze. A project-filtered monthly budget alerts the default Billing IAM recipients at 50%, 90%, and 100% of 5 USD. Budget alerts are notifications, not a hard spending cap.

Billing can be reviewed at:

`https://console.cloud.google.com/billing/linkedaccount?project=elsewhere-memory-tyx-2026`

## Provisioning sequence

1. Enable only the APIs named in the approved expansion design and their direct App Check / budget dependencies.
2. Create Firestore Native and the default Storage bucket in `asia-southeast1`.
3. Initialize Firebase Authentication and enable only Anonymous Authentication.
4. Register App Check with a reCAPTCHA Enterprise score key restricted to the two Firebase Hosting domains.
5. Register one localhost debug token without adding `localhost` to the reCAPTCHA domain allowlist.
6. Create one Enterprise OCR processor in `asia-southeast1` and use its exact Google Stable version.
7. Record only the processor project, location, ID, version, and endpoint in `services/backend/.env.cloud.local`.
8. Keep Cloud Run, Cloud Tasks, Eventarc, and provider smoke tests disabled until the cloud-backed local gate is green.

## Current verification

- Firebase project: active
- Firebase Web App: active
- gcloud CLI: installed
- gcloud user login and ADC: configured
- default gcloud project: `elsewhere-memory-tyx-2026`
- default region: `asia-southeast1`
- Cloud Billing / Blaze: linked
- budget guardrail: 5 USD per month, project-filtered, 50% / 90% / 100% alerts
- Anonymous Auth: enabled and verified with a create-and-delete smoke user
- Firestore: Native / Standard in `asia-southeast1`, PITR off, deletion protection on
- Storage: Firebase default bucket in `asia-southeast1`, rules deployed
- App Check: reCAPTCHA Enterprise, one-hour token TTL, one registered localhost debug token
- Document AI: `OCR_PROCESSOR` enabled in `asia-southeast1`
- Document AI version: `pretrained-ocr-v1.0-2020-09-23` (`stable` in this region)
- provider document processing: not invoked during provisioning
