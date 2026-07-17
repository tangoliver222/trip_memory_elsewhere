import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPABILITY_RESULT_OUTCOMES,
  parseCapabilityResult,
} from '../../src/domain/capability-result.js';
import {
  CAPABILITY_EXECUTION_STATES,
  parseCapabilityExecution,
} from '../../src/domain/routing-execution.js';
import {
  makeCapabilityArtifactRef,
  makeOcrCapabilityResult,
  makeOcrExecution,
  makeOcrReceipt,
  makeReservedOcrExecution,
} from '../fixtures/capabilities.js';

test('capability execution and result vocabularies are frozen and exact', () => {
  assert.deepEqual(CAPABILITY_EXECUTION_STATES, [
    'reserved',
    'queued',
    'claimed',
    'calling',
    'provider_succeeded',
    'settling',
    'completed',
    'failed_retryable',
    'failed_terminal',
    'billing_uncertain',
  ]);
  assert.deepEqual(CAPABILITY_RESULT_OUTCOMES, [
    'completed', 'insufficient_input', 'unsupported',
  ]);
  assert.equal(Object.isFrozen(CAPABILITY_EXECUTION_STATES), true);
  assert.equal(Object.isFrozen(CAPABILITY_RESULT_OUTCOMES), true);
});

test('provider receipt requires deterministic client ID and permits absent provider ID', () => {
  const execution = makeOcrExecution({
    receipt: makeOcrReceipt({ providerRequestId: null }),
  });
  assert.equal(
    parseCapabilityExecution(execution).receipt.clientRequestId,
    'ocr-request-12345678',
  );
  assert.throws(() => parseCapabilityExecution(makeOcrExecution({
    receipt: makeOcrReceipt({ clientRequestId: '' }),
  })));
  assert.throws(() => parseCapabilityExecution(makeOcrExecution({
    receipt: makeOcrReceipt({ requestCount: 2 }),
  })));
});

test('execution lifecycle binds queue lease receipt result and billable attempt fields', () => {
  assert.deepEqual(
    parseCapabilityExecution(makeReservedOcrExecution()),
    makeReservedOcrExecution(),
  );
  assert.deepEqual(parseCapabilityExecution(makeOcrExecution()), makeOcrExecution());
  for (const execution of [
    makeReservedOcrExecution({ taskName: 'ocr-task-12345678' }),
    makeOcrExecution({ state: 'claimed', billableAttempts: 1, receipt: null, resultRef: null }),
    makeOcrExecution({ state: 'calling', receipt: makeOcrReceipt(), resultRef: null }),
    makeOcrExecution({ state: 'provider_succeeded', resultRef: null }),
    makeOcrExecution({ state: 'completed', completedAt: null }),
    makeReservedOcrExecution({ state: 'billing_uncertain', billableAttempts: 1 }),
  ]) {
    assert.throws(() => parseCapabilityExecution(execution));
  }
  assert.throws(() => parseCapabilityExecution({
    ...makeReservedOcrExecution(), rawProviderResponse: {},
  }));
});

test('capability result keeps artifact refs bounded and OCR facts suggested', () => {
  const result = parseCapabilityResult(makeOcrCapabilityResult());
  assert.equal(result.outcome, 'completed');
  assert.deepEqual(result.suggestedFactKeys, [
    'ocrLanguageCodes', 'ocrPageCount', 'ocrQualitySummary', 'ocrResultRef',
  ]);
  assert.equal(result.providerArtifactRef.kind, 'provider');
  assert.equal(result.normalizedArtifactRef.kind, 'normalized');
  assert.equal(Object.hasOwn(result, 'text'), false);
  assert.throws(() => parseCapabilityResult(makeOcrCapabilityResult({
    fullText: 'private OCR body',
  })));
  assert.throws(() => parseCapabilityResult(makeOcrCapabilityResult({
    suggestedFactKeys: ['ocrResultRef', 'ocrPageCount'],
  })));
  assert.throws(() => parseCapabilityResult(makeOcrCapabilityResult({
    providerArtifactRef: makeCapabilityArtifactRef({ sizeBytes: 16_777_217 }),
  })));
});

test('unsupported result has no provider artifacts cost pages or suggested facts', () => {
  const unsupported = makeOcrCapabilityResult({
    outcome: 'unsupported',
    providerArtifactRef: null,
    normalizedArtifactRef: null,
    requestCount: 0,
    pageCount: 0,
    estimatedCostMicros: 0,
    actualCostMicros: 0,
    qualitySummary: null,
    suggestedFactKeys: [],
  });
  assert.deepEqual(parseCapabilityResult(unsupported), unsupported);
  assert.throws(() => parseCapabilityResult({ ...unsupported, actualCostMicros: 1 }));
});

test('completed unsupported execution has a result without a provider receipt or billable call', () => {
  const execution = makeReservedOcrExecution({
    state: 'completed',
    taskName: 'ocr-task-12345678',
    queuedAt: '2026-07-17T12:01:00.000Z',
    resultRef: { type: 'capabilityResult', id: 'result_12345678' },
    completedAt: '2026-07-17T12:02:00.000Z',
  });
  assert.deepEqual(parseCapabilityExecution(execution), execution);
});
