import { isDeepStrictEqual } from 'node:util';
import {
  IdSchema,
  IsoDateTimeSchema,
  PROCESSING_STEPS,
  ProcessingErrorCodeSchema,
  parseFragment,
  parseImportBatch,
  parseProcessingTask,
} from '../domain/index.js';
import { makeProcessingTaskId } from '../processing/identity.js';
import {
  RepositoryLeaseOwnerError,
  RepositoryOwnerError,
  RepositoryProcessingTargetError,
} from './errors.js';

const PROCESSOR_NAME = 'deterministic-media';
const PROCESSOR_VERSION = 'v1';
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

function updateBatchSummary(batch, previousTask, nextTask, updatedAt) {
  const current = batch.processingSummary?.deterministic ?? {
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

  return parseImportBatch({
    ...batch,
    updatedAt,
    processingSummary: {
      deterministic: {
        processorName: PROCESSOR_NAME,
        processorVersion: PROCESSOR_VERSION,
        ...counters,
        updatedAt,
      },
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
