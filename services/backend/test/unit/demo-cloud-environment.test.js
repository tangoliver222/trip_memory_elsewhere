import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadCloudDemoEnvironment,
  loadCloudOcrEnvironment,
} from '../../src/demo/cloud-environment.js';

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

test('cloud OCR environment is absent unless the original-byte consent gate is explicit', () => {
  assert.equal(loadCloudOcrEnvironment({
    ELSEWHERE_DOCUMENT_AI_DEMO_ALLOWED: 'false',
  }, 'elsewhere-memory-tyx-2026'), null);
  assert.equal(loadCloudOcrEnvironment({}, 'elsewhere-memory-tyx-2026'), null);
  assert.throws(() => loadCloudOcrEnvironment({
    ELSEWHERE_DOCUMENT_AI_DEMO_ALLOWED: 'yes',
  }, 'elsewhere-memory-tyx-2026'), /cloud OCR environment/i);
});

test('cloud OCR environment binds one fixed Document AI processor to the Firebase project', () => {
  const input = {
    ELSEWHERE_DOCUMENT_AI_DEMO_ALLOWED: 'true',
    CAPABILITY_EXECUTION_MODE: 'google',
    OCR_PROVIDER_VERSION: 'pretrained-ocr-v1.0-2020-09-23',
    DOCUMENT_AI_PROJECT_ID: 'elsewhere-memory-tyx-2026',
    DOCUMENT_AI_LOCATION: 'asia-southeast1',
    DOCUMENT_AI_PROCESSOR_ID: 'processor123',
    DOCUMENT_AI_PROCESSOR_VERSION: 'pretrained-ocr-v1.0-2020-09-23',
    DOCUMENT_AI_ENDPOINT: 'asia-southeast1-documentai.googleapis.com',
  };
  assert.deepEqual(loadCloudOcrEnvironment(input, 'elsewhere-memory-tyx-2026'), {
    providerVersion: 'pretrained-ocr-v1.0-2020-09-23',
    documentAi: {
      projectId: 'elsewhere-memory-tyx-2026',
      location: 'asia-southeast1',
      processorId: 'processor123',
      processorVersion: 'pretrained-ocr-v1.0-2020-09-23',
      endpoint: 'asia-southeast1-documentai.googleapis.com',
    },
  });
});

test('cloud OCR environment rejects provider, project, version, and endpoint drift', () => {
  const valid = {
    ELSEWHERE_DOCUMENT_AI_DEMO_ALLOWED: 'true',
    CAPABILITY_EXECUTION_MODE: 'google',
    OCR_PROVIDER_VERSION: 'processor-v1',
    DOCUMENT_AI_PROJECT_ID: 'elsewhere-memory-tyx-2026',
    DOCUMENT_AI_LOCATION: 'asia-southeast1',
    DOCUMENT_AI_PROCESSOR_ID: 'processor123',
    DOCUMENT_AI_PROCESSOR_VERSION: 'processor-v1',
    DOCUMENT_AI_ENDPOINT: 'asia-southeast1-documentai.googleapis.com',
  };
  for (const override of [
    { CAPABILITY_EXECUTION_MODE: 'fake' },
    { DOCUMENT_AI_PROJECT_ID: 'another-project' },
    { DOCUMENT_AI_PROCESSOR_VERSION: 'processor-v2' },
    { DOCUMENT_AI_ENDPOINT: 'us-documentai.googleapis.com' },
  ]) {
    assert.throws(() => loadCloudOcrEnvironment({ ...valid, ...override }, valid.DOCUMENT_AI_PROJECT_ID), /cloud OCR environment/i);
  }
});
