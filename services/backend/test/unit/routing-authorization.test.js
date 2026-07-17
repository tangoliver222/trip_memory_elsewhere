import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCapabilityAuthorizer,
} from '../../src/routing/authorization.js';
import { makeCapabilityExecutionId } from '../../src/routing/identity.js';

const NOW = '2026-07-17T12:00:00.000Z';
const SOURCE_REVISION = {
  bucket: 'demo-elsewhere.appspot.com',
  objectName: 'users/user_alpha/originals/batch_12345678/frag_12345678',
  generation: '1740000000000001',
  inputHash: 'a'.repeat(64),
};
const SUPPORTED_VERSIONS = {
  router: ['v1'],
  policy: ['v1'],
  costModel: ['v1'],
  executors: { 'multimodal-embedding': ['v1'] },
};
const CLAIM = {
  uid: 'user_alpha',
  routePlanId: 'route_12345678',
  capability: 'embedding',
  executorClass: 'multimodal-embedding',
  executorVersion: 'v1',
  sourceRevision: SOURCE_REVISION,
  idempotencyKey: 'idem_12345678',
};

function makeRepository() {
  const calls = [];
  const repository = {};
  for (const method of [
    'claimCapabilityExecution',
    'markCapabilityCalling',
    'recordCapabilityReceipt',
    'settleCapabilityExecution',
    'markCapabilityBillingUncertain',
  ]) {
    repository[method] = async (uid, input) => {
      calls.push({ method, uid, input });
      if (method === 'claimCapabilityExecution') {
        return {
          outcome: 'claimed',
          authorization: {
            routePlanId: CLAIM.routePlanId,
            capability: CLAIM.capability,
            executorClass: CLAIM.executorClass,
            scope: 'self',
            idempotencyKey: CLAIM.idempotencyKey,
            ceilingMicros: 5_000,
          },
          internalLedgers: ['must-not-escape'],
        };
      }
      return { outcome: 'applied' };
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

test('claim delegates an exact server-owned authorization command and returns no ledgers', async () => {
  const { authorizer, calls } = makeAuthorizer();
  const result = await authorizer.claim(CLAIM);

  assert.deepEqual(result, {
    routePlanId: CLAIM.routePlanId,
    capability: CLAIM.capability,
    executorClass: CLAIM.executorClass,
    scope: 'self',
    idempotencyKey: CLAIM.idempotencyKey,
    ceilingMicros: 5_000,
  });
  assert.deepEqual(calls, [{
    method: 'claimCapabilityExecution',
    uid: CLAIM.uid,
    input: {
      routePlanId: CLAIM.routePlanId,
      capability: CLAIM.capability,
      executorClass: CLAIM.executorClass,
      executorVersion: CLAIM.executorVersion,
      sourceRevision: SOURCE_REVISION,
      idempotencyKey: CLAIM.idempotencyKey,
      supportedVersions: SUPPORTED_VERSIONS,
      claimedAt: NOW,
    },
  }]);
});

test('lifecycle methods derive one execution identity and never accept provider clients', async () => {
  const { authorizer, calls } = makeAuthorizer();
  const tuple = {
    uid: CLAIM.uid,
    routePlanId: CLAIM.routePlanId,
    capability: CLAIM.capability,
    idempotencyKey: CLAIM.idempotencyKey,
  };
  const executionId = makeCapabilityExecutionId({
    routePlanId: CLAIM.routePlanId,
    capability: CLAIM.capability,
    idempotencyKey: CLAIM.idempotencyKey,
  });

  await authorizer.markCalling(tuple);
  await authorizer.recordProviderSuccess({
    ...tuple,
    providerRequestId: 'provider_request_123',
    usage: { inputTokens: 128 },
    actualCostMicros: 800,
    resultRef: { type: 'capabilityResult', id: 'result_12345678' },
  });
  await authorizer.settle(tuple);
  await authorizer.fail({ ...tuple, errorCode: 'executor-failed' });
  await authorizer.markBillingUncertain({ ...tuple, errorCode: 'provider-receipt-missing' });

  assert.deepEqual(calls.map(({ method }) => method), [
    'markCapabilityCalling',
    'recordCapabilityReceipt',
    'settleCapabilityExecution',
    'settleCapabilityExecution',
    'markCapabilityBillingUncertain',
  ]);
  assert.ok(calls.every(({ uid }) => uid === CLAIM.uid));
  assert.ok(calls.every(({ input }) => input.executionId === executionId));
  assert.equal(calls[1].input.receivedAt, NOW);
  assert.equal(calls[2].input.settledAt, NOW);
  assert.equal(calls[3].input.outcome, 'failed');
  assert.equal(calls[4].input.completedAt, NOW);
});

test('authorization inputs are strict and raw provider material is rejected before repository', async () => {
  const { authorizer, calls } = makeAuthorizer();
  await assert.rejects(() => authorizer.claim({ ...CLAIM, ownerId: CLAIM.uid }), TypeError);
  await assert.rejects(() => authorizer.claim({
    ...CLAIM,
    providerClient: { call() {} },
  }), TypeError);
  await assert.rejects(() => authorizer.recordProviderSuccess({
    uid: CLAIM.uid,
    routePlanId: CLAIM.routePlanId,
    capability: CLAIM.capability,
    idempotencyKey: CLAIM.idempotencyKey,
    providerRequestId: 'provider_request_123',
    usage: { inputTokens: 128 },
    actualCostMicros: 800,
    resultRef: { type: 'capabilityResult', id: 'result_12345678' },
    rawResponse: { private: true },
  }), TypeError);
  assert.equal(calls.length, 0);
});

test('constructor rejects incomplete repositories versions and clocks', () => {
  const { repository } = makeRepository();
  assert.throws(() => createCapabilityAuthorizer({
    repository: {},
    supportedVersions: SUPPORTED_VERSIONS,
    clock: () => NOW,
  }), TypeError);
  assert.throws(() => createCapabilityAuthorizer({
    repository,
    supportedVersions: { ...SUPPORTED_VERSIONS, router: [] },
    clock: () => NOW,
  }), TypeError);
  assert.throws(() => createCapabilityAuthorizer({
    repository,
    supportedVersions: SUPPORTED_VERSIONS,
    clock: null,
  }), TypeError);
});
