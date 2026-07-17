import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createApiComposition } from '../../src/composition/api.js';
import { createIngestionComposition } from '../../src/composition/ingestion.js';
import { createRuntimeApp } from '../../src/composition/runtime.js';
import { createMemoryRepository } from '../../src/repositories/memory.js';
import { makeLocalFileSource } from '../fixtures/import.js';

const appConfig = Object.freeze({
  nodeEnv: 'test',
  bodyLimit: 32 * 1024,
  logLevel: 'silent',
});

const authHeaders = Object.freeze({
  authorization: 'Bearer valid-id-token',
  'x-firebase-appcheck': 'valid-app-check',
});

const tokenVerifier = Object.freeze({
  async verifyIdToken(token) {
    if (token !== 'valid-id-token') throw new Error('invalid ID token');
    return { uid: 'user_alpha' };
  },
  async verifyAppCheckToken(token) {
    if (token !== 'valid-app-check') throw new Error('invalid App Check token');
    return { appId: 'elsewhere-web-test' };
  },
});

const requestBody = () => ({
  items: [{
    sourceType: 'photo',
    declaredContentType: 'image/jpeg',
    declaredSizeBytes: 2_841_930,
    source: makeLocalFileSource(),
  }],
});

const sequence = () => {
  let value = 0;
  return () => `00000000-0000-4000-8000-${String(value += 1).padStart(12, '0')}`;
};

test('API composition exposes only public probes and protected Import Batch routes', async (t) => {
  const app = createApiComposition({
    appConfig,
    repository: createMemoryRepository(),
    tokenVerifier,
    allowedAppIds: ['elsewhere-web-test'],
    randomUUID: sequence(),
    clock: () => '2026-07-16T05:30:00.000Z',
  });
  t.after(() => app.close());

  assert.equal((await app.inject({ url: '/healthz' })).statusCode, 200);
  assert.equal((await app.inject({ url: '/readyz' })).statusCode, 200);
  assert.equal((await app.inject({
    method: 'POST',
    url: '/v1/import-batches',
    payload: requestBody(),
  })).statusCode, 401);
  assert.equal((await app.inject({
    method: 'POST',
    url: '/v1/import-batches',
    headers: authHeaders,
    payload: requestBody(),
  })).statusCode, 201);
  assert.equal((await app.inject({
    method: 'POST',
    url: '/events/storage-finalized',
  })).statusCode, 404);
  assert.equal((await app.inject({ url: '/protected' })).statusCode, 404);
});

test('ingestion composition exposes only public probes and the finalized receiver', async (t) => {
  const app = createIngestionComposition({
    appConfig,
    repository: createMemoryRepository(),
    objectInspector: { async inspectOriginal() { throw new Error('not reached'); } },
    allowedBuckets: ['demo-elsewhere.appspot.com'],
    deterministicProcessor: { async handle() { throw new Error('not reached'); } },
    authoritativeRouter: { async handle() { throw new Error('not reached'); } },
    clock: () => '2026-07-16T05:30:00.000Z',
  });
  t.after(() => app.close());

  assert.equal((await app.inject({ url: '/healthz' })).statusCode, 200);
  assert.equal((await app.inject({ url: '/readyz' })).statusCode, 200);
  assert.equal((await app.inject({
    method: 'POST',
    url: '/events/storage-finalized',
    headers: {
      'ce-id': 'event-12345678',
      'ce-type': 'google.cloud.storage.object.v1.finalized',
      'ce-source': '//storage.googleapis.com/projects/_/buckets/demo-elsewhere.appspot.com',
    },
    payload: {
      bucket: 'demo-elsewhere.appspot.com',
      name: 'users/user_alpha/originals/batch_12345678/frag_12345678',
      generation: '1740000000000001',
    },
  })).statusCode, 400);
  assert.equal((await app.inject({
    method: 'POST',
    url: '/v1/import-batches',
    headers: authHeaders,
    payload: requestBody(),
  })).statusCode, 404);
  assert.equal((await app.inject({ url: '/protected' })).statusCode, 404);
  assert.equal((await app.inject({ url: '/v1/processing' })).statusCode, 404);
  assert.equal((await app.inject({ url: '/routing' })).statusCode, 404);
  assert.equal((await app.inject({ url: '/route-plans' })).statusCode, 404);
});

test('runtime selects one mode and builds exactly one Firebase dependency graph', async (t) => {
  const calls = [];
  const processingCalls = [];
  const repositories = [];
  const storageManager = { bucket() { return {}; } };
  const processingConfig = Object.freeze({
    timeouts: Object.freeze({
      softMs: 180_000,
      leaseMs: 240_000,
      requestMs: 300_000,
      cleanupMarginMs: 30_000,
    }),
    limits: Object.freeze({
      maxInputBytes: 52_428_800,
      maxInputPixels: 60_000_000,
      maxImageWidth: 20_000,
      maxImageHeight: 20_000,
      maxPageCount: 100,
      maxMetadataDecompressedBytes: 16_777_216,
    }),
  });
  const clock = () => '2026-07-16T05:30:00.000Z';
  const randomUUID = () => '00000000-0000-4000-8000-000000000001';
  const ports = {};
  const firebaseFactory = (input) => {
    calls.push(input);
    return {
      db: {},
      auth: { async verifyIdToken() { return { uid: 'user_alpha' }; } },
      appCheck: { async verifyToken() { return { appId: 'elsewhere-web-test' }; } },
      storage: storageManager,
    };
  };
  const repositoryFactory = ({ db }) => {
    assert.deepEqual(db, {});
    const repository = createMemoryRepository();
    repositories.push(repository);
    return repository;
  };
  const processingFactories = {
    objectInspectorFactory(input) {
      processingCalls.push(['objectInspector', input]);
      ports.objectInspector = { async inspectOriginal() { throw new Error('not reached'); } };
      return ports.objectInspector;
    },
    sourceMaterializerFactory(input) {
      processingCalls.push(['materializer', input]);
      ports.materializer = { async materialize() { throw new Error('not reached'); } };
      return ports.materializer;
    },
    metadataReaderFactory(input) {
      processingCalls.push(['metadata', input]);
      ports.metadataReader = { async read() { throw new Error('not reached'); } };
      return ports.metadataReader;
    },
    imageProcessorFactory(input) {
      processingCalls.push(['image', input]);
      ports.imageProcessor = { async process() { throw new Error('not reached'); } };
      return ports.imageProcessor;
    },
    derivativeStoreFactory(input) {
      processingCalls.push(['derivative', input]);
      ports.derivativeStore = { async putThumbnail() { throw new Error('not reached'); } };
      return ports.derivativeStore;
    },
    deterministicProcessorFactory(input) {
      processingCalls.push(['processor', input]);
      ports.deterministicProcessor = { async handle() { throw new Error('not reached'); } };
      return ports.deterministicProcessor;
    },
    thumbnailReaderFactory(input) {
      processingCalls.push(['routingThumbnail', input]);
      ports.thumbnailReader = { async read() { throw new Error('not reached'); } };
      return ports.thumbnailReader;
    },
    routingFeatureReaderFactory(input) {
      processingCalls.push(['routingFeatures', input]);
      ports.routingFeatureReader = { async read() { throw new Error('not reached'); } };
      return ports.routingFeatureReader;
    },
    authoritativeRouterFactory(input) {
      processingCalls.push(['router', input]);
      ports.authoritativeRouter = { async handle() { throw new Error('not reached'); } };
      return ports.authoritativeRouter;
    },
  };

  const api = createRuntimeApp({
    ...appConfig,
    serviceMode: 'api',
    firebaseProjectId: 'demo-elsewhere',
    allowedAppIds: ['elsewhere-web-test'],
    storageBuckets: [],
  }, {
    firebaseFactory,
    repositoryFactory,
    ...processingFactories,
    clock,
    randomUUID,
  });
  t.after(() => api.close());
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    projectId: 'demo-elsewhere',
    appName: 'elsewhere-api',
  });
  assert.equal((await api.inject({ url: '/events/storage-finalized' })).statusCode, 404);
  assert.deepEqual(processingCalls, []);

  calls.length = 0;
  const ingestionBuckets = ['demo-elsewhere.appspot.com'];
  const ingestion = createRuntimeApp({
    ...appConfig,
    serviceMode: 'ingestion',
    firebaseProjectId: 'demo-elsewhere',
    allowedAppIds: [],
    storageBuckets: ingestionBuckets,
    processing: processingConfig,
  }, {
    firebaseFactory,
    repositoryFactory,
    ...processingFactories,
    clock,
    randomUUID,
  });
  t.after(() => ingestion.close());
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    projectId: 'demo-elsewhere',
    appName: 'elsewhere-ingestion',
  });
  assert.equal((await ingestion.inject({
    method: 'POST',
    url: '/v1/import-batches',
  })).statusCode, 404);
  assert.deepEqual(processingCalls.map(([name]) => name), [
    'objectInspector',
    'materializer',
    'metadata',
    'image',
    'derivative',
    'processor',
    'routingThumbnail',
    'routingFeatures',
    'router',
  ]);
  assert.equal(processingCalls[0][1].storage, processingCalls[1][1].storage);
  assert.equal(processingCalls[1][1].storage, processingCalls[4][1].storage);
  assert.deepEqual(processingCalls[0][1].allowedBuckets, ingestionBuckets);
  assert.strictEqual(processingCalls[0][1], processingCalls[1][1]);
  assert.strictEqual(processingCalls[1][1], processingCalls[4][1]);
  assert.strictEqual(processingCalls[2][1].limits, processingConfig.limits);
  assert.strictEqual(processingCalls[3][1].limits, processingConfig.limits);
  assert.strictEqual(processingCalls[5][1].repository, repositories[1]);
  assert.strictEqual(processingCalls[5][1].materializer, ports.materializer);
  assert.strictEqual(processingCalls[5][1].metadataReader, ports.metadataReader);
  assert.strictEqual(processingCalls[5][1].imageProcessor, ports.imageProcessor);
  assert.strictEqual(processingCalls[5][1].derivativeStore, ports.derivativeStore);
  assert.strictEqual(processingCalls[5][1].processingConfig, processingConfig);
  assert.strictEqual(processingCalls[5][1].clock, clock);
  assert.strictEqual(processingCalls[5][1].randomUUID, randomUUID);
  assert.strictEqual(processingCalls[6][1], processingCalls[0][1]);
  assert.strictEqual(processingCalls[7][1].thumbnailReader, ports.thumbnailReader);
  assert.strictEqual(processingCalls[8][1].repository, repositories[1]);
  assert.strictEqual(processingCalls[8][1].featureReader, ports.routingFeatureReader);
  assert.strictEqual(processingCalls[8][1].clock, clock);
  assert.strictEqual(processingCalls[8][1].randomUUID, randomUUID);
});

test('production composition sources do not import test helpers', async () => {
  const sources = await Promise.all([
    '../../src/composition/api.js',
    '../../src/composition/ingestion.js',
    '../../src/composition/runtime.js',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')));

  for (const source of sources) {
    assert.equal(source.includes('/test/'), false);
    assert.equal(source.includes('test/helpers'), false);
  }
});
