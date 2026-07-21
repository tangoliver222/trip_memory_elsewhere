import { readFile, stat } from 'node:fs/promises';

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

const projectId = required('VITE_FIREBASE_PROJECT_ID');
const projectNumber = required('VITE_FIREBASE_MESSAGING_SENDER_ID');
const apiKey = required('VITE_FIREBASE_API_KEY');
const appId = required('VITE_FIREBASE_APP_ID');
const bucket = required('VITE_FIREBASE_STORAGE_BUCKET');
const debugToken = required('ELSEWHERE_APP_CHECK_DEBUG_TOKEN');
const apiBaseUrl = process.env.ELSEWHERE_LIVE_URL?.trim()
  || `https://${projectId}.web.app`;
const samplePath = new URL(
  '../design-lab/prototypes-vanilla/public/assets/bangkok-photo-01-ari-morning.jpg',
  import.meta.url,
);

async function jsonRequest(url, init = {}) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${init.method || 'GET'} ${new URL(url).pathname} failed (${response.status}): ${payload?.error?.code || 'unknown'}`);
  }
  return payload;
}

const appCheck = await jsonRequest(
  `https://firebaseappcheck.googleapis.com/v1/projects/${projectNumber}/apps/${encodeURIComponent(appId)}:exchangeDebugToken?key=${encodeURIComponent(apiKey)}`,
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ debug_token: debugToken }),
  },
);
const identity = await jsonRequest(
  `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`,
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  },
);
const authenticatedHeaders = Object.freeze({
  authorization: `Bearer ${identity.idToken}`,
  'content-type': 'application/json',
  'x-firebase-appcheck': appCheck.token,
});
const api = (path, init = {}) => jsonRequest(`${apiBaseUrl}${path}`, {
  ...init,
  headers: { ...authenticatedHeaders, ...(init.headers || {}) },
});

await api('/v1/experience/settings/appLock', {
  method: 'PUT',
  body: JSON.stringify({ value: true }),
});
const settingSnapshot = await api('/v1/experience-snapshot');
if (settingSnapshot.userState?.settings?.appLock !== true) {
  throw new Error('Firestore setting did not persist for the verified owner');
}

const [sampleBytes, sampleFacts] = await Promise.all([readFile(samplePath), stat(samplePath)]);
const created = await api('/v1/import-batches', {
  method: 'POST',
  body: JSON.stringify({
    items: [{
      sourceType: 'photo',
      declaredContentType: 'image/jpeg',
      declaredSizeBytes: sampleBytes.byteLength,
      source: {
        schemaVersion: 1,
        provider: 'local_file',
        importMethod: 'file_picker',
        providerItemId: null,
        originalName: 'bangkok-photo-01-ari-morning.jpg',
        sourceCreatedAt: '2024-10-12T08:17:00+07:00',
        sourceModifiedAt: sampleFacts.mtime.toISOString(),
        timezoneOffsetMinutes: 420,
        locationHint: {
          lat: 13.7791,
          lng: 100.5443,
          accuracyMeters: 25,
          source: 'user_supplied',
        },
        media: null,
        providerMetadata: {},
      },
    }],
  }),
});
const upload = created.uploads?.[0];
if (!upload?.originalPath || !upload?.fragmentId || !created.batch?.id) {
  throw new Error('Import API did not return a bounded upload manifest');
}

const storageResponse = await fetch(
  `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o?name=${encodeURIComponent(upload.originalPath)}`,
  {
    method: 'POST',
    headers: {
      authorization: `Firebase ${identity.idToken}`,
      'content-type': 'image/jpeg',
      'x-firebase-appcheck': appCheck.token,
    },
    body: sampleBytes,
  },
);
if (!storageResponse.ok) {
  throw new Error(`Firebase Storage upload failed (${storageResponse.status})`);
}

let receipt = null;
for (let attempt = 0; attempt < 120; attempt += 1) {
  receipt = await api(`/v1/import-batches/${encodeURIComponent(created.batch.id)}`);
  const item = receipt.items?.find(({ fragmentId }) => fragmentId === upload.fragmentId);
  if (item?.state === 'finalized') break;
  if (item?.state === 'failed') throw new Error('Ingestion marked the uploaded original as failed');
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}
const finalizedItem = receipt?.items?.find(({ fragmentId }) => fragmentId === upload.fragmentId);
if (finalizedItem?.state !== 'finalized') throw new Error('Ingestion did not finalize within 120 seconds');

const memorySnapshot = await api('/v1/experience-snapshot');
if (!memorySnapshot.fragments?.some(({ id }) => id === upload.fragmentId)) {
  throw new Error('Finalized original is absent from the owner experience snapshot');
}
const answer = await api('/v1/else/ask', {
  method: 'POST',
  body: JSON.stringify({
    question: '我刚放入的旅行原件是什么？只根据来源回答。',
    scope: { type: 'world' },
  }),
});
if (!['found', 'uncertain'].includes(answer.state) || !Array.isArray(answer.sources)) {
  throw new Error('Else did not return the stable evidence-first answer contract');
}

console.log(JSON.stringify({
  auth: 'anonymous-owner-verified',
  appCheck: 'verified',
  settingPersisted: true,
  storageUpload: 'complete',
  ingestion: finalizedItem.state,
  fragmentCount: memorySnapshot.world?.totalFragments ?? null,
  elseState: answer.state,
  elseSourceCount: answer.sources.length,
}, null, 2));
