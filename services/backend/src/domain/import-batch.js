import { z } from 'zod';
import {
  CommonFields,
  IdSchema,
  IsoDateTimeSchema,
  ProcessorVersionSchema,
} from './common.js';
import { SourceDescriptorSchema, SourceTypeSchema } from './source-descriptor.js';

const CounterSchema = z.number().int().nonnegative();
const MAX_ORIGINAL_BYTES = 50 * 1024 * 1024;
const SUMMARY_STATE_FIELDS = [
  'running',
  'succeeded',
  'failedRetryable',
  'failedTerminal',
];
const ROUTING_STATE_FIELDS = ['drafting', 'approved', 'blocked', 'completed'];
const CAPABILITY_STATE_FIELDS = [
  'queued',
  'running',
  'completed',
  'insufficient',
  'unsupported',
  'failed',
  'billingUncertain',
];

const RoutingSummarySchema = z.strictObject({
  routerName: z.literal('fragment-routing'),
  routerVersion: ProcessorVersionSchema,
  policyVersion: ProcessorVersionSchema,
  eligible: CounterSchema,
  drafting: CounterSchema,
  approved: CounterSchema,
  blocked: CounterSchema,
  completed: CounterSchema,
  superseded: CounterSchema,
  updatedAt: IsoDateTimeSchema,
});

const CapabilitySummarySchema = z.strictObject({
  processorName: z.literal('capability-execution'),
  processorVersion: ProcessorVersionSchema,
  eligible: CounterSchema,
  queued: CounterSchema,
  running: CounterSchema,
  completed: CounterSchema,
  insufficient: CounterSchema,
  unsupported: CounterSchema,
  failed: CounterSchema,
  billingUncertain: CounterSchema,
  updatedAt: IsoDateTimeSchema,
});

function processingSummaryInvariant(summary, inputCount) {
  for (const field of ['eligible', ...SUMMARY_STATE_FIELDS, 'unsupportedCapabilities']) {
    if (!Number.isInteger(summary[field]) || summary[field] < 0) {
      return { field, message: `${field} must be a nonnegative integer` };
    }
  }
  for (const field of ['eligible', ...SUMMARY_STATE_FIELDS]) {
    if (summary[field] > inputCount) {
      return { field, message: `${field} cannot exceed inputCount` };
    }
  }
  const stateTotal = SUMMARY_STATE_FIELDS.reduce((total, field) => total + summary[field], 0);
  if (stateTotal !== summary.eligible) {
    return { field: 'eligible', message: 'Processing states must partition eligible work' };
  }
  if (summary.unsupportedCapabilities > summary.eligible * 3) {
    return {
      field: 'unsupportedCapabilities',
      message: 'Unsupported capabilities cannot exceed three per eligible Fragment',
    };
  }
  return null;
}

function processingSourceInvariant(summary, {
  finalized,
  uploadFailed,
  inputCount,
  needsReview,
}) {
  if (uploadFailed + summary.failedTerminal > inputCount) {
    return 'Upload and processing terminal failures cannot exceed inputCount';
  }
  if (needsReview > summary.succeeded) {
    return 'needsReview cannot exceed succeeded processing';
  }
  if (summary.succeeded + summary.failedTerminal > finalized) {
    return 'Processed and terminal contributions require finalized uploads';
  }
  if (summary.eligible > finalized) {
    return 'eligible cannot exceed finalized uploads';
  }
  return null;
}

export const UploadManifestItemSchema = z.strictObject({
  fragmentId: IdSchema,
  sourceType: SourceTypeSchema,
  state: z.enum(['pending', 'finalized', 'failed']),
  originalPath: z.string().min(1),
  declaredContentType: z.string().trim().min(1),
  declaredSizeBytes: z.number().int().positive().max(MAX_ORIGINAL_BYTES),
  allowedContentTypes: z.array(z.string().trim().min(1)).min(1).max(6).refine(
    (values) => new Set(values).size === values.length,
    'Content types must be unique',
  ),
  maxBytes: z.number().int().positive().max(MAX_ORIGINAL_BYTES),
  source: SourceDescriptorSchema,
  finalizedGeneration: z.string().trim().min(1).nullable(),
  failureCode: z.string().trim().min(1).max(128).nullable(),
}).superRefine((item, context) => {
  if (!item.allowedContentTypes.includes(item.declaredContentType)) {
    context.addIssue({
      code: 'custom',
      message: 'Declared content type must be allowed',
      path: ['declaredContentType'],
    });
  }
  if (item.declaredSizeBytes > item.maxBytes) {
    context.addIssue({
      code: 'custom',
      message: 'Declared size cannot exceed item maximum',
      path: ['declaredSizeBytes'],
    });
  }

  const hasGeneration = item.finalizedGeneration !== null;
  const hasFailure = item.failureCode !== null;
  const validState = (
    (item.state === 'pending' && !hasGeneration && !hasFailure)
    || (item.state === 'finalized' && hasGeneration && !hasFailure)
    || (item.state === 'failed' && hasGeneration && hasFailure)
  );
  if (!validState) {
    context.addIssue({
      code: 'custom',
      message: 'Upload outcome fields do not match item state',
      path: ['state'],
    });
  }
});

const UploadsSchema = z.record(IdSchema, UploadManifestItemSchema).refine((uploads) => {
  const count = Object.keys(uploads).length;
  return count >= 1 && count <= 50;
}, 'Import batch must contain between 1 and 50 uploads');

export function deriveImportBatchState(uploads, previousCounters, processingSummary = null) {
  const items = Object.values(uploads);
  if (items.length === 0) throw new TypeError('Import batch must contain uploads');

  const saved = items.filter(({ state }) => state === 'finalized').length;
  const failed = items.filter(({ state }) => state === 'failed').length;
  const pending = items.filter(({ state }) => state === 'pending').length;
  if (saved + failed + pending !== items.length) {
    throw new TypeError('Unknown upload item state');
  }

  const summary = processingSummary?.deterministic ?? null;
  const summaryInvariant = summary
    ? processingSummaryInvariant(summary, items.length)
    : null;
  if (summaryInvariant) throw new TypeError(summaryInvariant.message);
  const sourceInvariant = summary ? processingSourceInvariant(summary, {
    finalized: saved,
    uploadFailed: failed,
    inputCount: items.length,
    needsReview: previousCounters.needsReview,
  }) : null;
  if (sourceInvariant) throw new TypeError(sourceInvariant);
  const processed = summary?.succeeded ?? previousCounters.processed;
  const processingFailed = summary?.failedTerminal ?? 0;
  const totalFailed = failed + processingFailed;
  if (processed > saved) throw new TypeError('processed cannot exceed finalized uploads');
  if (previousCounters.needsReview > processed) {
    throw new TypeError('needsReview cannot exceed processed');
  }

  let status;
  let uploadStatus;
  if (pending > 0) {
    status = 'open';
    uploadStatus = 'pending';
  } else if (failed === items.length) {
    status = 'failed';
    uploadStatus = 'complete_with_errors';
  } else {
    uploadStatus = failed === 0 ? 'complete' : 'complete_with_errors';
    const terminal = summary ? summary.succeeded + summary.failedTerminal : 0;
    if (!summary || summary.eligible !== saved || terminal < summary.eligible) {
      status = 'processing';
    } else if (failed > 0 || summary.failedTerminal > 0) {
      status = 'completed_with_errors';
    } else {
      status = 'completed';
    }
  }

  return Object.freeze({
    status,
    uploadStatus,
    counters: Object.freeze({
      saved,
      processed,
      failed: totalFailed,
      needsReview: previousCounters.needsReview,
    }),
  });
}

export const ImportBatchSchema = z.strictObject({
  ...CommonFields,
  status: z.enum(['open', 'processing', 'completed', 'completed_with_errors', 'failed']),
  uploadStatus: z.enum(['pending', 'complete', 'complete_with_errors']),
  inputCount: z.number().int().positive().max(50),
  counters: z.strictObject({
    saved: CounterSchema,
    processed: CounterSchema,
    failed: CounterSchema,
    needsReview: CounterSchema,
  }),
  processingSummary: z.strictObject({
    deterministic: z.strictObject({
      processorName: z.literal('deterministic-media'),
      processorVersion: ProcessorVersionSchema,
      eligible: CounterSchema,
      running: CounterSchema,
      succeeded: CounterSchema,
      failedRetryable: CounterSchema,
      failedTerminal: CounterSchema,
      unsupportedCapabilities: CounterSchema,
      updatedAt: IsoDateTimeSchema,
    }),
  }).nullable(),
  routingSummary: RoutingSummarySchema.nullable(),
  capabilitySummary: CapabilitySummarySchema.nullable(),
  uploads: UploadsSchema,
}).superRefine((batch, context) => {
  for (const [name, count] of Object.entries(batch.counters)) {
    if (count > batch.inputCount) {
      context.addIssue({
        code: 'custom',
        message: `${name} cannot exceed inputCount`,
        path: ['counters', name],
      });
    }
  }

  let summaryInvariant = null;
  if (batch.processingSummary !== null) {
    const summary = batch.processingSummary.deterministic;
    summaryInvariant = processingSummaryInvariant(summary, batch.inputCount);
    if (summaryInvariant) {
      context.addIssue({
        code: 'custom',
        message: summaryInvariant.message,
        path: ['processingSummary', 'deterministic', summaryInvariant.field],
      });
    }
  }

  if (batch.routingSummary !== null) {
    const summary = batch.routingSummary;
    const currentTotal = ROUTING_STATE_FIELDS.reduce(
      (total, field) => total + summary[field],
      0,
    );
    if (summary.eligible > batch.inputCount) {
      context.addIssue({
        code: 'custom',
        message: 'Routing eligible cannot exceed inputCount',
        path: ['routingSummary', 'eligible'],
      });
    }
    if (currentTotal !== summary.eligible) {
      context.addIssue({
        code: 'custom',
        message: 'Routing states must partition eligible work',
        path: ['routingSummary', 'eligible'],
      });
    }
  }

  if (batch.capabilitySummary !== null) {
    const summary = batch.capabilitySummary;
    const currentTotal = CAPABILITY_STATE_FIELDS.reduce(
      (total, field) => total + summary[field],
      0,
    );
    if (summary.eligible > batch.inputCount) {
      context.addIssue({
        code: 'custom',
        message: 'Capability eligible cannot exceed inputCount',
        path: ['capabilitySummary', 'eligible'],
      });
    }
    if (currentTotal !== summary.eligible) {
      context.addIssue({
        code: 'custom',
        message: 'Capability states must partition eligible work',
        path: ['capabilitySummary', 'eligible'],
      });
    }
  }

  if (batch.counters.needsReview > batch.counters.processed) {
    context.addIssue({
      code: 'custom',
      message: 'needsReview cannot exceed processed',
      path: ['counters', 'needsReview'],
    });
  }

  const entries = Object.entries(batch.uploads);
  if (batch.inputCount !== entries.length) {
    context.addIssue({
      code: 'custom',
      message: 'inputCount must equal upload count',
      path: ['inputCount'],
    });
  }

  for (const [fragmentId, item] of entries) {
    if (item.fragmentId !== fragmentId) {
      context.addIssue({
        code: 'custom',
        message: 'Upload key must equal fragmentId',
        path: ['uploads', fragmentId, 'fragmentId'],
      });
    }
    const expectedPath = `users/${batch.ownerId}/originals/${batch.id}/${fragmentId}`;
    if (item.originalPath !== expectedPath) {
      context.addIssue({
        code: 'custom',
        message: 'Upload path must match owner, batch and fragment',
        path: ['uploads', fragmentId, 'originalPath'],
      });
    }
  }

  if (summaryInvariant) return;

  let derived;
  try {
    derived = deriveImportBatchState(
      batch.uploads,
      batch.counters,
      batch.processingSummary,
    );
  } catch (error) {
    context.addIssue({
      code: 'custom',
      message: error instanceof Error ? error.message : 'Invalid processing source bounds',
      path: ['processingSummary', 'deterministic'],
    });
    return;
  }
  for (const field of ['status', 'uploadStatus']) {
    if (batch[field] !== derived[field]) {
      context.addIssue({
        code: 'custom',
        message: `${field} does not match upload states`,
        path: [field],
      });
    }
  }
  for (const field of ['saved', 'processed', 'failed']) {
    if (batch.counters[field] !== derived.counters[field]) {
      context.addIssue({
        code: 'custom',
        message: `${field} counter does not match upload states`,
        path: ['counters', field],
      });
    }
  }
});

export const parseImportBatch = (input) => ImportBatchSchema.parse(input);
