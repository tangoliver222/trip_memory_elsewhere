import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cities,
  fragments,
  importBatches,
  world,
} from '../../src/fixtures/data.js';
import { createSemanticTarget } from '../../src/visual/particle-targets.js';
import { renderRoute } from '../../src/pages/render-route.js';
import { createInitialState } from '../../src/store.js';
import { hydrateLiveCollections } from '../../src/data/live-hydrator.js';
import { renderFragmentLens } from '../../src/overlays/fragment-lens.js';
import { getFragmentContext } from '../../src/selectors.js';
import {
  createDemoClient,
  demoClientConfigFromEnv,
} from '../../src/data/demo-client.js';
import {
  bootstrapLiveData,
  runtimeState,
} from '../../src/data/runtime.js';

const cloudEnvironment = Object.freeze({
  VITE_ELSEWHERE_INFRA_MODE: 'cloud',
  VITE_ELSEWHERE_API_BASE_URL: 'http://127.0.0.1:8787',
  VITE_FIREBASE_API_KEY: 'cloud-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'elsewhere-memory-tyx-2026.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'elsewhere-memory-tyx-2026',
  VITE_FIREBASE_STORAGE_BUCKET: 'elsewhere-memory-tyx-2026.firebasestorage.app',
  VITE_FIREBASE_APP_ID: 'cloud-web-app-id',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '352557422052',
  VITE_FIREBASE_APP_CHECK_SITE_KEY: 'recaptcha-enterprise-site-key',
});

function snapshotWith(ids) {
  const projectedFragments = ids.map((id, index) => ({
    id,
    ownerId: 'user_demo',
    batchId: 'batch_demo0001',
    type: index === ids.length - 1 ? 'receipt' : 'photo',
    status: index === ids.length - 1 ? 'unresolved' : 'placed',
    originalName: `${id}.jpg`,
    originalPath: `users/user_demo/originals/batch_demo0001/${id}`,
    thumbnailPath: `users/user_demo/derived/${id}/thumbnail.webp`,
    capturedAt: `2024-10-${String(index + 12).padStart(2, '0')}T01:20:00.000Z`,
    localDate: `2024-10-${String(index + 12).padStart(2, '0')}`,
    geo: { lat: 13.7791, lng: 100.5443 },
    placeId: 'place-common-grounds',
    placeName: 'Common Grounds',
    placeDistanceMeters: 2,
    cityId: 'city-bangkok',
    sourceIds: [id],
  }));
  return {
    ownerId: 'user_demo',
    revision: `revision-${ids.length}`,
    world: {
      totalFragments: ids.length,
      totalCities: ids.length > 0 ? 1 : 0,
      totalPlaces: ids.length > 0 ? 1 : 0,
      placedFragments: ids.length,
      unplacedFragments: 0,
      sourceIds: ids,
    },
    cities: ids.length > 0 ? [{
      id: 'city-bangkok',
      name: 'Bangkok',
      country: 'Thailand',
      fragmentCount: ids.length,
      placeCount: 1,
      sourceIds: ids,
    }] : [],
    fragments: projectedFragments,
    importBatches: [],
    places: ids.length > 0 ? [{
      id: 'place-common-grounds',
      name: 'Common Grounds',
      area: 'Ari',
      lat: 13.7791,
      lng: 100.5443,
      cityId: 'city-bangkok',
      fragmentCount: ids.length,
      sourceIds: ids,
    }] : [],
    visits: ids.map((id, index) => ({
      id: `visit-${index}`,
      placeId: 'place-common-grounds',
      placeName: 'Common Grounds',
      startedAt: projectedFragments[index].capturedAt,
      endedAt: projectedFragments[index].capturedAt,
      fragmentCount: 1,
      sourceIds: [id],
    })),
    connections: [],
    inboxItems: [],
    discoveries: [],
  };
}

test('live mode never silently returns fixture data after a failed bootstrap', async () => {
  await assert.rejects(() => bootstrapLiveData({
    fetchSnapshot: async () => { throw new Error('offline'); },
  }), /offline/);

  assert.equal(runtimeState.status, 'error');
  assert.equal(runtimeState.snapshot, null);
});

test('Firebase infrastructure defaults to the existing Emulator configuration', () => {
  const config = demoClientConfigFromEnv({});

  assert.equal(config.infrastructureMode, 'emulator');
  assert.equal(config.authEmulatorUrl, 'http://127.0.0.1:9099');
  assert.equal(config.storageEmulator, '127.0.0.1:9199');
  assert.equal(config.firebase.projectId, 'demo-elsewhere');
  assert.equal(config.appCheck, null);
});

test('cloud Firebase configuration is strict and contains no Emulator addresses', () => {
  const config = demoClientConfigFromEnv(cloudEnvironment);

  assert.equal(config.infrastructureMode, 'cloud');
  assert.equal(config.authEmulatorUrl, null);
  assert.equal(config.storageEmulator, null);
  assert.equal(config.firebase.messagingSenderId, '352557422052');
  assert.deepEqual(config.appCheck, {
    siteKey: 'recaptcha-enterprise-site-key',
    debugToken: null,
  });

  const required = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_APP_ID',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_CHECK_SITE_KEY',
  ];
  for (const field of required) {
    const missing = { ...cloudEnvironment };
    delete missing[field];
    assert.throws(() => demoClientConfigFromEnv(missing), new RegExp(field));
  }
  assert.throws(() => demoClientConfigFromEnv({
    VITE_ELSEWHERE_INFRA_MODE: 'automatic',
  }), /VITE_ELSEWHERE_INFRA_MODE/);
});

test('cloud requests use App Check without connecting either Firebase Emulator', async () => {
  const calls = [];
  const client = createDemoClient(demoClientConfigFromEnv({
    ...cloudEnvironment,
    ELSEWHERE_APP_CHECK_DEBUG_TOKEN: 'local-debug-token',
  }), {
    connectAuthEmulatorFn() { calls.push('auth-emulator'); },
    connectStorageEmulatorFn() { calls.push('storage-emulator'); },
    appCheckFactory({ siteKey, debugToken }) {
      calls.push(['app-check', siteKey, debugToken]);
      return Object.freeze({ getToken: async () => 'verified-app-check-token' });
    },
    signInAnonymouslyFn: async () => ({
      user: Object.freeze({ getIdToken: async () => 'firebase-id-token' }),
    }),
    fetchFn: async (_url, init) => {
      calls.push(['request', init.headers]);
      return Object.freeze({
        ok: true,
        status: 200,
        json: async () => ({ revision: 'cloud-revision' }),
      });
    },
  });

  await client.getSnapshot();

  assert.equal(calls.includes('auth-emulator'), false);
  assert.equal(calls.includes('storage-emulator'), false);
  assert.deepEqual(calls[0], [
    'app-check',
    'recaptcha-enterprise-site-key',
    'local-debug-token',
  ]);
  const request = calls.find(([name]) => name === 'request');
  assert.equal(request[1]['x-firebase-appcheck'], 'verified-app-check-token');
  assert.notEqual(request[1]['x-firebase-appcheck'], 'local-demo-app-check');
});

test('demo client deletes the signed-in test identity after owner data is cleared', async () => {
  const user = Object.freeze({ getIdToken: async () => 'firebase-id-token' });
  const deleted = [];
  const client = createDemoClient(demoClientConfigFromEnv(cloudEnvironment), {
    appCheckFactory: () => Object.freeze({ getToken: async () => 'app-check-token' }),
    signInAnonymouslyFn: async () => ({ user }),
    deleteUserFn: async (value) => { deleted.push(value); },
  });

  await client.deleteIdentity();

  assert.deepEqual(deleted, [user]);
});

test('cloud upload completion polls the authoritative receipt and never calls demo finalize', async () => {
  const requests = [];
  const waits = [];
  const receipts = [
    { items: [{ fragmentId: 'frag_cloud01', state: 'pending' }] },
    { items: [{ fragmentId: 'frag_cloud01', state: 'finalized' }] },
  ];
  const client = createDemoClient(demoClientConfigFromEnv(cloudEnvironment), {
    appCheckFactory: () => Object.freeze({ getToken: async () => 'app-check-token' }),
    signInAnonymouslyFn: async () => ({
      user: Object.freeze({ getIdToken: async () => 'firebase-id-token' }),
    }),
    waitFn: async (milliseconds) => { waits.push(milliseconds); },
    fetchFn: async (url, init) => {
      requests.push([url, init.method]);
      return Object.freeze({
        ok: true,
        status: 200,
        json: async () => receipts.shift(),
      });
    },
  });

  await client.finalizeUpload('batch_cloud01', 'frag_cloud01');

  assert.deepEqual(requests, [
    ['http://127.0.0.1:8787/v1/import-batches/batch_cloud01', 'GET'],
    ['http://127.0.0.1:8787/v1/import-batches/batch_cloud01', 'GET'],
  ]);
  assert.deepEqual(waits, [500]);
});

test('cloud snapshot waits through a retryable projection gap', async () => {
  let calls = 0;
  const waits = [];
  const client = createDemoClient(demoClientConfigFromEnv(cloudEnvironment), {
    appCheckFactory: () => Object.freeze({ getToken: async () => 'app-check-token' }),
    signInAnonymouslyFn: async () => ({
      user: Object.freeze({ getIdToken: async () => 'firebase-id-token' }),
    }),
    waitFn: async (milliseconds) => { waits.push(milliseconds); },
    fetchFn: async () => {
      calls += 1;
      if (calls === 1) {
        return Object.freeze({
          ok: false,
          status: 503,
          json: async () => ({ error: { code: 'internal/error', message: 'retry' } }),
        });
      }
      return Object.freeze({
        ok: true,
        status: 200,
        json: async () => ({ revision: 'cloud-ready' }),
      });
    },
  });

  assert.deepEqual(await client.getSnapshot(), { revision: 'cloud-ready' });
  assert.equal(calls, 2);
  assert.deepEqual(waits, [500]);
});

test('hydration changes world counts and fragment identities from the snapshot', () => {
  const snapshot = snapshotWith(['frag_real_1', 'frag_real_2']);
  hydrateLiveCollections(snapshot);

  assert.deepEqual(fragments.map(({ id }) => id), ['frag_real_1', 'frag_real_2']);
  assert.equal(world.totalFragments, 2);
  assert.deepEqual(cities.map(({ id }) => id), ['city-bangkok']);
});

test('storage identities remain paths until the Firebase client resolves them', () => {
  const snapshot = snapshotWith(['frag_real_path']);
  hydrateLiveCollections(snapshot);

  assert.equal(fragments[0].storagePath, snapshot.fragments[0].originalPath);
  assert.equal(fragments[0].thumbnailStoragePath, snapshot.fragments[0].thumbnailPath);
  assert.equal(fragments[0].asset, null);
});

test('particle targets consume the changed live collections', () => {
  hydrateLiveCollections(snapshotWith(['frag_particle_a']));
  const oneCityTarget = createSemanticTarget('globe', 120);
  hydrateLiveCollections(snapshotWith([]));
  const emptyTarget = createSemanticTarget('globe', 120);

  assert.notDeepEqual([...oneCityTarget], [...emptyTarget]);
});

test('live World and Fragment Field copy contains no frozen fixture totals', () => {
  hydrateLiveCollections(snapshotWith(['frag_live_a', 'frag_live_b']));
  const state = createInitialState({ runtime: { mode: 'live' } });
  const worldHtml = renderRoute('#/world', state).html;
  const fieldHtml = renderRoute('#/world/fragments', state).html;

  assert.match(worldHtml, /1 座城市/);
  assert.match(worldHtml, /2 个碎片/);
  assert.doesNotMatch(worldHtml, /三座城市/);
  assert.match(fieldHtml, /Bangkok · 2 碎片/);
  assert.doesNotMatch(fieldHtml, /172 个碎片|Tokyo · 81|Chiang Mai · 28/);
});

test('persisted processing provenance reaches receipt and Fragment Lens without internal ids', () => {
  const snapshot = snapshotWith(['frag_trace_receipt']);
  snapshot.fragments[0].processingTrace = [
    { stage: 'original', status: 'completed', label: '原件已保存', provider: 'Firebase Storage', detail: '原件完整保留' },
    { stage: 'deterministic', status: 'completed', label: '确定性整理', provider: 'Elsewhere', detail: '格式、时间、GPS 与哈希已读取' },
    { stage: 'routing', status: 'completed', label: '执行计划', provider: 'Authoritative Router', detail: '只批准必要能力' },
    { stage: 'ocr', status: 'completed', label: '票据识别', provider: 'Google Document AI', detail: '1 页文字已验证' },
    { stage: 'relationship', status: 'skipped', label: '记忆关系', provider: 'Firestore projection', detail: '未形成关系' },
  ];
  snapshot.fragments[0].ocr = {
    provider: 'Google Document AI',
    outcome: 'completed',
    pageCount: 1,
    actualCostMicros: 1_500,
    textExcerpt: 'COMMON GROUNDS\nAmericano 90.00',
    languageCodes: ['en'],
  };
  snapshot.importBatches = [{
    id: 'batch_trace',
    status: 'processing',
    uploadStatus: 'complete',
    inputCount: 1,
    counters: { saved: 1, processed: 1, failed: 0, needsReview: 0 },
    sourceIds: ['frag_trace_receipt'],
    processingTrace: snapshot.fragments[0].processingTrace,
  }];

  hydrateLiveCollections(snapshot);
  assert.deepEqual(fragments[0].processingTrace, snapshot.fragments[0].processingTrace);
  assert.deepEqual(fragments[0].ocr, snapshot.fragments[0].ocr);
  assert.deepEqual(importBatches[0].processingTrace, snapshot.importBatches[0].processingTrace);

  const receipt = renderRoute('#/world/inbox/receipt/batch_trace', createInitialState({
    runtime: { mode: 'live' },
  })).html;
  const lens = renderFragmentLens(getFragmentContext('frag_trace_receipt'));
  for (const html of [receipt, lens]) {
    assert.match(html, /Firebase Storage/);
    assert.match(html, /Authoritative Router/);
    assert.match(html, /Google Document AI/);
    assert.doesNotMatch(html, /users\/user_demo|execution_|processor123|capability-results/);
  }
  assert.match(lens, /COMMON GROUNDS/);
  assert.match(lens, /1 页/);
});
