import { NOW } from './import.js';

export const SHA256 = 'a'.repeat(64);

export function makeProcessingTask(overrides = {}) {
  return {
    id: 'task_12345678',
    ownerId: 'user_alpha',
    schemaVersion: 1,
    fragmentId: 'frag_12345678',
    batchId: 'batch_12345678',
    processorName: 'deterministic-media',
    processorVersion: 'v1',
    sourceRevision: {
      bucket: 'demo-elsewhere.appspot.com',
      objectName: 'users/user_alpha/originals/batch_12345678/frag_12345678',
      generation: '1740000000000001',
    },
    inputHash: null,
    state: 'running',
    currentStep: 'hashing',
    leaseOwner: 'exec_12345678',
    attemptCount: 1,
    outputs: {
      metadataStatus: null,
      thumbnailStatus: null,
      perceptualHashStatus: null,
      warningCodes: [],
    },
    lastErrorCode: null,
    createdAt: NOW,
    updatedAt: NOW,
    firstStartedAt: NOW,
    attemptStartedAt: NOW,
    lastHeartbeatAt: NOW,
    softDeadlineAt: '2026-07-16T00:03:00.000Z',
    leaseAcquiredAt: NOW,
    leaseExpiresAt: '2026-07-16T00:04:00.000Z',
    completedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

export function makePdfTechnicalMetadata(overrides = {}) {
  return {
    format: 'pdf',
    width: null,
    height: null,
    orientation: null,
    pageCount: null,
    cameraMake: null,
    cameraModel: null,
    lensModel: null,
    focalLengthMm: null,
    apertureFNumber: null,
    isoEquivalent: null,
    exposureTimeSeconds: null,
    metadataStatus: 'partial',
    warningCodes: ['processing/page-count-unsupported'],
    processorVersion: 'v1',
    ...overrides,
  };
}

export function makeNearDuplicateCandidate(overrides = {}) {
  return {
    id: 'dup_12345678',
    ownerId: 'user_alpha',
    kind: 'near',
    queryFragmentRef: { type: 'fragment', id: 'frag_query123' },
    matchedFragmentRef: { type: 'fragment', id: 'frag_match123' },
    pairRefs: [
      { type: 'fragment', id: 'frag_match123' },
      { type: 'fragment', id: 'frag_query123' },
    ],
    pairKey: 'pair_12345678',
    algorithm: 'dhash',
    algorithmVersion: 'v1',
    distance: 4,
    rank: 1,
    createdByTaskId: 'task_12345678',
    status: 'suggested',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function makeExactDuplicateCandidate(overrides = {}) {
  return {
    id: 'dup_12345678',
    ownerId: 'user_alpha',
    kind: 'exact',
    canonicalFragmentRef: { type: 'fragment', id: 'frag_existing' },
    candidateFragmentRef: { type: 'fragment', id: 'frag_new0001' },
    pairRefs: [
      { type: 'fragment', id: 'frag_existing' },
      { type: 'fragment', id: 'frag_new0001' },
    ],
    algorithm: 'sha256',
    algorithmVersion: 'v1',
    distance: 0,
    createdByTaskId: 'task_12345678',
    status: 'suggested',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}
