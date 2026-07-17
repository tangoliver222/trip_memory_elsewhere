import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityAuthorizer } from '../../src/routing/authorization.js';
import {
  makeOcrCapabilityResult,
  makeOcrReceipt,
} from '../fixtures/capabilities.js';

const NOW = '2026-07-17T12:00:00.000Z';
const LATER = '2026-07-17T12:05:00.000Z';
const SUPPORTED_VERSIONS = {
  router: ['v1'],
  policy: ['v2'],
  costModel: ['v2'],
  executors: { 'document-ocr': ['v1'] },
  providers: { 'document-ai-enterprise-ocr': ['fake-processor-v1'] },
};
const CLAIM = {
  uid: 'user_alpha',
  executionId: 'execution_12345678',
  leaseOwner: 'delivery_12345678',
  leaseExpiresAt: LATER,
};
const AUTHORIZATION = {
  executionId: CLAIM.executionId,
  routePlanId: 'route_12345678',
  routePlanRevision: 1,
  fragmentId: 'frag_12345678',
  capability: 'ocr',
  executorName: 'document-ocr',
  executorVersion: 'v1',
  providerName: 'document-ai-enterprise-ocr',
  providerVersion: 'fake-processor-v1',
  idempotencyKey: 'idem_12345678',
  ceilingMicros: 1_500,
};
const WORK = {
  executionState: 'claimed',
  sourceRevision: {
    bucket: 'demo-elsewhere.appspot.com',
    objectName: 'users/user_alpha/originals/batch_12345678/frag_12345678',
    generation: '1740000000000001',
    inputHash: 'a'.repeat(64),
  },
  storageFacts: {
    bucket: 'demo-elsewhere.appspot.com',
    originalPath: 'users/user_alpha/originals/batch_12345678/frag_12345678',
    generation: '1740000000000001',
    contentType: 'image/jpeg',
    sizeBytes: 2_048,
    crc32c: 'Y3JjIQ==',
  },
  ocrInput: {
    format: 'jpeg',
    mimeType: 'image/jpeg',
    sizeBytes: 2_048,
    width: 1_200,
    height: 800,
  },
  result: null,
};

function makeRepository() {
  const calls = [];
  const repository = {};
  for (const method of [
    'claimCapabilityExecution',
    'markCapabilityCalling',
    'recordCapabilityResult',
    'settleCapabilityExecution',
    'failCapabilityExecution',
    'markCapabilityBillingUncertain',
  ]) {
    repository[method] = async (uid, input) => {
      calls.push({ method, uid, input });
      return method === 'claimCapabilityExecution'
        ? {
            outcome: 'claimed',
            authorization: AUTHORIZATION,
            work: WORK,
            internalLedgers: ['private'],
          }
        : { outcome: 'applied' };
    };
  }
  return { repository, calls };
}

function makeAuthorizer() {
  const fake = makeRepository();
  return {
    ...fake,
    authorizer: createCapabilityAuthorizer({
      repository: fake.repository,
      supportedVersions: SUPPORTED_VERSIONS,
      clock: () => NOW,
    }),
  };
}

test('claim delegates lease and versions then returns only bounded authorization', async () => {
  const { authorizer, calls } = makeAuthorizer();
  assert.deepEqual(await authorizer.claim(CLAIM), {
    outcome: 'claimed',
    authorization: AUTHORIZATION,
    work: WORK,
  });
  assert.deepEqual(calls, [{
    method: 'claimCapabilityExecution',
    uid: CLAIM.uid,
    input: {
      executionId: CLAIM.executionId,
      leaseOwner: CLAIM.leaseOwner,
      claimedAt: NOW,
      leaseExpiresAt: CLAIM.leaseExpiresAt,
      supportedVersions: SUPPORTED_VERSIONS,
    },
  }]);
});

test('worker lifecycle delegates execution and lease without deriving client identity', async () => {
  const { authorizer, calls } = makeAuthorizer();
  const tuple = {
    uid: CLAIM.uid,
    executionId: CLAIM.executionId,
    leaseOwner: CLAIM.leaseOwner,
  };
  const receipt = makeOcrReceipt();
  const result = makeOcrCapabilityResult();
  await authorizer.markCalling(tuple);
  await authorizer.recordProviderSuccess({ ...tuple, receipt, result });
  await authorizer.settle(tuple);
  await authorizer.fail({
    ...tuple,
    outcome: 'failed_terminal',
    errorCode: 'provider-result-invalid',
    result: null,
  });
  await authorizer.markBillingUncertain({
    ...tuple,
    errorCode: 'provider-call-uncertain',
  });

  assert.deepEqual(calls.map(({ method }) => method), [
    'markCapabilityCalling',
    'recordCapabilityResult',
    'settleCapabilityExecution',
    'failCapabilityExecution',
    'markCapabilityBillingUncertain',
  ]);
  assert.ok(calls.every(({ uid }) => uid === CLAIM.uid));
  assert.ok(calls.every(({ input }) => input.executionId === CLAIM.executionId));
  assert.ok(calls.every(({ input }) => input.leaseOwner === CLAIM.leaseOwner));
  assert.equal(calls[0].input.calledAt, NOW);
  assert.equal(calls[1].input.recordedAt, NOW);
  assert.equal(calls[2].input.settledAt, NOW);
  assert.equal(calls[4].input.completedAt, NOW);
});

test('authorization rejects raw provider material extra fields and incomplete repositories', async () => {
  const { authorizer, calls, repository } = makeAuthorizer();
  await assert.rejects(() => authorizer.claim({ ...CLAIM, ownerId: CLAIM.uid }), TypeError);
  await assert.rejects(() => authorizer.recordProviderSuccess({
    uid: CLAIM.uid,
    executionId: CLAIM.executionId,
    leaseOwner: CLAIM.leaseOwner,
    receipt: makeOcrReceipt(),
    result: makeOcrCapabilityResult(),
    rawResponse: { private: true },
  }), TypeError);
  assert.equal(calls.length, 0);
  assert.throws(() => createCapabilityAuthorizer({
    repository: { ...repository, recordCapabilityResult: undefined },
    supportedVersions: SUPPORTED_VERSIONS,
    clock: () => NOW,
  }), TypeError);
  assert.throws(() => createCapabilityAuthorizer({
    repository,
    supportedVersions: { ...SUPPORTED_VERSIONS, providers: {} },
    clock: () => NOW,
  }), TypeError);
});
