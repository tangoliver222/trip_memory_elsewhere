import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../src/config.js';

const productionBase = Object.freeze({
  NODE_ENV: 'production',
  FIREBASE_PROJECT_ID: 'elsewhere-production',
  ELSEWHERE_STORAGE_BUCKETS: 'elsewhere-originals',
  CAPABILITY_EXECUTION_MODE: 'google',
  OCR_PROVIDER_VERSION: 'processor-version-2026-07-17',
});

const cloudTasksFields = Object.freeze({
  CLOUD_TASKS_ENABLED: 'true',
  CLOUD_TASKS_PROJECT_ID: 'elsewhere-production',
  CLOUD_TASKS_LOCATION: 'asia-southeast1',
  OCR_TASK_QUEUE: 'elsewhere-ocr',
  OCR_WORKER_URL: 'https://ocr-worker.example/internal/capabilities/ocr',
  OCR_WORKER_AUDIENCE: 'https://ocr-worker.example',
  OCR_TASK_SERVICE_ACCOUNT: 'tasks@elsewhere-production.iam.gserviceaccount.com',
});

const documentAiFields = Object.freeze({
  DOCUMENT_AI_ENABLED: 'true',
  DOCUMENT_AI_PROJECT_ID: 'elsewhere-production',
  DOCUMENT_AI_LOCATION: 'us',
  DOCUMENT_AI_PROCESSOR_ID: 'processor-123',
  DOCUMENT_AI_PROCESSOR_VERSION: 'processor-version-2026-07-17',
  DOCUMENT_AI_ENDPOINT: 'us-documentai.googleapis.com',
});

test('capability providers are disabled and deeply frozen by default', () => {
  const config = loadConfig({ NODE_ENV: 'test' });

  assert.deepEqual(config.capabilities, {
    mode: 'fake',
    ocr: {
      executorVersion: 'v1',
      provider: 'document-ai',
      providerVersion: 'fake-processor-v1',
    },
    cloudTasks: null,
    documentAi: null,
  });
  assert.equal(Object.isFrozen(config.capabilities), true);
  assert.equal(Object.isFrozen(config.capabilities.ocr), true);
});

test('real ingestion config accepts only a complete Cloud Tasks tuple', () => {
  const config = loadConfig({
    ...productionBase,
    ELSEWHERE_SERVICE_MODE: 'ingestion',
    ...cloudTasksFields,
  });

  assert.equal(config.capabilities.documentAi, null);
  assert.deepEqual(config.capabilities.cloudTasks, {
    projectId: 'elsewhere-production',
    location: 'asia-southeast1',
    queue: 'elsewhere-ocr',
    workerUrl: 'https://ocr-worker.example/internal/capabilities/ocr',
    audience: 'https://ocr-worker.example',
    serviceAccountEmail: 'tasks@elsewhere-production.iam.gserviceaccount.com',
  });

  const { OCR_TASK_QUEUE: _missing, ...incomplete } = cloudTasksFields;
  assert.throws(() => loadConfig({
    ...productionBase,
    ELSEWHERE_SERVICE_MODE: 'ingestion',
    ...incomplete,
  }), /Invalid backend configuration: OCR_TASK_QUEUE/);
});

test('real worker config accepts only a complete fixed-version Document AI tuple', () => {
  const config = loadConfig({
    ...productionBase,
    ELSEWHERE_SERVICE_MODE: 'capability-worker',
    ...documentAiFields,
  });

  assert.equal(config.capabilities.cloudTasks, null);
  assert.deepEqual(config.capabilities.documentAi, {
    projectId: 'elsewhere-production',
    location: 'us',
    processorId: 'processor-123',
    processorVersion: 'processor-version-2026-07-17',
    endpoint: 'us-documentai.googleapis.com',
  });

  assert.throws(() => loadConfig({
    ...productionBase,
    ELSEWHERE_SERVICE_MODE: 'capability-worker',
    ...documentAiFields,
    DOCUMENT_AI_PROCESSOR_VERSION: 'different-version',
  }), /Invalid backend configuration/);
});

test('service roots reject provider clients outside their boundary', () => {
  assert.throws(() => loadConfig({
    ...productionBase,
    ELSEWHERE_SERVICE_MODE: 'api',
    ELSEWHERE_ALLOWED_APP_IDS: 'elsewhere-web',
    ...cloudTasksFields,
  }), /Invalid backend configuration/);
  assert.throws(() => loadConfig({
    ...productionBase,
    ELSEWHERE_SERVICE_MODE: 'ingestion',
    ...documentAiFields,
  }), /Invalid backend configuration/);
  assert.throws(() => loadConfig({
    ...productionBase,
    ELSEWHERE_SERVICE_MODE: 'capability-worker',
    ...cloudTasksFields,
    ...documentAiFields,
  }), /Invalid backend configuration/);
});

test('fake mode rejects every real provider switch', () => {
  for (const enabledField of ['CLOUD_TASKS_ENABLED', 'DOCUMENT_AI_ENABLED']) {
    assert.throws(() => loadConfig({
      NODE_ENV: 'test',
      CAPABILITY_EXECUTION_MODE: 'fake',
      [enabledField]: 'true',
    }), /Invalid backend configuration/);
  }
});

test('test mode refuses real providers unless the explicit smoke guard is true', () => {
  const realTestWorker = {
    NODE_ENV: 'test',
    ELSEWHERE_SERVICE_MODE: 'capability-worker',
    ELSEWHERE_STORAGE_BUCKETS: 'demo-elsewhere.appspot.com',
    CAPABILITY_EXECUTION_MODE: 'google',
    OCR_PROVIDER_VERSION: 'processor-version-2026-07-17',
    ...documentAiFields,
  };

  assert.throws(() => loadConfig(realTestWorker), /Invalid backend configuration/);
  assert.equal(loadConfig({
    ...realTestWorker,
    RUN_REAL_GOOGLE_PROVIDER_TESTS: 'true',
  }).capabilities.mode, 'google');
});

test('invalid capability config errors never echo private values', () => {
  const privateValue = 'private-processor-secret-value';
  let caught;
  try {
    loadConfig({
      ...productionBase,
      ELSEWHERE_SERVICE_MODE: 'capability-worker',
      ...documentAiFields,
      OCR_PROVIDER_VERSION: privateValue,
    });
  } catch (error) {
    caught = error;
  }
  assert.match(caught?.message ?? '', /Invalid backend configuration/);
  assert.equal((caught?.message ?? '').includes(privateValue), false);
});
