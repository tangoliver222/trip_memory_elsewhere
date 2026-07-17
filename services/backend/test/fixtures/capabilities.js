import { NOW } from './import.js';
import { ROUTING_SOURCE_REVISION } from './routing.js';

export const LATER = '2026-07-17T12:05:00.000Z';

const reference = (type, id) => ({ type, id });

export function makeCapabilityArtifactRef(overrides = {}) {
  const kind = overrides.kind ?? 'provider';
  return {
    kind,
    bucket: 'demo-elsewhere.appspot.com',
    objectName: `users/user_alpha/capability-results/execution_12345678/${kind}.json.gz`,
    generation: '1740000000000200',
    contentType: 'application/gzip',
    sizeBytes: 2_048,
    sha256: 'b'.repeat(64),
    ...overrides,
  };
}

export function makeOcrReceipt(overrides = {}) {
  return {
    clientRequestId: 'ocr-request-12345678',
    providerRequestId: null,
    requestCount: 1,
    taskDeliveryCount: 0,
    pricingVersion: 'document-ai-enterprise-ocr-2026-07-17',
    estimatedPages: 1,
    actualPages: 1,
    estimatedCostMicros: 1_500,
    actualCostMicros: 1_500,
    receivedAt: NOW,
    ...overrides,
  };
}

export function makeOcrExecution(overrides = {}) {
  return {
    id: 'execution_12345678',
    ownerId: 'user_alpha',
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    routePlanRef: reference('routePlan', 'route_12345678'),
    routePlanRevision: 1,
    reservationRef: reference('budgetReservation', 'reserve_12345678'),
    fragmentRef: reference('fragment', 'frag_12345678'),
    sourceRevision: ROUTING_SOURCE_REVISION,
    capability: 'ocr',
    executorName: 'document-ocr',
    executorVersion: 'v1',
    providerName: 'document-ai-enterprise-ocr',
    providerVersion: 'fake-processor-v1',
    idempotencyKey: 'idem_12345678',
    state: 'provider_succeeded',
    taskName: 'ocr-task-12345678',
    queuedAt: NOW,
    leaseOwner: 'delivery_12345678',
    leaseExpiresAt: LATER,
    billableAttempts: 1,
    receipt: makeOcrReceipt(),
    resultRef: reference('capabilityResult', 'result_12345678'),
    errorCode: null,
    startedAt: NOW,
    completedAt: null,
    ...overrides,
  };
}

export function makeReservedOcrExecution(overrides = {}) {
  return makeOcrExecution({
    state: 'reserved',
    taskName: null,
    queuedAt: null,
    leaseOwner: null,
    leaseExpiresAt: null,
    billableAttempts: 0,
    receipt: null,
    resultRef: null,
    startedAt: null,
    ...overrides,
  });
}

export function makeOcrCapabilityResult(overrides = {}) {
  return {
    id: 'result_12345678',
    ownerId: 'user_alpha',
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    executionRef: reference('capabilityExecution', 'execution_12345678'),
    routePlanRef: reference('routePlan', 'route_12345678'),
    routePlanRevision: 1,
    fragmentRef: reference('fragment', 'frag_12345678'),
    sourceRevision: ROUTING_SOURCE_REVISION,
    capability: 'ocr',
    executorName: 'document-ocr',
    executorVersion: 'v1',
    providerName: 'document-ai-enterprise-ocr',
    providerVersion: 'fake-processor-v1',
    processorAuditId: 'processor_audit_12345678',
    endpointRegion: 'us',
    outcome: 'completed',
    providerArtifactRef: makeCapabilityArtifactRef(),
    normalizedArtifactRef: makeCapabilityArtifactRef({
      kind: 'normalized',
      generation: '1740000000000201',
      sha256: 'c'.repeat(64),
    }),
    requestCount: 1,
    pageCount: 1,
    taskDeliveryCount: 0,
    pricingVersion: 'document-ai-enterprise-ocr-2026-07-17',
    estimatedCostMicros: 1_500,
    actualCostMicros: 1_500,
    qualitySummary: {
      averageConfidence: 0.94,
      defectCodes: [],
    },
    suggestedFactKeys: [
      'ocrLanguageCodes',
      'ocrPageCount',
      'ocrQualitySummary',
      'ocrResultRef',
    ],
    ...overrides,
  };
}

export function makeCapabilitySummary(overrides = {}) {
  return {
    processorName: 'capability-execution',
    processorVersion: 'v1',
    eligible: 1,
    queued: 0,
    running: 0,
    completed: 1,
    insufficient: 0,
    unsupported: 0,
    failed: 0,
    billingUncertain: 0,
    updatedAt: NOW,
    ...overrides,
  };
}
