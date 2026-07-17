import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCapabilityIdentity } from '../../src/capabilities/identity.js';

const SOURCE_REVISION = Object.freeze({
  bucket: 'demo-elsewhere.appspot.com',
  objectName: 'users/user_alpha/originals/batch_12345678/frag_12345678',
  generation: '1740000000000001',
  inputHash: 'a'.repeat(64),
});

function makeIdentityInput(overrides = {}) {
  return {
    ownerId: 'user_alpha',
    fragmentId: 'frag_12345678',
    sourceRevision: SOURCE_REVISION,
    routePlanRevision: 1,
    capability: 'ocr',
    provider: 'document-ai-enterprise-ocr',
    providerVersion: 'processor-version-1',
    ...overrides,
  };
}

test('capability identity is stable frozen and uses bounded role-specific prefixes', () => {
  const first = makeCapabilityIdentity(makeIdentityInput());
  const second = makeCapabilityIdentity(structuredClone(makeIdentityInput()));
  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first), [
    'idempotencyKey', 'executionId', 'taskName', 'resultId', 'clientRequestId',
  ]);
  assert.match(first.idempotencyKey, /^capidem_[a-f0-9]{32}$/);
  assert.match(first.executionId, /^execute_[a-f0-9]{32}$/);
  assert.match(first.taskName, /^ocr-[a-f0-9]{32}$/);
  assert.match(first.resultId, /^capresult_[a-f0-9]{32}$/);
  assert.match(first.clientRequestId, /^ocrrequest_[a-f0-9]{32}$/);
  assert.equal(Object.isFrozen(first), true);
});

test('identity changes for every paid-call boundary field', () => {
  const base = makeIdentityInput();
  const original = makeCapabilityIdentity(base);
  const changes = [
    ['ownerId', 'user_beta'],
    ['fragmentId', 'frag_87654321'],
    ['sourceRevision', { ...SOURCE_REVISION, generation: '1740000000000002' }],
    ['routePlanRevision', 2],
    ['capability', 'embedding'],
    ['provider', 'future-ocr-provider'],
    ['providerVersion', 'processor-version-2'],
  ];
  for (const [field, value] of changes) {
    assert.notEqual(
      makeCapabilityIdentity({ ...base, [field]: value }).executionId,
      original.executionId,
      field,
    );
  }
});

test('identity input is strict and excludes private or mutable content', () => {
  for (const extra of [
    { bytes: Buffer.from('private') },
    { ocrText: 'private' },
    { gps: { lat: 1, lng: 2 } },
    { userNote: 'private' },
  ]) {
    assert.throws(() => makeCapabilityIdentity({ ...makeIdentityInput(), ...extra }), TypeError);
  }
  assert.throws(() => makeCapabilityIdentity(makeIdentityInput({
    sourceRevision: { ...SOURCE_REVISION, generation: '01' },
  })), TypeError);
  assert.throws(() => makeCapabilityIdentity(makeIdentityInput({ routePlanRevision: 0 })), TypeError);
});
