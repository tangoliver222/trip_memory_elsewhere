import { z } from 'zod';
import {
  IdSchema,
  IsoDateTimeSchema,
  ProcessorVersionSchema,
} from './common.js';

export const CapabilityStatusSchema = z.enum([
  'complete',
  'partial',
  'unsupported',
  'failed',
]);

export const NullableCapabilityStatusSchema = CapabilityStatusSchema.nullable();

export const PROCESSING_WARNING_CODES = Object.freeze([
  'processing/page-count-unsupported',
  'processing/near-scan-truncated',
  'processing/fact-conflict',
]);

export const ProcessingWarningCodeSchema = z.enum(PROCESSING_WARNING_CODES);

export const WarningCodesSchema = z.array(ProcessingWarningCodeSchema).refine(
  (codes) => new Set(codes).size === codes.length,
  'Warning codes must be unique',
);

const NullableTextSchema = z.string().trim().min(1).nullable();
const NullablePositiveNumberSchema = z.number().positive().nullable();

export const TechnicalMetadataSchema = z.strictObject({
  format: z.enum(['jpeg', 'png', 'webp', 'heic', 'heif', 'pdf', 'text']),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  orientation: z.number().int().min(1).max(8).nullable(),
  pageCount: z.number().int().positive().nullable(),
  cameraMake: NullableTextSchema,
  cameraModel: NullableTextSchema,
  lensModel: NullableTextSchema,
  focalLengthMm: NullablePositiveNumberSchema,
  apertureFNumber: NullablePositiveNumberSchema,
  isoEquivalent: z.number().int().positive().nullable(),
  exposureTimeSeconds: NullablePositiveNumberSchema,
  metadataStatus: CapabilityStatusSchema,
  warningCodes: WarningCodesSchema,
  processorVersion: ProcessorVersionSchema,
}).superRefine((metadata, context) => {
  if (metadata.format !== 'pdf') return;
  if (metadata.pageCount !== null) {
    context.addIssue({
      code: 'custom',
      message: 'PDF pageCount must remain unknown',
      path: ['pageCount'],
    });
  }
  if (!metadata.warningCodes.includes('processing/page-count-unsupported')) {
    context.addIssue({
      code: 'custom',
      message: 'PDF metadata must record unsupported page count',
      path: ['warningCodes'],
    });
  }
});

export const ThumbnailDerivativeSchema = z.strictObject({
  path: z.string().min(1),
  generation: z.string().trim().min(1),
  metageneration: z.string().trim().min(1),
  contentType: z.literal('image/webp'),
  sizeBytes: z.number().int().positive(),
  crc32c: z.string().trim().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const DeterministicFragmentProcessingSchema = z.strictObject({
  taskId: IdSchema,
  processorName: z.literal('deterministic-media'),
  processorVersion: ProcessorVersionSchema,
  state: z.enum([
    'pending',
    'running',
    'succeeded',
    'failed_retryable',
    'failed_terminal',
  ]),
  metadataStatus: NullableCapabilityStatusSchema,
  thumbnailStatus: NullableCapabilityStatusSchema,
  perceptualHashStatus: NullableCapabilityStatusSchema,
  updatedAt: IsoDateTimeSchema,
});
