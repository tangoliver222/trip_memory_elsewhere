import {
  NOW,
  makePendingBatch,
  makeUploadItem,
  makeUploadedFragment,
} from './import.js';
import {
  makeExactDuplicateCandidate,
  makeNearDuplicateCandidate,
  makeProcessingTask,
} from './processing.js';

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
    ownerId = 'user_alpha',
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
  const base = makeUploadedFragment({ id, ownerId, batchId, type });
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

export function makeRoutingEvent(fragment = makeRoutableFragment(), overrides = {}) {
  return {
    uid: fragment.ownerId,
    batchId: fragment.batchId,
    fragmentId: fragment.id,
    sourceRevision: {
      bucket: fragment.storage.bucket,
      objectName: fragment.storage.originalPath,
      generation: fragment.storage.generation,
    },
    ...overrides,
  };
}

function terminalTask(fragment) {
  const failed = fragment.processing.deterministic.state === 'failed_terminal';
  return makeProcessingTask({
    id: fragment.processing.deterministic.taskId,
    ownerId: fragment.ownerId,
    fragmentId: fragment.id,
    batchId: fragment.batchId,
    sourceRevision: {
      bucket: fragment.storage.bucket,
      objectName: fragment.storage.originalPath,
      generation: fragment.storage.generation,
    },
    inputHash: fragment.hashes.sha256,
    state: failed ? 'failed_terminal' : 'succeeded',
    currentStep: 'complete',
    leaseOwner: null,
    outputs: {
      metadataStatus: failed ? 'failed' : fragment.processing.deterministic.metadataStatus,
      thumbnailStatus: fragment.processing.deterministic.thumbnailStatus,
      perceptualHashStatus: fragment.processing.deterministic.perceptualHashStatus,
      warningCodes: [],
    },
    lastErrorCode: failed ? 'processing/invalid-media' : null,
    leaseAcquiredAt: null,
    leaseExpiresAt: null,
    completedAt: NOW,
  });
}

export function makeRoutingServiceSnapshot({
  fragments = [makeRoutableFragment()],
  duplicateCandidates = [],
  routePlans = [],
  routingHeads = [],
  routingCohorts = [],
  escalationRequests = [],
  settled = true,
  batchId = fragments[0]?.batchId ?? 'batch_12345678',
} = {}) {
  const batchFragments = fragments
    .filter((fragment) => fragment.batchId === batchId)
    .sort((left, right) => left.id.localeCompare(right.id));
  const uploads = Object.fromEntries(batchFragments.map((fragment) => [
    fragment.id,
    makeUploadItem({
      fragmentId: fragment.id,
      ownerId: fragment.ownerId,
      batchId,
      state: 'finalized',
      originalPath: fragment.storage.originalPath,
      finalizedGeneration: fragment.storage.generation,
    }),
  ]));
  const succeeded = batchFragments.filter((fragment) => (
    fragment.processing.deterministic.state === 'succeeded'
  )).length;
  const failedTerminal = batchFragments.length - succeeded;
  const running = settled ? 0 : 1;
  const settledSucceeded = Math.max(0, succeeded - running);
  const batch = makePendingBatch({
    id: batchId,
    ownerId: batchFragments[0]?.ownerId ?? 'user_alpha',
    status: settled ? (failedTerminal > 0 ? 'completed_with_errors' : 'completed') : 'processing',
    uploadStatus: 'complete',
    inputCount: batchFragments.length,
    counters: {
      saved: batchFragments.length,
      processed: settledSucceeded,
      failed: failedTerminal,
      needsReview: 0,
    },
    processingSummary: {
      deterministic: {
        processorName: 'deterministic-media',
        processorVersion: 'v1',
        eligible: batchFragments.length,
        running,
        succeeded: settledSucceeded,
        failedRetryable: 0,
        failedTerminal,
        unsupportedCapabilities: 0,
        updatedAt: NOW,
      },
    },
    uploads,
  });
  return {
    batch,
    fragments,
    processingTasks: batchFragments.map(terminalTask),
    duplicateCandidates,
    routePlans,
    routingHeads,
    routingCohorts,
    budgetReservations: [],
    capabilityExecutions: [],
    escalationRequests,
  };
}

const NORMAL_FEATURES = Object.freeze({
  mean: 0.5,
  variance: 0.1,
  entropyBits: 4,
  edgeEnergy: 0.2,
  exposure: 'normal',
  lowInformation: false,
});
const LOW_INFORMATION_FEATURES = Object.freeze({
  mean: 0,
  variance: 0,
  entropyBits: 0,
  edgeEnergy: 0,
  exposure: 'under',
  lowInformation: true,
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function stableHash(index) {
  return index.toString(16).padStart(16, '0').repeat(4);
}

function fixtureFragment({
  index,
  id,
  ownerId,
  batchId,
  type = 'photo',
  inputHash = stableHash(index),
  sourceCreatedAt = `2024-10-12T${String(8 + Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}:00.000Z`,
  locationHint = null,
  thumbnailStatus = 'complete',
} = {}) {
  const fragment = makeRoutableFragment({
    id,
    ownerId,
    batchId,
    type,
    inputHash,
    sourceCreatedAt,
    locationHint,
    thumbnailStatus,
  });
  const generation = `1800000000${String(index).padStart(9, '0')}`;
  return {
    ...fragment,
    storage: { ...fragment.storage, generation },
  };
}

function textFragment(input) {
  const fragment = fixtureFragment({ ...input, type: 'text', thumbnailStatus: 'unsupported' });
  return {
    ...fragment,
    storage: { ...fragment.storage, contentType: 'text/plain' },
    source: { ...fragment.source, media: null },
    hashes: {
      sha256: fragment.hashes.sha256,
      perceptualHash: null,
      perceptualHashAlgorithm: null,
      perceptualHashVersion: null,
      perceptualHashBands: null,
    },
    technicalMetadata: {
      ...fragment.technicalMetadata,
      format: 'text',
      width: null,
      height: null,
      orientation: null,
      metadataStatus: 'complete',
    },
    derivatives: { thumbnail: null },
    processing: {
      deterministic: {
        ...fragment.processing.deterministic,
        thumbnailStatus: 'unsupported',
        perceptualHashStatus: 'unsupported',
      },
    },
  };
}

function fixtureBatches(fragments, duplicateCandidates) {
  const batchIds = [...new Set(fragments.map(({ batchId }) => batchId))].sort();
  return batchIds.map((batchId) => {
    const snapshot = makeRoutingServiceSnapshot({
      fragments,
      duplicateCandidates,
      batchId,
      settled: true,
    });
    return {
      batch: snapshot.batch,
      processingTasks: snapshot.processingTasks,
    };
  });
}

function completeFixture({ name, ownerId, fragments, duplicateCandidates = [], features = {} }) {
  return deepFreeze({
    name,
    ownerId,
    fragments: [...fragments].sort((left, right) => left.id.localeCompare(right.id)),
    duplicateCandidates: [...duplicateCandidates]
      .sort((left, right) => left.id.localeCompare(right.id)),
    features: Object.fromEntries(fragments.map((fragment) => [
      fragment.id,
      features[fragment.id] ?? NORMAL_FEATURES,
    ])),
    batches: fixtureBatches(fragments, duplicateCandidates),
  });
}

export function makeSmallRoutingFixture({ ownerId = 'user_alpha' } = {}) {
  const fragment = fixtureFragment({
    index: 1,
    id: 'frag_small0001',
    ownerId,
    batchId: 'batch_small001',
    locationHint: {
      lat: 13.7563,
      lng: 100.5018,
      accuracyMeters: 12,
      source: 'camera_device',
    },
  });
  return completeFixture({ name: 'small', ownerId, fragments: [fragment] });
}

export function makeCurrentRoutingFixture({ ownerId = 'user_alpha' } = {}) {
  const batchId = 'batch_current1';
  const create = (index, id, overrides = {}) => fixtureFragment({
    index,
    id,
    ownerId,
    batchId,
    sourceCreatedAt: `2024-10-${String(12 + index).padStart(2, '0')}T08:42:00.000Z`,
    ...overrides,
  });
  const burst = [
    create(1, 'frag_burst0001', { sourceCreatedAt: '2024-10-12T08:42:00.000Z' }),
    create(2, 'frag_burst0002', { sourceCreatedAt: '2024-10-12T08:42:01.000Z' }),
    create(3, 'frag_burst0003', { sourceCreatedAt: '2024-10-12T08:42:02.000Z' }),
  ];
  const exactHash = 'e'.repeat(64);
  const exact = [
    create(4, 'frag_exact0001', { inputHash: exactHash }),
    create(5, 'frag_exact0002', { inputHash: exactHash }),
  ];
  const near = [create(6, 'frag_near00001'), create(7, 'frag_near00002')];
  const receipt = create(8, 'frag_receipt01', { type: 'receipt' });
  const screenshot = create(9, 'frag_screen001', { type: 'screenshot' });
  const text = textFragment({
    index: 10,
    id: 'frag_text00001',
    ownerId,
    batchId,
    sourceCreatedAt: '2024-10-22T08:42:00.000Z',
  });
  const lowInformation = create(11, 'frag_lowinfo01');
  const independent = create(12, 'frag_indep0001');
  const fragments = [
    ...burst,
    ...exact,
    ...near,
    receipt,
    screenshot,
    text,
    lowInformation,
    independent,
  ];
  const exactCandidate = makeExactDuplicateCandidate({
    id: 'dup_exact00001',
    ownerId,
    canonicalFragmentRef: reference('fragment', exact[0].id),
    candidateFragmentRef: reference('fragment', exact[1].id),
    pairRefs: exact.map(({ id }) => reference('fragment', id)),
    createdByTaskId: exact[1].processing.deterministic.taskId,
  });
  const nearCandidate = makeNearDuplicateCandidate({
    id: 'dup_near000001',
    ownerId,
    queryFragmentRef: reference('fragment', near[1].id),
    matchedFragmentRef: reference('fragment', near[0].id),
    pairRefs: near.map(({ id }) => reference('fragment', id)).sort((left, right) => (
      left.id.localeCompare(right.id)
    )),
    pairKey: 'pair_near00001',
    createdByTaskId: near[1].processing.deterministic.taskId,
  });
  return completeFixture({
    name: 'current',
    ownerId,
    fragments,
    duplicateCandidates: [exactCandidate, nearCandidate],
    features: { [lowInformation.id]: LOW_INFORMATION_FEATURES },
  });
}

export function makeLargeRoutingFixture({ ownerId = 'user_alpha' } = {}) {
  const fragments = Array.from({ length: 200 }, (_, index) => fixtureFragment({
    index: index + 1,
    id: `frag_large${String(index).padStart(4, '0')}`,
    ownerId,
    batchId: `batch_large${String(Math.floor(index / 50)).padStart(3, '0')}`,
    sourceCreatedAt: `2024-${String(1 + Math.floor(index / 28)).padStart(2, '0')}-${String(1 + (index % 28)).padStart(2, '0')}T08:00:00.000Z`,
  }));
  const duplicateCandidates = fragments.slice(1).map((fragment, index) => {
    const matched = fragments[index];
    const pairRefs = [matched.id, fragment.id]
      .sort()
      .map((id) => reference('fragment', id));
    return makeNearDuplicateCandidate({
      id: `dup_large${String(index).padStart(4, '0')}`,
      ownerId,
      queryFragmentRef: reference('fragment', fragment.id),
      matchedFragmentRef: reference('fragment', matched.id),
      pairRefs,
      pairKey: `pair_large${String(index).padStart(4, '0')}`,
      distance: 1,
      rank: 1,
      createdByTaskId: fragment.processing.deterministic.taskId,
    });
  });
  return completeFixture({
    name: 'large',
    ownerId,
    fragments,
    duplicateCandidates,
  });
}
