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
