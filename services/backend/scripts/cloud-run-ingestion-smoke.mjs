import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { deleteApp } from 'firebase-admin/app';
import { createFirebaseAdmin } from '../src/adapters/firebase.js';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(backend, '../..');
const frontend = path.join(root, 'design-lab/prototypes-vanilla');
const receiptPath = path.join(frontend, 'public/assets/common-grounds-receipt.png');
const frontendEnvironment = path.join(frontend, '.env.cloud.local');
const apiUrl = 'https://elsewhere-api-n5rt3icpkq-as.a.run.app';
const port = 4176;

for (const file of [path.join(backend, '.env.cloud.local'), frontendEnvironment]) {
  process.loadEnvFile(file);
}

if (process.env.RUN_REAL_GOOGLE_PROVIDER_TESTS !== 'true') {
  throw new Error('Set RUN_REAL_GOOGLE_PROVIDER_TESTS=true to permit production Google provider tests.');
}

const required = (name) => {
  const value = process.env[name];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`);
  return value;
};

const firebase = Object.freeze({
  apiKey: required('VITE_FIREBASE_API_KEY'),
  authDomain: required('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: required('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: required('VITE_FIREBASE_STORAGE_BUCKET'),
  appId: required('VITE_FIREBASE_APP_ID'),
  messagingSenderId: required('VITE_FIREBASE_MESSAGING_SENDER_ID'),
});
const siteKey = required('VITE_FIREBASE_APP_CHECK_SITE_KEY');
const debugToken = required('ELSEWHERE_APP_CHECK_DEBUG_TOKEN');
const requireFromFrontend = createRequire(path.join(frontend, 'package.json'));
const { chromium } = requireFromFrontend('playwright');

function waitForPort(child, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const onExit = (code, signal) => reject(new Error(
      `Vite exited before port ${port} was ready (${code ?? signal}).`,
    ));
    child.once('exit', onExit);
    const attempt = () => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => {
        socket.destroy();
        child.off('exit', onExit);
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() >= deadline) reject(new Error(`Timed out waiting for port ${port}.`));
        else setTimeout(attempt, 300);
      });
    };
    attempt();
  });
}

async function pollCapabilityResult(db, uid, batchId, timeoutMs = 240_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [batchSnapshot, resultSnapshot] = await Promise.all([
      db.doc(`users/${uid}/importBatches/${batchId}`).get(),
      db.collection(`users/${uid}/capabilityResults`).get(),
    ]);
    const completed = resultSnapshot.docs
      .map((snapshot) => snapshot.data())
      .find((result) => result.outcome === 'completed');
    if (completed && batchSnapshot.data()?.capabilitySummary?.completed === 1) {
      return { batch: batchSnapshot.data(), result: completed };
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error('Timed out waiting for Eventarc, Cloud Tasks, and Document AI.');
}

const vite = spawn('npm', ['run', 'dev', '--', '--mode', 'cloud', '--port', String(port)], {
  cwd: frontend,
  env: {
    ...process.env,
    ELSEWHERE_APP_CHECK_DEBUG_TOKEN: debugToken,
    ELSEWHERE_API_PROXY_TARGET: apiUrl,
    VITE_ELSEWHERE_API_BASE_URL: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let browser;
let admin;
let uid;

try {
  await waitForPort(vite);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/src/data/demo-client.js`);
  const receipt = await readFile(receiptPath);
  uid = await page.evaluate(async ({ appCheck, clientFirebase }) => {
    const { createDemoClient, demoClientConfigFromEnv } = await import('/src/data/demo-client.js');
    globalThis.__elsewhereCloudRunSmokeClient = createDemoClient(demoClientConfigFromEnv({
      VITE_ELSEWHERE_INFRA_MODE: 'cloud',
      VITE_ELSEWHERE_API_BASE_URL: '',
      VITE_FIREBASE_API_KEY: clientFirebase.apiKey,
      VITE_FIREBASE_AUTH_DOMAIN: clientFirebase.authDomain,
      VITE_FIREBASE_PROJECT_ID: clientFirebase.projectId,
      VITE_FIREBASE_STORAGE_BUCKET: clientFirebase.storageBucket,
      VITE_FIREBASE_APP_ID: clientFirebase.appId,
      VITE_FIREBASE_MESSAGING_SENDER_ID: clientFirebase.messagingSenderId,
      VITE_FIREBASE_APP_CHECK_SITE_KEY: appCheck.siteKey,
      ELSEWHERE_APP_CHECK_DEBUG_TOKEN: appCheck.debugToken,
    }));
    const user = await globalThis.__elsewhereCloudRunSmokeClient.signIn();
    return user.uid;
  }, {
    appCheck: { siteKey, debugToken },
    clientFirebase: firebase,
  });
  admin = createFirebaseAdmin({
    projectId: firebase.projectId,
    appName: `cloud-run-smoke-${Date.now()}`,
  });

  const created = await page.evaluate(async ({ bytes }) => {
    const binary = atob(bytes);
    const content = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const file = new File([content], 'COMMON-GROUNDS-receipt-2024-10-19.png', {
      type: 'image/png',
      lastModified: Date.parse('2024-10-19T08:29:00+07:00'),
    });
    const response = await globalThis.__elsewhereCloudRunSmokeClient.createImportBatch([{
      sourceType: 'receipt',
      declaredContentType: file.type,
      declaredSizeBytes: file.size,
      source: {
        schemaVersion: 1,
        provider: 'local_file',
        importMethod: 'file_picker',
        providerItemId: null,
        originalName: file.name,
        sourceCreatedAt: '2024-10-19T08:29:00+07:00',
        sourceModifiedAt: new Date(file.lastModified).toISOString(),
        timezoneOffsetMinutes: 420,
        locationHint: {
          lat: 13.77908,
          lng: 100.54429,
          accuracyMeters: 8,
          source: 'user_supplied',
        },
        media: null,
        providerMetadata: {},
      },
    }]);
    await globalThis.__elsewhereCloudRunSmokeClient.uploadOriginal(response.uploads[0], file);
    return {
      batchId: response.batch.id,
      fragmentId: response.uploads[0].fragmentId,
    };
  }, {
    bytes: receipt.toString('base64'),
  });
  const verified = await pollCapabilityResult(admin.db, uid, created.batchId);
  if (verified.result.fragmentRef?.id !== created.fragmentId
    || verified.result.capability !== 'ocr'
    || verified.result.providerName !== 'document-ai-enterprise-ocr'
    || verified.result.requestCount !== 1
    || verified.batch.uploadStatus !== 'complete') {
    throw new Error('Persisted production capability result is invalid.');
  }
  const memory = await page.evaluate(() => (
    globalThis.__elsewhereCloudRunSmokeClient.getMemorySnapshot()
  ));
  const projected = memory.fragments?.find(({ id }) => id === created.fragmentId);
  if (!projected
    || memory.summary?.totalFragments !== 1
    || memory.summary?.totalImportBatches !== 1
    || projected.original?.storagePath
      !== `users/${uid}/originals/${created.batchId}/${created.fragmentId}`
    || JSON.stringify(memory).includes('crc32c')
    || JSON.stringify(memory).includes('hashes')) {
    throw new Error('Production memory snapshot is invalid.');
  }
  const utcDay = new Date().toISOString().slice(0, 10);
  const projectBudgetRef = admin.db.doc(`elseQueryBudgets/${utcDay}`);
  const projectBudgetBefore = await projectBudgetRef.get();
  const projectUsedBefore = projectBudgetBefore.exists ? projectBudgetBefore.data().used : 0;
  const elseAnswer = await page.evaluate(() => (
    globalThis.__elsewhereCloudRunSmokeClient.askProductionElse(
      '我刚上传的原件叫什么？',
      { type: 'world' },
    )
  ));
  const memorySourceIds = new Set(memory.fragments.map(({ id }) => id));
  if (elseAnswer.status !== 'completed'
    || elseAnswer.sources.length < 1
    || elseAnswer.sources.some(({ fragmentId }) => !memorySourceIds.has(fragmentId))) {
    throw new Error('Production Vertex Else answer is not bound to owner evidence.');
  }
  const [ownerBudget, projectBudgetAfter] = await Promise.all([
    admin.db.doc(`users/${uid}/elseQueryBudgets/${utcDay}`).get(),
    projectBudgetRef.get(),
  ]);
  if (ownerBudget.data()?.used !== 1
    || projectBudgetAfter.data()?.used !== projectUsedBefore + 1
    || JSON.stringify(ownerBudget.data()).includes('question')
    || JSON.stringify(projectBudgetAfter.data()).includes('source')) {
    throw new Error('Production Else budget ledger is invalid.');
  }

  console.log('cloud-run-ingestion-smoke: PASS');
  console.log('authenticated_api=passed');
  console.log('owner_memory_snapshot=passed');
  console.log('storage_eventarc_routing_tasks=passed');
  console.log('document_ai_result=completed');
  console.log('vertex_else_answer=sourced');
  console.log('else_query_budget=passed');
} finally {
  let cleanupError = null;
  if (admin && uid) {
    try {
      await Promise.all([
        admin.storage.bucket(firebase.storageBucket).deleteFiles({ prefix: `users/${uid}/` }),
        admin.db.recursiveDelete(admin.db.doc(`users/${uid}`)),
        admin.auth.deleteUser(uid),
      ]);
      const [owner, files] = await Promise.all([
        admin.db.doc(`users/${uid}`).get(),
        admin.storage.bucket(firebase.storageBucket).getFiles({ prefix: `users/${uid}/` }),
      ]);
      let authDeleted = false;
      try {
        await admin.auth.getUser(uid);
      } catch (error) {
        authDeleted = error?.code === 'auth/user-not-found';
      }
      if (owner.exists || files[0].length !== 0 || !authDeleted) {
        throw new Error('Production smoke owner cleanup is incomplete.');
      }
      console.log('test_owner_cleanup=passed');
    } catch (error) {
      cleanupError = error;
    }
  }
  await browser?.close().catch(() => {});
  if (admin) await deleteApp(admin.app).catch(() => {});
  if (vite.exitCode === null) vite.kill('SIGTERM');
  if (cleanupError) throw cleanupError;
}
