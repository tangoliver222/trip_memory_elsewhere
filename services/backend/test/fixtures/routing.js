import { NOW, makePendingBatch, makeUploadedFragment } from './import.js';

export const ROUTING_SOURCE_REVISION = Object.freeze({
  bucket: 'demo-elsewhere.appspot.com',
  objectName: 'users/user_alpha/originals/batch_12345678/frag_12345678',
  generation: '1740000000000001',
  inputHash: 'a'.repeat(64),
});

const PERCEPTUAL_BANDS = Object.freeze([
  '0:00', '1:00', '2:00', '3:00', '4:00', '5:00', '6:00', '7:00',
]);

const reference = (type, id) => ({ type, id });

export function makeRoutableFragment(overrides = {}) {
  const {
    id = 'frag_12345678',
    type = 'photo',
    batchId = 'batch_12345678',
    sourceCreatedAt = '2024-10-12T08:42:00.000Z',
    capturedAt = null,
    capturedAtStatus = 'suggested',
    locationHint = null,
    width = 4032,
    height = 3024,
    inputHash = 'a'.repeat(64),
    thumbnailStatus = 'complete',
    facts: factOverrides = {},
    ...fragmentOverrides
  } = overrides;
  const base = makeUploadedFragment({ id, batchId, type });
  const thumbnail = thumbnailStatus === 'complete' ? {
    path: `users/user_alpha/derived/${id}/deterministic-media/v1/${inputHash}/thumbnail.webp`,
    generation: '1740000000000100',
    metageneration: '1',
    contentType: 'image/webp',
    sizeBytes: 48_291,
    crc32c: 'Y3JjIQ==',
    width: Math.min(width, 512),
    height: Math.min(height, 512),
  } : null;
  const capturedFact = capturedAt === null ? {} : {
    capturedAt: {
      value: { instant: capturedAt },
      sourceType: 'exif',
      sourceRefs: [reference('fragment', id)],
      processor: {
        name: 'deterministic-media',
        version: 'v1',
        modelAlias: null,
        promptVersion: null,
      },
      confidence: 0.9,
      status: capturedAtStatus,
      observedAt: NOW,
    },
  };

  return {
    ...base,
    status: 'unresolved',
    source: {
      ...base.source,
      sourceCreatedAt,
      locationHint,
      media: { width, height },
    },
    hashes: {
      sha256: inputHash,
      perceptualHash: inputHash.slice(0, 16),
      perceptualHashAlgorithm: 'dhash',
      perceptualHashVersion: 'v1',
      perceptualHashBands: PERCEPTUAL_BANDS,
    },
    technicalMetadata: {
      format: 'jpeg',
      width,
      height,
      orientation: 1,
      pageCount: null,
      cameraMake: null,
      cameraModel: null,
      lensModel: null,
      focalLengthMm: null,
      apertureFNumber: null,
      isoEquivalent: null,
      exposureTimeSeconds: null,
      metadataStatus: 'complete',
      warningCodes: [],
      processorVersion: 'v1',
    },
    derivatives: { thumbnail },
    processing: {
      deterministic: {
        taskId: `task_${id.slice(5)}`,
        processorName: 'deterministic-media',
        processorVersion: 'v1',
        state: 'succeeded',
        metadataStatus: 'complete',
        thumbnailStatus,
        perceptualHashStatus: 'complete',
        updatedAt: NOW,
      },
    },
    facts: { ...capturedFact, ...factOverrides },
    ...fragmentOverrides,
  };
}

export function makeCapabilityDecision(decision, overrides = {}) {
  const common = {
    executorClass: null,
    scope: 'self',
    reasonCodes: ['policy-default'],
    budget: null,
  };
  if (decision === 'approved') {
    return {
      ...common,
      decision,
      executorClass: 'multimodal-embedding',
      reasonCodes: ['independent-fragment'],
      budget: {
        class: 'standard',
        currency: 'USD',
        estimatedMicros: 1_000,
        ceilingMicros: 5_000,
        maxBillableAttempts: 1,
      },
      ...overrides,
    };
  }
  if (decision === 'deferred') {
    return {
      ...common,
      decision,
      reasonCodes: ['await-structured-results'],
      reconsiderOn: ['ocr-completed'],
      ...overrides,
    };
  }
  return { ...common, decision, ...overrides };
}

export function makeRoutePlan(overrides = {}) {
  return {
    id: 'route_12345678',
    ownerId: 'user_alpha',
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    fragmentRef: reference('fragment', 'frag_12345678'),
    batchRef: reference('importBatch', 'batch_12345678'),
    sourceRevision: ROUTING_SOURCE_REVISION,
    router: {
      name: 'fragment-routing',
      version: 'v1',
      policyVersion: 'v1',
      costModelVersion: 'v1',
    },
    revision: 1,
    state: 'approved',
    inputs: {
      deterministicTaskId: 'task_12345678',
      deterministicProcessorName: 'deterministic-media',
      deterministicProcessorVersion: 'v1',
      cohortRevisionIds: [],
      userDecisionVersion: 0,
    },
    classification: {
      mediaKind: 'image',
      documentKind: null,
      confidence: 1,
      basis: ['magic-bytes', 'source-descriptor'],
    },
    representation: {
      role: 'independent',
      representativeRef: reference('fragment', 'frag_12345678'),
      cohortRefs: [],
      reasonCodes: ['not-near-duplicate'],
    },
    capabilities: {
      ocr: makeCapabilityDecision('skipped', {
        reasonCodes: ['not-document-like'],
      }),
      places: makeCapabilityDecision('skipped', {
        reasonCodes: ['gps-sufficient'],
      }),
      embedding: makeCapabilityDecision('approved'),
      gemini: makeCapabilityDecision('deferred'),
    },
    priority: 'normal',
    budgetClass: 'standard',
    routeReasons: [
      'capture-time-present',
      'gps-present',
      'not-near-duplicate',
    ],
    approvedAt: NOW,
    completedAt: null,
    supersededAt: null,
    rejectedAt: null,
    ...overrides,
  };
}

export function makeRoutingHead(overrides = {}) {
  return {
    id: 'rhead_12345678',
    ownerId: 'user_alpha',
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    fragmentRef: reference('fragment', 'frag_12345678'),
    routerName: 'fragment-routing',
    currentPlanRef: reference('routePlan', 'route_12345678'),
    currentRevision: 1,
    sourceRevision: ROUTING_SOURCE_REVISION,
    ...overrides,
  };
}

export function makeRoutingCohort(overrides = {}) {
  return {
    id: 'cohort_12345678',
    ownerId: 'user_alpha',
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    type: 'near_duplicate',
    revision: 1,
    inputRevisionRefs: [
      {
        fragmentRef: reference('fragment', 'frag_12345678'),
        sourceRevision: ROUTING_SOURCE_REVISION,
      },
      {
        fragmentRef: reference('fragment', 'frag_87654321'),
        sourceRevision: {
          ...ROUTING_SOURCE_REVISION,
          objectName: 'users/user_alpha/originals/batch_12345678/frag_87654321',
          generation: '1740000000000002',
          inputHash: 'b'.repeat(64),
        },
      },
    ],
    memberRefs: [
      reference('fragment', 'frag_12345678'),
      reference('fragment', 'frag_87654321'),
    ],
    representativeRefs: [reference('fragment', 'frag_12345678')],
    selector: { name: 'deterministic-representative', version: 'v1' },
    basisCodes: ['dhash-distance'],
    warningCodes: [],
    state: 'resolved',
    resolvedAt: NOW,
    ...overrides,
  };
}

export function makeBudgetLedger(overrides = {}) {
  return {
    id: 'ledger_12345678',
    ownerId: 'user_alpha',
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    scope: { type: 'user_day', key: '2026-07-17' },
    currency: 'USD',
    ceilingMicros: 2_000_000,
    reservedMicros: 5_000,
    spentMicros: 0,
    policyVersion: 'v1',
    costModelVersion: 'v1',
    ...overrides,
  };
}

export function makeBudgetReservation(overrides = {}) {
  return {
    id: 'reserve_12345678',
    ownerId: 'user_alpha',
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    routePlanRef: reference('routePlan', 'route_12345678'),
    capability: 'embedding',
    estimatedCostMicros: 1_000,
    ceilingMicros: 5_000,
    currency: 'USD',
    costModelVersion: 'v1',
    maxBillableAttempts: 1,
    ledgerRefs: [reference('budgetLedger', 'ledger_12345678')],
    state: 'reserved',
    reservedAt: NOW,
    actualCostMicros: null,
    settledAt: null,
    releasedAt: null,
    releaseReasonCode: null,
    ...overrides,
  };
}

export function makeCapabilityExecution(overrides = {}) {
  return {
    id: 'execution_12345678',
    ownerId: 'user_alpha',
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    routePlanRef: reference('routePlan', 'route_12345678'),
    reservationRef: reference('budgetReservation', 'reserve_12345678'),
    capability: 'embedding',
    executorName: 'multimodal-embedding',
    executorVersion: 'v1',
    idempotencyKey: 'idem_12345678',
    state: 'claimed',
    billableAttempts: 1,
    receipt: null,
    resultRef: null,
    errorCode: null,
    startedAt: NOW,
    completedAt: null,
    ...overrides,
  };
}

export function makeEscalationRequest(overrides = {}) {
  return {
    id: 'escalate_12345678',
    ownerId: 'user_alpha',
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    fromRoutePlanRef: reference('routePlan', 'route_12345678'),
    fromCapability: 'ocr',
    outcome: 'insufficient_input',
    reasonCodes: ['ocr-text-insufficient'],
    producedFactRefs: [],
    requestedCapability: 'gemini',
    state: 'pending',
    resolvedByPlanRef: null,
    ...overrides,
  };
}

export function makeRoutingSummary(overrides = {}) {
  return {
    routerName: 'fragment-routing',
    routerVersion: 'v1',
    policyVersion: 'v1',
    eligible: 1,
    drafting: 0,
    approved: 1,
    blocked: 0,
    completed: 0,
    superseded: 0,
    updatedAt: NOW,
    ...overrides,
  };
}

export function makeBatchWithRoutingSummary(overrides = {}) {
  return makePendingBatch({ routingSummary: makeRoutingSummary(), ...overrides });
}
