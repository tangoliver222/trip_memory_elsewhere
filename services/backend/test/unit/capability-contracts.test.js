import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertCapabilityArtifactStore,
  assertCapabilityDispatcher,
  assertOcrProvider,
} from '../../src/capabilities/contract.js';
import { CapabilityError } from '../../src/capabilities/errors.js';

test('ports accept only their exact minimal method sets', () => {
  const dispatcher = { enqueueOcrTask() {} };
  const provider = { process() {} };
  const artifactStore = { putProviderArtifact() {}, putNormalizedArtifact() {} };
  assert.equal(assertCapabilityDispatcher(dispatcher), dispatcher);
  assert.equal(assertOcrProvider(provider), provider);
  assert.equal(assertCapabilityArtifactStore(artifactStore), artifactStore);

  assert.throws(() => assertCapabilityDispatcher({}), TypeError);
  assert.throws(() => assertCapabilityDispatcher({ ...dispatcher, publish() {} }), TypeError);
  assert.throws(() => assertOcrProvider({ process() {}, chat() {} }), TypeError);
  assert.throws(() => assertCapabilityArtifactStore({ putProviderArtifact() {} }), TypeError);
});

test('capability errors expose only stable classification without raw provider detail', () => {
  const error = new CapabilityError('capability/provider-call-uncertain', {
    retryable: false,
    billingUncertain: true,
  });
  assert.equal(error.name, 'CapabilityError');
  assert.equal(error.code, 'capability/provider-call-uncertain');
  assert.equal(error.message, 'Capability operation failed');
  assert.equal(error.retryable, false);
  assert.equal(error.billingUncertain, true);
  assert.equal(Object.hasOwn(error, 'cause'), false);
  assert.throws(() => new CapabilityError('private/path.jpg', {
    retryable: true,
    billingUncertain: false,
  }), TypeError);
  assert.throws(() => new CapabilityError('capability/dispatch-unavailable', {
    retryable: true,
    billingUncertain: false,
    cause: new Error('/private/path.jpg'),
  }), TypeError);
});
