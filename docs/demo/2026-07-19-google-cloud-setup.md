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

The local files are ignored by Git. The App Check debug token lives only in the backend cloud file and is injected only into the Vite development server; Vite production builds force it to `null`. Never commit Firebase Web API keys, App Check debug tokens, ADC files, Gemini keys, Document AI processor IDs, or billing data.

`ELSEWHERE_DOCUMENT_AI_DEMO_ALLOWED` defaults to `false`. Keep it false while testing Auth, App Check, Firestore, and Storage. Set it to `true` only for an explicitly authorized recording run: that enables the approved OCR worker to send the selected original receipt bytes to the fixed Document AI processor. The coordinator still rejects stale, unapproved, or already-terminal work; a supporting Fragment executes only when its current authoritative RoutePlan explicitly approves that capability.

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

Firebase Storage Rules read the owner-scoped ImportBatch in Firestore before accepting an original. The Firebase
Storage service agent therefore requires `roles/firebaserules.firestoreServiceAgent` on this project. The principal is:

```text
service-352557422052@gcp-sa-firebasestorage.iam.gserviceaccount.com
```

Do not grant this role to the similarly named Firebase Rules service agent; that principal does not authorize the
Storage Rules cross-service read.

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
- Storage Rules cross-service IAM: verified with one authenticated browser upload
- authoritative routing: policy/cost model v3; reliable time + location prevents redundant screenshot OCR
- real provider browser gate: passed on 2026-07-19 (`1 passed`, 8 uploads, exactly 1 persisted receipt OCR)
- Document AI: exactly one selected Common Grounds receipt returned persisted normalized text
- Gemini: exactly one evidence-scoped answer returned at least one reviewable source
- cleanup: test owner snapshot returned zero Fragments and zero ImportBatches before identity deletion
- `ELSEWHERE_DOCUMENT_AI_DEMO_ALLOWED`: restored to `false` after verification
