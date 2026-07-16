import { z } from 'zod';
import { CommonFields, IdSchema, IsoDateTimeSchema } from './common.js';
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

const NullableDateTimeSchema = IsoDateTimeSchema.nullable();

export const ProcessingTaskSchema = z.strictObject({
  ...CommonFields,
  fragmentId: IdSchema,
  batchId: IdSchema,
  processorName: z.literal('deterministic-media'),
  processorVersion: z.literal('v1'),
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
  lastErrorCode: z.string().trim().min(1).nullable(),
  firstStartedAt: NullableDateTimeSchema,
  attemptStartedAt: NullableDateTimeSchema,
  lastHeartbeatAt: NullableDateTimeSchema,
  softDeadlineAt: NullableDateTimeSchema,
  leaseAcquiredAt: NullableDateTimeSchema,
  leaseExpiresAt: NullableDateTimeSchema,
  completedAt: NullableDateTimeSchema,
}).superRefine((task, context) => {
  const activeLeaseFields = [
    ['leaseOwner', task.leaseOwner],
    ['leaseAcquiredAt', task.leaseAcquiredAt],
    ['leaseExpiresAt', task.leaseExpiresAt],
  ];

  if (task.state === 'pending') {
    if (task.attemptCount !== 0) {
      context.addIssue({
        code: 'custom',
        message: 'Pending task cannot have attempts',
        path: ['attemptCount'],
      });
    }
    for (const [field, value] of activeLeaseFields) {
      if (value !== null) {
        context.addIssue({
          code: 'custom',
          message: 'Pending task cannot hold a lease',
          path: [field],
        });
      }
    }
  }

  if (task.state === 'running') {
    for (const [field, value] of [
      ...activeLeaseFields,
      ['firstStartedAt', task.firstStartedAt],
      ['attemptStartedAt', task.attemptStartedAt],
      ['lastHeartbeatAt', task.lastHeartbeatAt],
      ['softDeadlineAt', task.softDeadlineAt],
    ]) {
      if (value === null) {
        context.addIssue({
          code: 'custom',
          message: 'Running task requires a complete lease and attempt timing',
          path: [field],
        });
      }
    }
    if (task.attemptCount < 1) {
      context.addIssue({
        code: 'custom',
        message: 'Running task requires an attempt',
        path: ['attemptCount'],
      });
    }
    if (task.softDeadlineAt !== null && task.leaseExpiresAt !== null
      && Date.parse(task.softDeadlineAt) >= Date.parse(task.leaseExpiresAt)) {
      context.addIssue({
        code: 'custom',
        message: 'Soft deadline must precede lease expiry',
        path: ['softDeadlineAt'],
      });
    }
  } else if (task.leaseOwner !== null || task.leaseExpiresAt !== null) {
    context.addIssue({
      code: 'custom',
      message: 'Only a running task can hold an active lease',
      path: ['leaseOwner'],
    });
  }

  if (task.state === 'failed_retryable') {
    if (task.completedAt !== null) {
      context.addIssue({
        code: 'custom',
        message: 'Retryable task cannot be completed',
        path: ['completedAt'],
      });
    }
    if (task.lastErrorCode === null) {
      context.addIssue({
        code: 'custom',
        message: 'Retryable task requires an error code',
        path: ['lastErrorCode'],
      });
    }
  }

  if (task.state === 'succeeded' || task.state === 'failed_terminal') {
    if (task.completedAt === null) {
      context.addIssue({
        code: 'custom',
        message: 'Terminal task requires completedAt',
        path: ['completedAt'],
      });
    }
  } else if (task.completedAt !== null) {
    context.addIssue({
      code: 'custom',
      message: 'Non-terminal task cannot be completed',
      path: ['completedAt'],
    });
  }
});

export const parseProcessingTask = (input) => ProcessingTaskSchema.parse(input);
