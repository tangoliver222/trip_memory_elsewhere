import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../src/config.js';

test('loadConfig returns safe local defaults', () => {
  const result = loadConfig({ NODE_ENV: 'test' });

  assert.equal(result.nodeEnv, 'test');
  assert.equal(result.host, '127.0.0.1');
  assert.equal(result.port, 8787);
  assert.equal(result.bodyLimit, 32 * 1024);
  assert.equal(result.serviceMode, 'api');
  assert.equal(result.firebaseProjectId, 'demo-elsewhere');
  assert.deepEqual(result.allowedAppIds, ['elsewhere-web-local']);
  assert.deepEqual(result.storageBuckets, ['demo-elsewhere.appspot.com']);
  assert.equal(Object.isFrozen(result.allowedAppIds), true);
  assert.equal(Object.isFrozen(result.storageBuckets), true);
  assert.deepEqual(result.processing?.timeouts, {
    softMs: 180000,
    leaseMs: 240000,
    requestMs: 300000,
    cleanupMarginMs: 30000,
  });
  assert.equal(Object.isFrozen(result.processing), true);
  assert.equal(result.elseQuery, null);
});

test('production Else requires one Vertex-only API boundary with bounded budgets', () => {
  const base = {
    NODE_ENV: 'production',
    ELSEWHERE_SERVICE_MODE: 'api',
    FIREBASE_PROJECT_ID: 'elsewhere-production',
    ELSEWHERE_ALLOWED_APP_IDS: 'elsewhere-web',
    ELSE_QUERY_ENABLED: 'true',
    GOOGLE_GENAI_USE_VERTEXAI: 'true',
    GOOGLE_CLOUD_PROJECT: 'elsewhere-production',
    GOOGLE_CLOUD_LOCATION: 'global',
    ELSE_MODEL_FAST: 'gemini-2.5-flash',
    ELSE_QUERY_OWNER_DAILY_LIMIT: '10',
    ELSE_QUERY_PROJECT_DAILY_LIMIT: '100',
  };
  const result = loadConfig(base);
  assert.deepEqual(result.elseQuery, {
    vertex: {
      projectId: 'elsewhere-production',
      location: 'global',
      model: 'gemini-2.5-flash',
    },
    budget: { ownerDailyLimit: 10, projectDailyLimit: 100 },
  });
  assert.equal(Object.isFrozen(result.elseQuery), true);
  assert.equal(Object.isFrozen(result.elseQuery.vertex), true);
  assert.equal(result.apiKey, '');

  for (const overrides of [
    { GOOGLE_GENAI_USE_VERTEXAI: 'false' },
    { GOOGLE_CLOUD_PROJECT: 'another-project' },
    { GOOGLE_CLOUD_LOCATION: '' },
    { ELSE_MODEL_FAST: '' },
    { GEMINI_API_KEY: 'must-not-enter-production' },
    { ELSEWHERE_SERVICE_MODE: 'ingestion', ELSEWHERE_STORAGE_BUCKETS: 'bucket.example' },
  ]) {
    assert.throws(() => loadConfig({ ...base, ...overrides }), /Invalid backend configuration/);
  }
});

test('loadConfig rejects an invalid port before startup', () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: 'test', PORT: '70000' }),
    /Invalid backend configuration/,
  );
});

test('loadConfig accepts only API ingestion and capability-worker service modes', () => {
  assert.equal(loadConfig({ NODE_ENV: 'test', ELSEWHERE_SERVICE_MODE: 'api' }).serviceMode, 'api');
  assert.equal(
    loadConfig({ NODE_ENV: 'test', ELSEWHERE_SERVICE_MODE: 'ingestion' }).serviceMode,
    'ingestion',
  );
  assert.equal(
    loadConfig({ NODE_ENV: 'test', ELSEWHERE_SERVICE_MODE: 'capability-worker' }).serviceMode,
    'capability-worker',
  );
  assert.throws(
    () => loadConfig({ NODE_ENV: 'test', ELSEWHERE_SERVICE_MODE: 'unknown-worker' }),
    /Invalid backend configuration/,
  );
});

test('loadConfig normalizes mode-specific allowlists once', () => {
  const api = loadConfig({
    NODE_ENV: 'production',
    ELSEWHERE_SERVICE_MODE: 'api',
    FIREBASE_PROJECT_ID: 'elsewhere-production',
    ELSEWHERE_ALLOWED_APP_IDS: ' elsewhere-web, elsewhere-ios ',
  });
  assert.deepEqual(api.allowedAppIds, ['elsewhere-web', 'elsewhere-ios']);
  assert.deepEqual(api.storageBuckets, []);

  const ingestion = loadConfig({
    NODE_ENV: 'production',
    ELSEWHERE_SERVICE_MODE: 'ingestion',
    FIREBASE_PROJECT_ID: 'elsewhere-production',
    ELSEWHERE_STORAGE_BUCKETS: ' elsewhere-originals, elsewhere-imports ',
  });
  assert.deepEqual(ingestion.allowedAppIds, []);
  assert.deepEqual(ingestion.storageBuckets, ['elsewhere-originals', 'elsewhere-imports']);
});

test('loadConfig requires the production Firebase and mode-specific boundary values', () => {
  assert.throws(
    () => loadConfig({
      NODE_ENV: 'production',
      ELSEWHERE_SERVICE_MODE: 'api',
      ELSEWHERE_ALLOWED_APP_IDS: 'elsewhere-web',
    }),
    /Invalid backend configuration/,
  );
  assert.throws(
    () => loadConfig({
      NODE_ENV: 'production',
      ELSEWHERE_SERVICE_MODE: 'api',
      FIREBASE_PROJECT_ID: 'elsewhere-production',
      ELSEWHERE_ALLOWED_APP_IDS: '',
    }),
    /Invalid backend configuration/,
  );
  assert.throws(
    () => loadConfig({
      NODE_ENV: 'production',
      ELSEWHERE_SERVICE_MODE: 'ingestion',
      FIREBASE_PROJECT_ID: 'elsewhere-production',
      ELSEWHERE_STORAGE_BUCKETS: '',
    }),
    /Invalid backend configuration/,
  );
});

test('loadConfig rejects empty or duplicate list members without echoing input', () => {
  for (const [field, value] of [
    ['ELSEWHERE_ALLOWED_APP_IDS', 'elsewhere-web,,private-app-id'],
    ['ELSEWHERE_ALLOWED_APP_IDS', 'elsewhere-web,elsewhere-web'],
    ['ELSEWHERE_STORAGE_BUCKETS', 'elsewhere-originals, ,private-bucket'],
    ['ELSEWHERE_STORAGE_BUCKETS', 'elsewhere-originals,elsewhere-originals'],
  ]) {
    let caught;
    try {
      loadConfig({ NODE_ENV: 'test', [field]: value });
    } catch (error) {
      caught = error;
    }
    assert.match(caught?.message ?? '', /Invalid backend configuration/);
    assert.equal((caught?.message ?? '').includes(value), false);
  }
});
