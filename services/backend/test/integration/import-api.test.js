import test from 'node:test';
import assert from 'node:assert/strict';
import { ImportServiceError } from '../../src/imports/errors.js';
import { createImportApiTestApp } from '../helpers/create-import-api-app.js';
import { makeLocalFileSource } from '../fixtures/import.js';

const authHeaders = (idToken = 'id-user-alpha', appCheck = 'valid-app-check') => ({
  authorization: `Bearer ${idToken}`,
  'x-firebase-appcheck': appCheck,
});

const requestBody = () => ({
  items: [{
    sourceType: 'photo',
    declaredContentType: 'image/jpeg',
    declaredSizeBytes: 2_841_930,
    source: makeLocalFileSource(),
  }],
});

test('protected Import Batch routes create and return minimal owner receipt', async (t) => {
  const { app } = createImportApiTestApp();
  t.after(() => app.close());

  const createResponse = await app.inject({
    method: 'POST',
    url: '/v1/import-batches',
    headers: authHeaders(),
    payload: requestBody(),
  });
  assert.equal(createResponse.statusCode, 201);
  const created = createResponse.json();
  assert.equal(created.batch.inputCount, 1);
  assert.equal(created.batch.status, 'open');
  assert.equal(created.uploads.length, 1);

  const receiptResponse = await app.inject({
    method: 'GET',
    url: `/v1/import-batches/${created.batch.id}`,
    headers: authHeaders(),
  });
  assert.equal(receiptResponse.statusCode, 200);
  assert.deepEqual(receiptResponse.json(), {
    id: created.batch.id,
    status: 'open',
    uploadStatus: 'pending',
    inputCount: 1,
    counters: { saved: 0, processed: 0, failed: 0, needsReview: 0 },
    items: [{
      fragmentId: created.uploads[0].fragmentId,
      sourceType: 'photo',
      state: 'pending',
    }],
  });
});

test('all four auth failures occur before Import service execution', async (t) => {
  let calls = 0;
  const importService = {
    async createBatch() { calls += 1; },
    async getReceipt() { calls += 1; },
  };
  const { app } = createImportApiTestApp({ importService });
  t.after(() => app.close());

  const cases = [
    { headers: {}, code: 'auth/missing-id-token' },
    {
      headers: { authorization: 'Bearer invalid', 'x-firebase-appcheck': 'valid-app-check' },
      code: 'auth/invalid-id-token',
    },
    { headers: { authorization: 'Bearer id-user-alpha' }, code: 'app-check/missing-token' },
    {
      headers: authHeaders('id-user-alpha', 'invalid'),
      code: 'app-check/invalid-token',
    },
  ];

  for (const { headers, code } of cases) {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/import-batches',
      headers,
      payload: requestBody(),
    });
    assert.equal(response.statusCode, 401);
    assert.equal(response.json().error.code, code);
  }
  assert.equal(calls, 0);
});

test('forged owner and request IDs do not cross the auth boundary', async (t) => {
  const { app, repository } = createImportApiTestApp();
  t.after(() => app.close());
  const payload = requestBody();
  payload.items[0].ownerId = 'user_beta';
  payload.requestId = 'forged-request-id';

  const response = await app.inject({
    method: 'POST',
    url: '/v1/import-batches?requestId=forged-query-id',
    headers: { ...authHeaders(), 'x-request-id': 'forged-header-id' },
    payload,
  });
  assert.equal(response.statusCode, 400);
  const body = response.json();
  assert.equal(body.error.code, 'import/invalid-request');
  assert.notEqual(body.error.requestId, 'forged-request-id');
  assert.notEqual(body.error.requestId, 'forged-query-id');
  assert.notEqual(body.error.requestId, 'forged-header-id');
  assert.equal(await repository.getImportBatch('user_beta', 'batch_forged'), null);
});

test('missing and other-owner batches return the same stable 404', async (t) => {
  const { app } = createImportApiTestApp();
  t.after(() => app.close());
  const created = (await app.inject({
    method: 'POST',
    url: '/v1/import-batches',
    headers: authHeaders(),
    payload: requestBody(),
  })).json();

  const responses = await Promise.all([
    app.inject({
      method: 'GET',
      url: '/v1/import-batches/batch_00000000-0000-4000-8000-999999999999',
      headers: authHeaders(),
    }),
    app.inject({
      method: 'GET',
      url: `/v1/import-batches/${created.batch.id}`,
      headers: authHeaders('id-user-beta'),
    }),
  ]);

  for (const response of responses) {
    assert.equal(response.statusCode, 404);
    assert.equal(response.json().error.code, 'import/batch-not-found');
  }
});

test('service conflict and unexpected failure use stable redacted errors', async (t) => {
  const conflictSystem = createImportApiTestApp({
    importService: {
      async createBatch() { throw new ImportServiceError('import/batch-conflict'); },
      async getReceipt() { throw new ImportServiceError('import/batch-not-found'); },
    },
  });
  const failureSystem = createImportApiTestApp({
    importService: {
      async createBatch() { throw new Error('raw database password and stack'); },
      async getReceipt() { throw new Error('raw database password and stack'); },
    },
  });
  t.after(() => Promise.all([conflictSystem.app.close(), failureSystem.app.close()]));

  const conflict = await conflictSystem.app.inject({
    method: 'POST',
    url: '/v1/import-batches',
    headers: authHeaders(),
    payload: requestBody(),
  });
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.json().error.code, 'import/batch-conflict');

  const failure = await failureSystem.app.inject({
    method: 'POST',
    url: '/v1/import-batches',
    headers: authHeaders(),
    payload: requestBody(),
  });
  assert.equal(failure.statusCode, 500);
  assert.deepEqual(Object.keys(failure.json().error).sort(), ['code', 'message', 'requestId']);
  assert.equal(JSON.stringify(failure.json()).includes('database password'), false);
});

test('API responses never expose private Source Descriptor or Storage fields', async (t) => {
  const { app } = createImportApiTestApp();
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/v1/import-batches',
    headers: authHeaders(),
    payload: requestBody(),
  });
  const serialized = response.body;
  for (const field of [
    'providerItemId',
    'originalName',
    'finalizedGeneration',
    'failureCode',
    'crc32c',
  ]) {
    assert.equal(serialized.includes(field), false);
  }
});
