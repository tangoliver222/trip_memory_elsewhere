import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCloudDemoEnvironment } from '../../src/demo/cloud-environment.js';

const validEnvironment = Object.freeze({
  NODE_ENV: 'development',
  ELSEWHERE_CLOUD_DEMO_MODE: 'true',
  FIREBASE_PROJECT_ID: 'elsewhere-memory-tyx-2026',
  ELSEWHERE_ALLOWED_APP_IDS: '1:352557422052:web:a55fa28a163887f43923f1',
  ELSEWHERE_STORAGE_BUCKETS: 'elsewhere-memory-tyx-2026.firebasestorage.app',
  ELSEWHERE_APP_CHECK_DEBUG_TOKEN: '123e4567-e89b-42d3-a456-426614174000',
});

test('cloud demo environment returns one frozen real-project boundary', () => {
  const result = loadCloudDemoEnvironment(validEnvironment);

  assert.deepEqual(result, {
    projectId: 'elsewhere-memory-tyx-2026',
    allowedAppIds: ['1:352557422052:web:a55fa28a163887f43923f1'],
    storageBucket: 'elsewhere-memory-tyx-2026.firebasestorage.app',
    appCheckDebugToken: '123e4567-e89b-42d3-a456-426614174000',
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.allowedAppIds), true);
});

test('cloud demo rejects production, missing gate, demo projects, and mismatched buckets', () => {
  const cases = [
    [{ NODE_ENV: 'production' }, /NODE_ENV/],
    [{ ELSEWHERE_CLOUD_DEMO_MODE: 'false' }, /ELSEWHERE_CLOUD_DEMO_MODE/],
    [{ FIREBASE_PROJECT_ID: 'demo-elsewhere' }, /FIREBASE_PROJECT_ID/],
    [{ ELSEWHERE_STORAGE_BUCKETS: 'another-project.firebasestorage.app' }, /ELSEWHERE_STORAGE_BUCKETS/],
    [{ ELSEWHERE_STORAGE_BUCKETS: 'elsewhere-memory-tyx-2026.appspot.com' }, /ELSEWHERE_STORAGE_BUCKETS/],
    [{ ELSEWHERE_ALLOWED_APP_IDS: '' }, /ELSEWHERE_ALLOWED_APP_IDS/],
    [{ ELSEWHERE_ALLOWED_APP_IDS: 'web-app,web-app' }, /ELSEWHERE_ALLOWED_APP_IDS/],
    [{ ELSEWHERE_APP_CHECK_DEBUG_TOKEN: 'local-demo-app-check' }, /ELSEWHERE_APP_CHECK_DEBUG_TOKEN/],
  ];

  for (const [override, expected] of cases) {
    assert.throws(() => loadCloudDemoEnvironment({
      ...validEnvironment,
      ...override,
    }), expected);
  }
});

test('cloud demo rejects every Firebase Emulator host before composition', () => {
  for (const name of [
    'FIREBASE_AUTH_EMULATOR_HOST',
    'FIRESTORE_EMULATOR_HOST',
    'FIREBASE_STORAGE_EMULATOR_HOST',
    'FIREBASE_EMULATOR_HUB',
  ]) {
    assert.throws(() => loadCloudDemoEnvironment({
      ...validEnvironment,
      [name]: '127.0.0.1:9999',
    }), new RegExp(name));
  }
});
