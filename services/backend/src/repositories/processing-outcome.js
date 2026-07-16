import { isDeepStrictEqual } from 'node:util';
import {
  CapabilityStatusSchema,
  IdSchema,
  IsoDateTimeSchema,
  PROCESSING_STEPS,
  ProcessingErrorCodeSchema,
  TechnicalMetadataSchema,
  ThumbnailDerivativeSchema,
  WarningCodesSchema,
  deriveImportBatchState,
  parseContentHash,
  parseDuplicateCandidate,
  parseFragment,
  parseImportBatch,
  parseProvenance,
  parseProcessingTask,
} from '../domain/index.js';
import {
  makeExactCandidateId,
  makeNearCandidateId,
  makePairKey,
  makeProcessingTaskId,
} from '../processing/identity.js';
import {
  RepositoryLeaseOwnerError,
  RepositoryOwnerError,
  RepositoryProcessingTargetError,
} from './errors.js';

const PROCESSOR_NAME = 'deterministic-media';
const PROCESSOR_VERSION = 'v1';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const DHASH_PATTERN = /^[a-f0-9]{16}$/;
const HASH_BAND_PATTERNS = Array.from(
  { length: 8 },
  (_, index) => new RegExp(`^${index}:[a-f0-9]{2}$`),
);
const TERMINAL_STATES = new Set(['succeeded', 'failed_terminal']);
const SUMMARY_FIELDS = [
  'eligible',
  'running',
  'succeeded',
  'failedRetryable',
  'failedTerminal',
  'unsupportedCapabilities',
];

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function targetError() {
  return new RepositoryProcessingTargetError();
}

function normalizeOwner(uid) {
  if (!IdSchema.safeParse(uid).success) throw new RepositoryOwnerError();
  return uid;
}

function normalizeId(value) {
  if (!IdSchema.safeParse(value).success) throw targetError();
  return value;
}

function normalizeInstant(value) {
  if (!IsoDateTimeSchema.safeParse(value).success) throw targetError();
  return new Date(value).toISOString();
}

function before(first, second) {
  return Date.parse(first) < Date.parse(second);
}

function sameSourceRevision(first, second) {
  return isDeepStrictEqual(first, second);
}

function normalizeSourceRevision(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw targetError();
  const sourceRevision = {
    bucket: input.bucket,
    objectName: input.objectName,
    generation: input.generation,
  };
  if (Object.values(sourceRevision).some((value) => (
    typeof value !== 'string' || !value || value !== value.trim()
  ))) {
    throw targetError();
  }
  return sourceRevision;
}

function normalizeClaim(uid, input) {
  normalizeOwner(uid);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw targetError();
  if (input.processorName !== PROCESSOR_NAME || input.processorVersion !== PROCESSOR_VERSION) {
    throw targetError();
  }

  const normalized = {
    taskId: normalizeId(input.taskId),
    fragmentId: normalizeId(input.fragmentId),
    batchId: normalizeId(input.batchId),
    processorName: input.processorName,
    processorVersion: input.processorVersion,
    sourceRevision: normalizeSourceRevision(input.sourceRevision),
    leaseOwner: normalizeId(input.leaseOwner),
    claimedAt: normalizeInstant(input.claimedAt),
    softDeadlineAt: normalizeInstant(input.softDeadlineAt),
    leaseExpiresAt: normalizeInstant(input.leaseExpiresAt),
  };
  if (!before(normalized.claimedAt, normalized.softDeadlineAt)
    || !before(normalized.softDeadlineAt, normalized.leaseExpiresAt)) {
    throw targetError();
  }
  return normalized;
}

function parseOwnedTask(uid, input) {
  if (!input) return null;
  const task = parseProcessingTask(input);
  if (task.ownerId !== uid) throw new RepositoryOwnerError();
  return task;
}

function assertTaskIdentity(task, claim) {
  if (task.id !== claim.taskId
    || task.fragmentId !== claim.fragmentId
    || task.batchId !== claim.batchId
    || task.processorName !== claim.processorName
    || task.processorVersion !== claim.processorVersion
    || !sameSourceRevision(task.sourceRevision, claim.sourceRevision)) {
    throw targetError();
  }
}

function parseProcessingTarget(uid, fragmentInput, batchInput, claim, task) {
  if (!fragmentInput || !batchInput) throw targetError();
  const fragment = parseFragment(fragmentInput);
  const batch = parseImportBatch(batchInput);
  if (fragment.ownerId !== uid || batch.ownerId !== uid) throw new RepositoryOwnerError();

  const upload = batch.uploads[claim.fragmentId];
  if (fragment.id !== claim.fragmentId
    || fragment.batchId !== claim.batchId
    || batch.id !== claim.batchId
    || !['uploaded', 'processing'].includes(fragment.status)
    || upload?.state !== 'finalized'
    || upload.finalizedGeneration !== claim.sourceRevision.generation
    || fragment.storage.bucket !== claim.sourceRevision.bucket
    || fragment.storage.originalPath !== claim.sourceRevision.objectName
    || fragment.storage.generation !== claim.sourceRevision.generation) {
    throw targetError();
  }

  const expectedTaskId = makeProcessingTaskId({
    ownerId: uid,
    fragmentId: claim.fragmentId,
    processorName: claim.processorName,
    processorVersion: claim.processorVersion,
    ...claim.sourceRevision,
  });
  if (claim.taskId !== expectedTaskId) throw targetError();
  if (task && fragment.processing.deterministic?.taskId !== task.id) throw targetError();
  if (!task && fragment.processing.deterministic !== null) throw targetError();
  return { fragment, batch };
}

function taskContribution(task) {
  if (!task) {
    return Object.fromEntries(SUMMARY_FIELDS.map((field) => [field, 0]));
  }
  const statuses = [
    task.outputs.metadataStatus,
    task.outputs.thumbnailStatus,
    task.outputs.perceptualHashStatus,
  ];
  return {
    eligible: 1,
    running: Number(task.state === 'running'),
    succeeded: Number(task.state === 'succeeded'),
    failedRetryable: Number(task.state === 'failed_retryable'),
    failedTerminal: Number(task.state === 'failed_terminal'),
    unsupportedCapabilities: statuses.filter((status) => status === 'unsupported').length,
  };
}

function updatedSummary(batch, previousTask, nextTask, updatedAt) {
  const active = batch.processingSummary?.deterministic;
  if (active
    && (active.processorName !== nextTask.processorName
      || active.processorVersion !== nextTask.processorVersion)) {
    return null;
  }
  const current = active ?? {
    processorName: PROCESSOR_NAME,
    processorVersion: PROCESSOR_VERSION,
    eligible: 0,
    running: 0,
    succeeded: 0,
    failedRetryable: 0,
    failedTerminal: 0,
    unsupportedCapabilities: 0,
    updatedAt,
  };
  const previous = taskContribution(previousTask);
  const next = taskContribution(nextTask);
  const counters = Object.fromEntries(SUMMARY_FIELDS.map((field) => [
    field,
    current[field] - previous[field] + next[field],
  ]));
  if (Object.values(counters).some((value) => value < 0)) throw targetError();

  return {
    processorName: nextTask.processorName,
    processorVersion: nextTask.processorVersion,
    ...counters,
    updatedAt,
  };
}

function updateBatchSummary(batch, previousTask, nextTask, updatedAt) {
  const summary = updatedSummary(batch, previousTask, nextTask, updatedAt);
  if (summary === null) return parseImportBatch(batch);

  return parseImportBatch({
    ...batch,
    updatedAt,
    processingSummary: {
      deterministic: summary,
    },
  });
}

function nextFragmentForClaim(fragment, task, updatedAt) {
  return parseFragment({
    ...fragment,
    status: 'processing',
    updatedAt,
    processing: {
      ...fragment.processing,
      deterministic: {
        taskId: task.id,
        processorName: task.processorName,
        processorVersion: task.processorVersion,
        state: task.state,
        metadataStatus: task.outputs.metadataStatus,
        thumbnailStatus: task.outputs.thumbnailStatus,
        perceptualHashStatus: task.outputs.perceptualHashStatus,
        updatedAt,
      },
    },
  });
}

function nextRunningTask(uid, previousTask, claim) {
  return parseProcessingTask({
    ...(previousTask ?? {
      id: claim.taskId,
      ownerId: uid,
      schemaVersion: 1,
      fragmentId: claim.fragmentId,
      batchId: claim.batchId,
      processorName: claim.processorName,
      processorVersion: claim.processorVersion,
      sourceRevision: claim.sourceRevision,
      inputHash: null,
      outputs: {
        metadataStatus: null,
        thumbnailStatus: null,
        perceptualHashStatus: null,
        warningCodes: [],
      },
      createdAt: claim.claimedAt,
      deletedAt: null,
    }),
    state: 'running',
    currentStep: previousTask?.currentStep ?? 'hashing',
    leaseOwner: claim.leaseOwner,
    attemptCount: (previousTask?.attemptCount ?? 0) + 1,
    lastErrorCode: null,
    updatedAt: claim.claimedAt,
    firstStartedAt: previousTask?.firstStartedAt ?? claim.claimedAt,
    attemptStartedAt: claim.claimedAt,
    lastHeartbeatAt: claim.claimedAt,
    softDeadlineAt: claim.softDeadlineAt,
    leaseAcquiredAt: claim.claimedAt,
    leaseExpiresAt: claim.leaseExpiresAt,
    completedAt: null,
  });
}

export function applyProcessingClaim(uid, taskInput, fragmentInput, batchInput, input) {
  const claim = normalizeClaim(uid, input);
  const task = parseOwnedTask(uid, taskInput);
  if (task) {
    assertTaskIdentity(task, claim);
    if (TERMINAL_STATES.has(task.state)) {
      return deepFreeze({ outcome: 'terminal', task });
    }
    if (task.state === 'running' && before(claim.claimedAt, task.leaseExpiresAt)) {
      return deepFreeze({ outcome: 'busy', task });
    }
  }

  const { fragment, batch } = parseProcessingTarget(uid, fragmentInput, batchInput, claim, task);
  const nextTask = nextRunningTask(uid, task, claim);
  const nextFragment = nextFragmentForClaim(fragment, nextTask, claim.claimedAt);
  const nextBatch = updateBatchSummary(batch, task, nextTask, claim.claimedAt);
  return deepFreeze({
    outcome: 'claimed',
    task: nextTask,
    fragment: nextFragment,
    batch: nextBatch,
  });
}

function normalizeHeartbeat(uid, input) {
  normalizeOwner(uid);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw targetError();
  if (!PROCESSING_STEPS.includes(input.currentStep)) throw targetError();
  return {
    taskId: normalizeId(input.taskId),
    leaseOwner: normalizeId(input.leaseOwner),
    heartbeatAt: normalizeInstant(input.heartbeatAt),
    currentStep: input.currentStep,
    leaseExpiresAt: normalizeInstant(input.leaseExpiresAt),
  };
}

function assertCurrentLease(task, leaseOwner, at) {
  if (!task
    || task.state !== 'running'
    || task.leaseOwner !== leaseOwner
    || !before(at, task.leaseExpiresAt)) {
    throw new RepositoryLeaseOwnerError();
  }
}

export function applyProcessingHeartbeat(uid, taskInput, input) {
  const heartbeat = normalizeHeartbeat(uid, input);
  const task = parseOwnedTask(uid, taskInput);
  if (task?.id !== heartbeat.taskId) throw new RepositoryLeaseOwnerError();
  assertCurrentLease(task, heartbeat.leaseOwner, heartbeat.heartbeatAt);
  if (before(heartbeat.heartbeatAt, task.lastHeartbeatAt)
    || before(heartbeat.leaseExpiresAt, task.leaseExpiresAt)
    || !before(heartbeat.heartbeatAt, heartbeat.leaseExpiresAt)
    || !before(task.softDeadlineAt, heartbeat.leaseExpiresAt)) {
    throw new RepositoryLeaseOwnerError();
  }

  const nextTask = parseProcessingTask({
    ...task,
    currentStep: heartbeat.currentStep,
    updatedAt: heartbeat.heartbeatAt,
    lastHeartbeatAt: heartbeat.heartbeatAt,
    leaseExpiresAt: heartbeat.leaseExpiresAt,
  });
  return deepFreeze({ task: nextTask });
}

function normalizeFailure(uid, input) {
  normalizeOwner(uid);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw targetError();
  const errorCode = ProcessingErrorCodeSchema.safeParse(input.errorCode);
  if (!errorCode.success) throw targetError();
  return {
    taskId: normalizeId(input.taskId),
    leaseOwner: normalizeId(input.leaseOwner),
    failedAt: normalizeInstant(input.failedAt),
    errorCode: errorCode.data,
  };
}

export function applyRetryableProcessingFailure(uid, taskInput, batchInput, input) {
  const failure = normalizeFailure(uid, input);
  const task = parseOwnedTask(uid, taskInput);
  if (!task || task.id !== failure.taskId) throw new RepositoryLeaseOwnerError();
  if (task.state === 'failed_retryable'
    && task.updatedAt === failure.failedAt
    && task.lastErrorCode === failure.errorCode) {
    const batch = parseImportBatch(batchInput);
    if (batch.ownerId !== uid || batch.id !== task.batchId) throw new RepositoryOwnerError();
    return deepFreeze({ outcome: 'duplicate', task, batch });
  }
  assertCurrentLease(task, failure.leaseOwner, failure.failedAt);
  if (before(failure.failedAt, task.lastHeartbeatAt)) throw new RepositoryLeaseOwnerError();

  const batch = parseImportBatch(batchInput);
  if (batch.ownerId !== uid) throw new RepositoryOwnerError();
  if (batch.id !== task.batchId) throw targetError();
  const nextTask = parseProcessingTask({
    ...task,
    state: 'failed_retryable',
    leaseOwner: null,
    leaseAcquiredAt: null,
    leaseExpiresAt: null,
    lastErrorCode: failure.errorCode,
    updatedAt: failure.failedAt,
  });
  const nextBatch = updateBatchSummary(batch, task, nextTask, failure.failedAt);
  return deepFreeze({ outcome: 'applied', task: nextTask, batch: nextBatch });
}

function normalizeHashRegistration(uid, input) {
  normalizeOwner(uid);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw targetError();
  if (typeof input.sha256 !== 'string' || !SHA256_PATTERN.test(input.sha256)) {
    throw targetError();
  }
  return {
    taskId: normalizeId(input.taskId),
    leaseOwner: normalizeId(input.leaseOwner),
    registeredAt: normalizeInstant(input.registeredAt),
    sha256: input.sha256,
  };
}

function fragmentReference(id) {
  return { type: 'fragment', id };
}

function exactCandidateFor(uid, task, canonicalFragmentId, registeredAt) {
  const pairIds = [canonicalFragmentId, task.fragmentId].sort();
  return parseDuplicateCandidate({
    id: makeExactCandidateId({
      algorithmVersion: 'v1',
      canonicalFragmentId,
      candidateFragmentId: task.fragmentId,
    }),
    ownerId: uid,
    kind: 'exact',
    canonicalFragmentRef: fragmentReference(canonicalFragmentId),
    candidateFragmentRef: fragmentReference(task.fragmentId),
    pairRefs: pairIds.map(fragmentReference),
    algorithm: 'sha256',
    algorithmVersion: 'v1',
    distance: 0,
    createdByTaskId: task.id,
    status: 'suggested',
    createdAt: registeredAt,
    updatedAt: registeredAt,
  });
}

export function applyContentHashRegistration(
  uid,
  taskInput,
  fragmentInput,
  contentHashInput,
  canonicalFragmentInput,
  candidateInput,
  input,
) {
  const registration = normalizeHashRegistration(uid, input);
  const task = parseOwnedTask(uid, taskInput);
  if (!task || task.id !== registration.taskId) throw new RepositoryLeaseOwnerError();
  assertCurrentLease(task, registration.leaseOwner, registration.registeredAt);
  if (before(registration.registeredAt, task.lastHeartbeatAt)) {
    throw new RepositoryLeaseOwnerError();
  }

  const fragment = parseFragment(fragmentInput);
  if (fragment.ownerId !== uid) throw new RepositoryOwnerError();
  if (fragment.id !== task.fragmentId
    || fragment.batchId !== task.batchId
    || fragment.status !== 'processing'
    || fragment.processing.deterministic?.taskId !== task.id
    || fragment.storage.bucket !== task.sourceRevision.bucket
    || fragment.storage.originalPath !== task.sourceRevision.objectName
    || fragment.storage.generation !== task.sourceRevision.generation
    || (task.inputHash !== null && task.inputHash !== registration.sha256)
    || (fragment.hashes.sha256 !== null && fragment.hashes.sha256 !== registration.sha256)) {
    throw targetError();
  }

  const existingContentHash = contentHashInput === null
    ? null
    : parseContentHash(contentHashInput);
  if (existingContentHash) {
    const canonicalFragment = parseFragment(canonicalFragmentInput);
    if (canonicalFragment.ownerId !== uid
      || canonicalFragment.id !== existingContentHash.canonicalFragmentRef.id
      || canonicalFragment.hashes.sha256 !== registration.sha256) {
      throw targetError();
    }
  } else if (canonicalFragmentInput !== null || candidateInput !== null) {
    throw targetError();
  }

  const canonicalFragmentRef = existingContentHash?.canonicalFragmentRef
    ?? fragmentReference(fragment.id);
  const registrationExists = canonicalFragmentRef.id === fragment.id || candidateInput !== null;
  const contentHash = existingContentHash
    ? parseContentHash({
      ...existingContentHash,
      fragmentCount: existingContentHash.fragmentCount + Number(!registrationExists),
      updatedAt: registrationExists
        ? existingContentHash.updatedAt
        : registration.registeredAt,
    })
    : parseContentHash({
      algorithm: 'sha256',
      algorithmVersion: 'v1',
      canonicalFragmentRef,
      fragmentCount: 1,
      createdAt: registration.registeredAt,
      updatedAt: registration.registeredAt,
    });

  let exactCandidate = null;
  if (canonicalFragmentRef.id !== fragment.id) {
    const expected = exactCandidateFor(
      uid,
      task,
      canonicalFragmentRef.id,
      registration.registeredAt,
    );
    exactCandidate = candidateInput === null
      ? expected
      : parseDuplicateCandidate(candidateInput);
    if (exactCandidate.kind !== 'exact'
      || exactCandidate.ownerId !== uid
      || exactCandidate.id !== expected.id
      || exactCandidate.canonicalFragmentRef.id !== canonicalFragmentRef.id
      || exactCandidate.candidateFragmentRef.id !== fragment.id) {
      throw targetError();
    }
  } else if (candidateInput !== null) {
    throw targetError();
  }

  const checkpointed = task.inputHash === registration.sha256;
  const nextTask = checkpointed ? task : parseProcessingTask({
    ...task,
    inputHash: registration.sha256,
    currentStep: 'hash_registered',
    updatedAt: registration.registeredAt,
  });
  const hashPersisted = fragment.hashes.sha256 === registration.sha256;
  const nextFragment = hashPersisted ? fragment : parseFragment({
    ...fragment,
    updatedAt: registration.registeredAt,
    hashes: {
      ...fragment.hashes,
      sha256: registration.sha256,
    },
    processing: {
      ...fragment.processing,
      deterministic: {
        ...fragment.processing.deterministic,
        updatedAt: registration.registeredAt,
      },
    },
  });

  return deepFreeze({
    task: nextTask,
    fragment: nextFragment,
    contentHash,
    exactCandidate,
    result: { canonicalFragmentRef, exactCandidate },
  });
}

function normalizeBands(input) {
  if (!Array.isArray(input) || input.length !== HASH_BAND_PATTERNS.length) throw targetError();
  if (input.some((band, index) => (
    typeof band !== 'string' || !HASH_BAND_PATTERNS[index].test(band)
  ))) {
    throw targetError();
  }
  return [...input];
}

export function applyNearDuplicateInputQuery(uid, fragmentInputs, input) {
  normalizeOwner(uid);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw targetError();
  const fragmentId = normalizeId(input.fragmentId);
  const bands = new Set(normalizeBands(input.bands));
  const unique = new Map();
  for (const fragmentInput of fragmentInputs) {
    const candidate = parseFragment(fragmentInput);
    if (candidate.ownerId !== uid) throw new RepositoryOwnerError();
    if (candidate.id === fragmentId
      || candidate.hashes.perceptualHash === null
      || candidate.hashes.perceptualHashBands === null
      || !candidate.hashes.perceptualHashBands.some((band) => bands.has(band))) {
      continue;
    }
    unique.set(candidate.id, {
      fragmentId: candidate.id,
      perceptualHash: candidate.hashes.perceptualHash,
    });
  }
  return deepFreeze([...unique.values()]
    .sort((first, second) => (
      first.fragmentId < second.fragmentId
        ? -1
        : Number(first.fragmentId > second.fragmentId)
    ))
    .slice(0, 201));
}

function parseNullable(schema, value) {
  const result = schema.nullable().safeParse(value);
  if (!result.success) throw targetError();
  return result.data;
}

function normalizeCapabilityStatuses(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw targetError();
  const statuses = {
    metadata: input.metadata,
    thumbnail: input.thumbnail,
    perceptualHash: input.perceptualHash,
  };
  if (Object.keys(input).length !== Object.keys(statuses).length) throw targetError();
  for (const value of Object.values(statuses)) {
    if (!CapabilityStatusSchema.safeParse(value).success) throw targetError();
  }
  return statuses;
}

function normalizeFactSuggestions(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw targetError();
  const suggestions = {};
  for (const [key, value] of Object.entries(input)) {
    if (!['capturedAt', 'geo'].includes(key)) throw targetError();
    try {
      suggestions[key] = parseProvenance(value);
    } catch {
      throw targetError();
    }
  }
  return suggestions;
}

function normalizePerceptualHash(input) {
  if (input === null) return null;
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || typeof input.value !== 'string'
    || !DHASH_PATTERN.test(input.value)
    || Object.keys(input).length !== 2) {
    throw targetError();
  }
  const bands = normalizeBands(input.bands);
  if (bands.some((band, index) => band !== `${index}:${input.value.slice(index * 2, index * 2 + 2)}`)) {
    throw targetError();
  }
  return { value: input.value, bands };
}

function normalizeNearMatches(input) {
  if (!Array.isArray(input) || input.length > 5) throw targetError();
  const ids = new Set();
  return input.map((match, index) => {
    if (!match || typeof match !== 'object' || Array.isArray(match)
      || Object.keys(match).length !== 3
      || !Number.isInteger(match.distance)
      || match.distance < 0
      || match.distance > 6
      || match.rank !== index + 1) {
      throw targetError();
    }
    const fragmentId = normalizeId(match.fragmentId);
    if (ids.has(fragmentId)) throw targetError();
    ids.add(fragmentId);
    return { fragmentId, distance: match.distance, rank: match.rank };
  });
}

function normalizeCompletion(uid, input) {
  normalizeOwner(uid);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw targetError();
  let warningCodes;
  try {
    warningCodes = WarningCodesSchema.parse(input.warningCodes);
  } catch {
    throw targetError();
  }
  const errorCode = input.errorCode === undefined || input.errorCode === null
    ? null
    : ProcessingErrorCodeSchema.safeParse(input.errorCode);
  if (errorCode && !errorCode.success) throw targetError();
  const normalized = {
    taskId: normalizeId(input.taskId),
    leaseOwner: normalizeId(input.leaseOwner),
    completedAt: normalizeInstant(input.completedAt),
    technicalMetadata: parseNullable(TechnicalMetadataSchema, input.technicalMetadata),
    factSuggestions: normalizeFactSuggestions(input.factSuggestions),
    derivative: parseNullable(ThumbnailDerivativeSchema, input.derivative),
    perceptualHash: normalizePerceptualHash(input.perceptualHash),
    capabilityStatuses: normalizeCapabilityStatuses(input.capabilityStatuses),
    warningCodes,
    nearMatches: normalizeNearMatches(input.nearMatches),
    errorCode: errorCode?.data ?? null,
  };
  const succeeded = normalized.errorCode === null;
  if ((succeeded && Object.values(normalized.capabilityStatuses).includes('failed'))
    || (!succeeded && (normalized.nearMatches.length > 0
      || Object.keys(normalized.factSuggestions).length > 0))
    || (normalized.technicalMetadata === null
      && normalized.capabilityStatuses.metadata === 'complete')
    || (normalized.derivative === null
      && normalized.capabilityStatuses.thumbnail === 'complete')
    || (normalized.perceptualHash === null
      && normalized.capabilityStatuses.perceptualHash === 'complete')) {
    throw targetError();
  }
  return normalized;
}

function ownsFact(existing, suggestion, task, fragmentId) {
  return existing.sourceType !== 'user'
    && !['confirmed', 'corrected'].includes(existing.status)
    && existing.sourceType === suggestion.sourceType
    && existing.processor.name === task.processorName
    && existing.processor.version === task.processorVersion
    && isDeepStrictEqual(existing.sourceRefs, [fragmentReference(fragmentId)]);
}

function mergeFactSuggestions(fragment, task, suggestions) {
  const facts = { ...fragment.facts };
  let conflicted = false;
  for (const [key, suggestion] of Object.entries(suggestions)) {
    const expectedSourceType = key === 'capturedAt' ? 'exif' : 'gps';
    if (suggestion.sourceType !== expectedSourceType
      || suggestion.status !== 'suggested'
      || suggestion.processor.name !== task.processorName
      || suggestion.processor.version !== task.processorVersion
      || !isDeepStrictEqual(suggestion.sourceRefs, [fragmentReference(fragment.id)])) {
      throw targetError();
    }
    const existing = facts[key];
    if (!existing || ownsFact(existing, suggestion, task, fragment.id)) {
      facts[key] = suggestion;
    } else {
      conflicted = true;
    }
  }
  return { facts, conflicted };
}

function nearCandidateFor(uid, task, match, completedAt) {
  const pairIds = [task.fragmentId, match.fragmentId].sort();
  return parseDuplicateCandidate({
    id: makeNearCandidateId({
      algorithmVersion: 'v1',
      queryFragmentId: task.fragmentId,
      matchedFragmentId: match.fragmentId,
    }),
    ownerId: uid,
    kind: 'near',
    queryFragmentRef: fragmentReference(task.fragmentId),
    matchedFragmentRef: fragmentReference(match.fragmentId),
    pairRefs: pairIds.map(fragmentReference),
    pairKey: makePairKey(pairIds),
    algorithm: 'dhash',
    algorithmVersion: 'v1',
    distance: match.distance,
    rank: match.rank,
    createdByTaskId: task.id,
    status: 'suggested',
    createdAt: completedAt,
    updatedAt: completedAt,
  });
}

function terminalBatch(batch, previousTask, nextTask, completedAt, hasDuplicateCandidate) {
  const summary = updatedSummary(batch, previousTask, nextTask, completedAt);
  if (summary === null) return parseImportBatch(batch);
  const processingSummary = { deterministic: summary };
  const counters = {
    ...batch.counters,
    needsReview: batch.counters.needsReview
      + Number(nextTask.state === 'succeeded' && hasDuplicateCandidate),
  };
  const derived = deriveImportBatchState(batch.uploads, counters, processingSummary);
  return parseImportBatch({
    ...batch,
    ...derived,
    processingSummary,
    updatedAt: completedAt,
  });
}

export function applyDeterministicCompletion(
  uid,
  taskInput,
  fragmentInput,
  batchInput,
  fragmentInputs,
  existingCandidateInputs,
  hasExactCandidate,
  input,
) {
  normalizeOwner(uid);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw targetError();
  const taskId = normalizeId(input.taskId);
  const task = parseOwnedTask(uid, taskInput);
  if (!task || task.id !== taskId) throw new RepositoryLeaseOwnerError();
  if (TERMINAL_STATES.has(task.state)) {
    return deepFreeze({ outcome: 'duplicate', task });
  }

  const completion = normalizeCompletion(uid, input);
  const fragment = parseFragment(fragmentInput);
  const batch = parseImportBatch(batchInput);
  if (fragment.ownerId !== uid || batch.ownerId !== uid) throw new RepositoryOwnerError();
  if (fragment.id !== task.fragmentId
    || fragment.batchId !== task.batchId
    || batch.id !== task.batchId
    || fragment.processing.deterministic?.taskId !== task.id) {
    throw targetError();
  }

  const existingCandidates = existingCandidateInputs.map(parseDuplicateCandidate);
  if (existingCandidates.some((candidate) => candidate.ownerId !== uid)) {
    throw new RepositoryOwnerError();
  }
  assertCurrentLease(task, completion.leaseOwner, completion.completedAt);
  if (before(completion.completedAt, task.lastHeartbeatAt)) {
    throw new RepositoryLeaseOwnerError();
  }
  if (completion.technicalMetadata
    && completion.technicalMetadata.processorVersion !== task.processorVersion) {
    throw targetError();
  }

  const fragmentsById = new Map();
  for (const candidateInput of fragmentInputs) {
    const candidateFragment = parseFragment(candidateInput);
    if (candidateFragment.ownerId !== uid) throw new RepositoryOwnerError();
    fragmentsById.set(candidateFragment.id, candidateFragment);
  }
  const existingById = new Map(existingCandidates.map((candidate) => [candidate.id, candidate]));
  const candidates = completion.nearMatches.map((match) => {
    if (match.fragmentId === task.fragmentId || !fragmentsById.has(match.fragmentId)) {
      throw targetError();
    }
    const candidate = nearCandidateFor(uid, task, match, completion.completedAt);
    const existing = existingById.get(candidate.id);
    if (!existing) return candidate;
    if (!isDeepStrictEqual(existing, candidate)) throw targetError();
    return existing;
  });

  const succeeded = completion.errorCode === null;
  const merged = succeeded
    ? mergeFactSuggestions(fragment, task, completion.factSuggestions)
    : { facts: fragment.facts, conflicted: false };
  const warningCodes = [...completion.warningCodes];
  if (merged.conflicted && !warningCodes.includes('processing/fact-conflict')) {
    warningCodes.push('processing/fact-conflict');
  }
  let parsedWarningCodes;
  try {
    parsedWarningCodes = WarningCodesSchema.parse(warningCodes);
  } catch {
    throw targetError();
  }
  const nextTask = parseProcessingTask({
    ...task,
    state: succeeded ? 'succeeded' : 'failed_terminal',
    currentStep: 'complete',
    leaseOwner: null,
    leaseAcquiredAt: null,
    leaseExpiresAt: null,
    outputs: {
      metadataStatus: completion.capabilityStatuses.metadata,
      thumbnailStatus: completion.capabilityStatuses.thumbnail,
      perceptualHashStatus: completion.capabilityStatuses.perceptualHash,
      warningCodes: parsedWarningCodes,
    },
    lastErrorCode: completion.errorCode,
    updatedAt: completion.completedAt,
    completedAt: completion.completedAt,
  });

  const nextFragment = parseFragment({
    ...fragment,
    status: succeeded ? 'unresolved' : 'failed',
    updatedAt: completion.completedAt,
    hashes: succeeded ? {
      ...fragment.hashes,
      perceptualHash: completion.perceptualHash?.value ?? null,
      perceptualHashAlgorithm: completion.perceptualHash ? 'dhash' : null,
      perceptualHashVersion: completion.perceptualHash ? 'v1' : null,
      perceptualHashBands: completion.perceptualHash?.bands ?? null,
    } : fragment.hashes,
    technicalMetadata: succeeded
      ? completion.technicalMetadata
      : fragment.technicalMetadata,
    derivatives: succeeded
      ? { thumbnail: completion.derivative }
      : fragment.derivatives,
    processing: {
      ...fragment.processing,
      deterministic: {
        taskId: nextTask.id,
        processorName: nextTask.processorName,
        processorVersion: nextTask.processorVersion,
        state: nextTask.state,
        metadataStatus: nextTask.outputs.metadataStatus,
        thumbnailStatus: nextTask.outputs.thumbnailStatus,
        perceptualHashStatus: nextTask.outputs.perceptualHashStatus,
        updatedAt: completion.completedAt,
      },
    },
    facts: merged.facts,
  });
  const nextBatch = terminalBatch(
    batch,
    task,
    nextTask,
    completion.completedAt,
    hasExactCandidate || candidates.length > 0,
  );
  return deepFreeze({
    outcome: 'applied',
    task: nextTask,
    fragment: nextFragment,
    batch: nextBatch,
    candidates,
  });
}
