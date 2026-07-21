import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiComposition } from '../../src/composition/api.js';
import { createDemoComposition } from '../../src/demo/composition.js';
import { createMemoryRepository } from '../../src/repositories/memory.js';
import { makePendingBatch, makeUploadedFragment } from '../fixtures/import.js';

const OWNER_ID = 'user_alpha';
const BATCH_ID = 'batch_12345678';
const FRAGMENT_ID = 'frag_12345678';
const BUCKET = 'demo-elsewhere.appspot.com';
const appConfig = Object.freeze({ bodyLimit: 32 * 1024, logLevel: 'silent' });

const tokenVerifier = Object.freeze({
  async verifyIdToken(token) {
    if (token !== 'valid-id-token') throw new Error('private token error');
    return { uid: OWNER_ID };
  },
  async verifyAppCheckToken(token) {
    if (token !== 'local-demo-app-check') throw new Error('private app-check error');
    return { appId: 'elsewhere-web-local' };
  },
});

const authHeaders = Object.freeze({
  authorization: 'Bearer valid-id-token',
  'x-firebase-appcheck': 'local-demo-app-check',
  'x-elsewhere-demo': 'local-competition-v1',
});

function demoHarness() {
  const calls = [];
  const fragment = makeUploadedFragment({ ownerId: OWNER_ID });
  const batch = makePendingBatch({ ownerId: OWNER_ID });
  const decisions = {};
  const demoRepository = Object.freeze({
    async listFragments(uid) {
      calls.push(['listFragments', uid]);
      return [fragment];
    },
    async listImportBatches(uid) {
      calls.push(['listImportBatches', uid]);
      return [batch];
    },
    async listDecisions(uid) {
      calls.push(['listDecisions', uid]);
      return { ...decisions };
    },
    async listRoutingSnapshots(uid, batchIds) {
      calls.push(['listRoutingSnapshots', uid, batchIds]);
      return [{ batch: { id: BATCH_ID }, capabilityResults: [] }];
    },
    async readNormalizedArtifacts(uid, snapshots) {
      calls.push(['readNormalizedArtifacts', uid, snapshots]);
      return {};
    },
    async getImportBatch(uid, batchId) {
      calls.push(['getImportBatch', uid, batchId]);
      return batchId === BATCH_ID ? batch : null;
    },
    async getObjectFacts(input) {
      calls.push(['getObjectFacts', input]);
      return {
        bucket: input.bucket,
        objectName: input.objectName,
        generation: '1740000000000001',
        sizeBytes: 2_841_930,
        contentType: 'image/jpeg',
      };
    },
    async saveDecision(uid, itemId, decision) {
      calls.push(['saveDecision', uid, itemId, decision]);
      decisions[itemId] = decision;
      return decision;
    },
    async resetOwner(uid) {
      calls.push(['resetOwner', uid]);
      return { ownerId: uid, deleted: true };
    },
  });
  const finalizeUpload = Object.freeze({
    async handle(event) {
      calls.push(['finalizeUpload', event]);
      return { outcome: 'approved' };
    },
  });
  const afterFinalize = Object.freeze({
    async handle(input) {
      calls.push(['afterFinalize', input]);
      return { outcome: 'terminal_noop', executed: 0 };
    },
  });
  const projectSnapshot = (input) => {
    calls.push(['projectSnapshot', input]);
    return { ownerId: input.ownerId, revision: 'revision-1', fragments: input.fragments };
  };
  const elseService = Object.freeze({
    async ask(input) {
      calls.push(['elseAsk', input]);
      return {
        status: 'completed',
        state: 'found',
        answer: '只使用这位用户刚保存的原件回答。',
        sources: [{ fragmentId: FRAGMENT_ID, label: 'Bangkok photo.jpg', kind: 'photo' }],
        uncertainty: '仍需保留确定性边界。',
        nextAction: null,
        scope: { label: '全部旅行世界' },
      };
    },
  });
  const experienceService = Object.freeze({
    async getSnapshot(uid) {
      calls.push(['experienceSnapshot', uid]);
      return { ownerId: uid, userState: { revision: 0 } };
    },
    async saveReview(uid, input) {
      calls.push(['experienceReview', uid, input]);
      return { revision: 1, reviewDecisions: { [input.itemId]: input } };
    },
    async saveConnection() {},
    async saveDiscovery() {},
    async saveNote() {},
    async saveSetting() {},
    async excludeJourney() {},
  });
  const app = createDemoComposition({
    appConfig,
    repository: createMemoryRepository(),
    tokenVerifier,
    allowedAppIds: ['elsewhere-web-local'],
    demoRepository,
    finalizeUpload,
    afterFinalize,
    elseService,
    experienceService,
    projectSnapshot,
    storageBucket: BUCKET,
    randomUUID: () => '00000000-0000-4000-8000-000000000001',
    clock: () => '2026-07-19T00:00:00.000Z',
  });
  return { app, calls, decisions };
}

test('demo composition exposes the same authenticated experience operation boundary', async (t) => {
  const { app, calls } = demoHarness();
  t.after(() => app.close());

  const response = await app.inject({
    method: 'PUT',
    url: '/v1/experience/reviews/review_alpha',
    headers: authHeaders,
    payload: { decision: 'yes' },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls.find(([name]) => name === 'experienceReview'), [
    'experienceReview',
    OWNER_ID,
    { itemId: 'review_alpha', decision: 'yes' },
  ]);
});

test('demo routes remain absent from the production API composition', async (t) => {
  const productionApi = createApiComposition({
    appConfig,
    repository: createMemoryRepository(),
    tokenVerifier,
    allowedAppIds: ['elsewhere-web-local'],
  });
  t.after(() => productionApi.close());

  assert.equal((await productionApi.inject({
    method: 'GET',
    url: '/demo/v1/snapshot',
    headers: authHeaders,
  })).statusCode, 404);
});

test('snapshot requires both verified identity and the isolated demo gate', async (t) => {
  const { app, calls } = demoHarness();
  t.after(() => app.close());
  const {
    'x-elsewhere-demo': omittedDemoHeader,
    ...headersWithoutDemoGate
  } = authHeaders;
  assert.equal(omittedDemoHeader, 'local-competition-v1');

  assert.equal((await app.inject({ method: 'GET', url: '/demo/v1/snapshot' })).statusCode, 401);
  assert.equal((await app.inject({
    method: 'GET',
    url: '/demo/v1/snapshot',
    headers: headersWithoutDemoGate,
  })).statusCode, 403);
  const response = await app.inject({
    method: 'GET',
    url: '/demo/v1/snapshot',
    headers: authHeaders,
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().ownerId, OWNER_ID);
  assert.deepEqual(calls.find(([name]) => name === 'listRoutingSnapshots').slice(1), [
    OWNER_ID,
    [BATCH_ID],
  ]);
  assert.equal(calls.find(([name]) => name === 'readNormalizedArtifacts')[1], OWNER_ID);
  const projectionInput = calls.find(([name]) => name === 'projectSnapshot')[1];
  assert.equal(projectionInput.routingSnapshots.length, 1);
  assert.deepEqual(projectionInput.normalizedArtifacts, {});
});

test('finalize accepts references only and uses server-read owner and object facts', async (t) => {
  const { app, calls } = demoHarness();
  t.after(() => app.close());

  const forged = await app.inject({
    method: 'POST',
    url: '/demo/v1/finalize-upload',
    headers: authHeaders,
    payload: { batchId: BATCH_ID, fragmentId: FRAGMENT_ID, ownerId: 'user_beta' },
  });
  assert.equal(forged.statusCode, 400);
  assert.equal(calls.some(([name]) => name === 'getObjectFacts'), false);

  const response = await app.inject({
    method: 'POST',
    url: '/demo/v1/finalize-upload',
    headers: authHeaders,
    payload: { batchId: BATCH_ID, fragmentId: FRAGMENT_ID },
  });
  assert.equal(response.statusCode, 204);

  const objectCall = calls.find(([name]) => name === 'getObjectFacts');
  assert.deepEqual(objectCall[1], {
    bucket: BUCKET,
    objectName: `users/${OWNER_ID}/originals/${BATCH_ID}/${FRAGMENT_ID}`,
  });
  const event = calls.find(([name]) => name === 'finalizeUpload')[1];
  assert.equal(event.uid, OWNER_ID);
  assert.equal(event.generation, '1740000000000001');
  assert.equal(Object.hasOwn(event, 'sizeBytes'), false);
  assert.equal(Object.hasOwn(event, 'contentType'), false);
  assert.deepEqual(calls.find(([name]) => name === 'afterFinalize').slice(1), [{
    uid: OWNER_ID,
    batchId: BATCH_ID,
  }]);
});

test('missing manifests and internal failures return stable redacted server request IDs', async (t) => {
  const { app } = demoHarness();
  t.after(() => app.close());

  const missing = await app.inject({
    method: 'POST',
    url: '/demo/v1/finalize-upload',
    headers: { ...authHeaders, 'x-request-id': 'forged-client-request' },
    payload: { batchId: 'batch_missing01', fragmentId: FRAGMENT_ID },
  });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json().error.code, 'demo/not-found');
  assert.notEqual(missing.json().error.requestId, 'forged-client-request');
  assert.doesNotMatch(missing.body, /private|users\//i);
});

test('decisions and reset stay scoped to the verified owner', async (t) => {
  const { app, calls } = demoHarness();
  t.after(() => app.close());

  const decision = await app.inject({
    method: 'POST',
    url: '/demo/v1/inbox/inbox-place-frag_12345678/decision',
    headers: authHeaders,
    payload: { decision: 'later' },
  });
  assert.equal(decision.statusCode, 204);
  assert.deepEqual(calls.find(([name]) => name === 'saveDecision').slice(1, 3), [
    OWNER_ID,
    'inbox-place-frag_12345678',
  ]);

  const reset = await app.inject({
    method: 'POST',
    url: '/demo/v1/reset',
    headers: authHeaders,
    payload: { confirm: 'reset-local-demo' },
  });
  assert.equal(reset.statusCode, 204);
  assert.equal(calls.find(([name]) => name === 'resetOwner')[1], OWNER_ID);
});

test('Else receives a server-projected owner snapshot and rejects forged client evidence', async (t) => {
  const { app, calls } = demoHarness();
  t.after(() => app.close());

  const forged = await app.inject({
    method: 'POST',
    url: '/demo/v1/else/ask',
    headers: authHeaders,
    payload: {
      question: '我反复去过哪里？',
      scope: { type: 'world' },
      evidence: [{ id: 'invented-fragment' }],
    },
  });
  assert.equal(forged.statusCode, 400);
  assert.equal(calls.some(([name]) => name === 'elseAsk'), false);

  const response = await app.inject({
    method: 'POST',
    url: '/demo/v1/else/ask',
    headers: authHeaders,
    payload: { question: '我反复去过哪里？', scope: { type: 'world' } },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().answer, '只使用这位用户刚保存的原件回答。');
  const input = calls.find(([name]) => name === 'elseAsk')[1];
  assert.equal(input.snapshot.ownerId, OWNER_ID);
  assert.equal(input.snapshot.revision, 'revision-1');
  assert.equal(input.question, '我反复去过哪里？');
});
