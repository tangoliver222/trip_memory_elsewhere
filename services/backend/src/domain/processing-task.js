import { z } from 'zod';
import {
  CommonFields,
  IdSchema,
  IsoDateTimeSchema,
  ProcessorVersionSchema,
} from './common.js';
import {
  NullableCapabilityStatusSchema,
  WarningCodesSchema,
} from './processing-result.js';

export const PROCESSING_TASK_STATES = Object.freeze([
  'pending',
  'running',
  'succeeded',
  'failed_retryable',
  'failed_terminal',
]);

export const PROCESSING_STEPS = Object.freeze([
  'queued',
  'hashing',
  'hash_registered',
  'metadata',
  'derivatives',
  'duplicate_search',
  'committing',
  'complete',
]);

export const PROCESSING_ERROR_CODES = Object.freeze([
  'processing/task-busy',
  'processing/soft-timeout',
  'processing/storage-unavailable',
  'processing/repository-unavailable',
  'processing/media-limits-exceeded',
  'processing/invalid-media',
  'processing/derivative-conflict',
]);

export const ProcessingErrorCodeSchema = z.enum(PROCESSING_ERROR_CODES);

const NullableDateTimeSchema = IsoDateTimeSchema.nullable();

export const ProcessingTaskSchema = z.strictObject({
  ...CommonFields,
  fragmentId: IdSchema,
  batchId: IdSchema,
  processorName: z.literal('deterministic-media'),
  processorVersion: ProcessorVersionSchema,
  sourceRevision: z.strictObject({
    bucket: z.string().trim().min(1),
    objectName: z.string().min(1),
    generation: z.string().trim().min(1),
  }),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  state: z.enum(PROCESSING_TASK_STATES),
  currentStep: z.enum(PROCESSING_STEPS),
  leaseOwner: IdSchema.nullable(),
  attemptCount: z.number().int().nonnegative(),
  outputs: z.strictObject({
    metadataStatus: NullableCapabilityStatusSchema,
    thumbnailStatus: NullableCapabilityStatusSchema,
    perceptualHashStatus: NullableCapabilityStatusSchema,
    warningCodes: WarningCodesSchema,
  }),
  lastErrorCode: ProcessingErrorCodeSchema.nullable(),
  firstStartedAt: NullableDateTimeSchema,
  attemptStartedAt: NullableDateTimeSchema,
  lastHeartbeatAt: NullableDateTimeSchema,
  softDeadlineAt: NullableDateTimeSchema,
  leaseAcquiredAt: NullableDateTimeSchema,
  leaseExpiresAt: NullableDateTimeSchema,
  completedAt: NullableDateTimeSchema,
}).superRefine((task, context) => {
  const addIssue = (path, message) => context.addIssue({
    code: 'custom',
    message,
    path: [path],
  });
  const leaseFields = ['leaseOwner', 'leaseAcquiredAt', 'leaseExpiresAt'];
  const attemptTimingFields = [
    'firstStartedAt',
    'attemptStartedAt',
    'lastHeartbeatAt',
    'softDeadlineAt',
  ];
  const capabilityFields = [
    'metadataStatus',
    'thumbnailStatus',
    'perceptualHashStatus',
  ];

  if (task.state === 'pending') {
    if (task.currentStep !== 'queued') {
      addIssue('currentStep', 'Pending task must be queued');
    }
    if (task.attemptCount !== 0) {
      addIssue('attemptCount', 'Pending task cannot have attempts');
    }
    if (task.inputHash !== null) {
      addIssue('inputHash', 'Pending task cannot have an input hash');
    }
    for (const field of capabilityFields) {
      if (task.outputs[field] !== null) {
        addIssue('outputs', 'Pending task cannot have capability outputs');
      }
    }
    if (task.outputs.warningCodes.length !== 0) {
      addIssue('outputs', 'Pending task cannot have warnings');
    }
    if (task.lastErrorCode !== null) {
      addIssue('lastErrorCode', 'Pending task cannot have an error');
    }
    for (const field of attemptTimingFields) {
      if (task[field] !== null) {
        addIssue(field, 'Pending task cannot have attempt timing');
      }
    }
  }

  if (task.state === 'running') {
    if (task.currentStep === 'queued' || task.currentStep === 'complete') {
      addIssue('currentStep', 'Running task requires an active processing step');
    }
    for (const field of [...leaseFields, ...attemptTimingFields]) {
      if (task[field] === null) {
        addIssue(field, 'Running task requires a complete lease and attempt timing');
      }
    }
    if (task.attemptCount < 1) {
      addIssue('attemptCount', 'Running task requires an attempt');
    }
    if (task.lastErrorCode !== null) {
      addIssue('lastErrorCode', 'Running task cannot retain an error');
    }
    if (task.softDeadlineAt !== null && task.leaseExpiresAt !== null
      && Date.parse(task.softDeadlineAt) >= Date.parse(task.leaseExpiresAt)) {
      addIssue('softDeadlineAt', 'Soft deadline must precede lease expiry');
    }
  } else {
    for (const field of leaseFields) {
      if (task[field] !== null) {
        addIssue(field, 'Only a running task can hold an active lease');
      }
    }
  }

  if (task.state === 'failed_retryable') {
    if (task.currentStep === 'queued' || task.currentStep === 'complete') {
      addIssue('currentStep', 'Retryable task requires an active processing step');
    }
    if (task.attemptCount < 1) {
      addIssue('attemptCount', 'Retryable task requires an attempt');
    }
    for (const field of attemptTimingFields) {
      if (task[field] === null) {
        addIssue(field, 'Retryable task requires complete attempt timing');
      }
    }
    if (task.lastErrorCode === null) {
      addIssue('lastErrorCode', 'Retryable task requires an error code');
    }
  }

  if (task.state === 'succeeded' || task.state === 'failed_terminal') {
    if (task.currentStep !== 'complete') {
      addIssue('currentStep', 'Terminal task must be complete');
    }
    if (task.attemptCount < 1) {
      addIssue('attemptCount', 'Terminal task requires an attempt');
    }
    for (const field of attemptTimingFields) {
      if (task[field] === null) {
        addIssue(field, 'Terminal task requires complete attempt timing');
      }
    }
    for (const field of capabilityFields) {
      if (task.outputs[field] === null) {
        addIssue('outputs', 'Terminal task requires capability outputs');
      }
    }
    if (task.completedAt === null) {
      addIssue('completedAt', 'Terminal task requires completedAt');
    }
  } else if (task.completedAt !== null) {
    addIssue('completedAt', 'Non-terminal task cannot be completed');
  }

  if (task.state === 'succeeded') {
    if (task.inputHash === null) {
      addIssue('inputHash', 'Succeeded task requires an input hash');
    }
    if (task.lastErrorCode !== null) {
      addIssue('lastErrorCode', 'Succeeded task cannot have an error');
    }
    if (capabilityFields.some((field) => task.outputs[field] === 'failed')) {
      addIssue('outputs', 'Succeeded task cannot have failed capability outputs');
    }
  }

  if (task.state === 'failed_terminal') {
    if (task.lastErrorCode === null) {
      addIssue('lastErrorCode', 'Terminal failure requires an error');
    }
    if (!capabilityFields.some((field) => task.outputs[field] === 'failed')) {
      addIssue('outputs', 'Terminal failure requires a failed capability output');
    }
  }
});

export const parseProcessingTask = (input) => ProcessingTaskSchema.parse(input);
