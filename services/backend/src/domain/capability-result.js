import { z } from 'zod';
import {
  CommonFields,
  IdSchema,
  ProcessorVersionSchema,
} from './common.js';
import { ROUTING_CAPABILITIES, RoutingSourceRevisionSchema } from './route-plan.js';

export const CAPABILITY_RESULT_OUTCOMES = Object.freeze([
  'completed',
  'insufficient_input',
  'unsupported',
]);

const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;
const MicrosSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const VersionLabelSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
const typedReference = (type) => z.strictObject({ type: z.literal(type), id: IdSchema });
const sortedUnique = (schema, maximum) => z.array(schema).max(maximum).superRefine(
  (values, context) => {
    const sorted = [...new Set(values)].sort();
    if (sorted.length !== values.length
      || values.some((value, index) => value !== sorted[index])) {
      context.addIssue({ code: 'custom', message: 'Values must be unique and sorted' });
    }
  },
);

export const CapabilityArtifactRefSchema = z.strictObject({
  kind: z.enum(['provider', 'normalized']),
  bucket: z.string().trim().min(1).max(256),
  objectName: z.string().trim().min(1).max(1_024),
  generation: z.string().regex(/^[1-9][0-9]*$/),
  contentType: z.literal('application/gzip'),
  sizeBytes: z.number().int().positive().max(MAX_ARTIFACT_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

const QualitySummarySchema = z.strictObject({
  averageConfidence: z.number().min(0).max(1).nullable(),
  defectCodes: sortedUnique(
    z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/),
    32,
  ),
});

const SuggestedFactKeySchema = z.enum([
  'ocrLanguageCodes',
  'ocrPageCount',
  'ocrQualitySummary',
  'ocrResultRef',
]);

export const CapabilityResultSchema = z.strictObject({
  ...CommonFields,
  executionRef: typedReference('capabilityExecution'),
  routePlanRef: typedReference('routePlan'),
  routePlanRevision: z.number().int().positive().max(5),
  fragmentRef: typedReference('fragment'),
  sourceRevision: RoutingSourceRevisionSchema,
  capability: z.enum(ROUTING_CAPABILITIES),
  executorName: VersionLabelSchema,
  executorVersion: ProcessorVersionSchema,
  providerName: VersionLabelSchema,
  providerVersion: VersionLabelSchema,
  processorAuditId: IdSchema,
  endpointRegion: VersionLabelSchema,
  outcome: z.enum(CAPABILITY_RESULT_OUTCOMES),
  providerArtifactRef: CapabilityArtifactRefSchema.nullable(),
  normalizedArtifactRef: CapabilityArtifactRefSchema.nullable(),
  requestCount: z.number().int().nonnegative().max(1),
  pageCount: z.number().int().nonnegative().max(15),
  taskDeliveryCount: z.number().int().nonnegative().max(1_000),
  pricingVersion: VersionLabelSchema,
  estimatedCostMicros: MicrosSchema,
  actualCostMicros: MicrosSchema,
  qualitySummary: QualitySummarySchema.nullable(),
  suggestedFactKeys: sortedUnique(SuggestedFactKeySchema, 4),
}).superRefine((result, context) => {
  const unsupported = result.outcome === 'unsupported';
  const hasArtifacts = result.providerArtifactRef !== null
    && result.normalizedArtifactRef !== null;
  if (unsupported !== !hasArtifacts) {
    context.addIssue({ code: 'custom', message: 'Artifacts do not match result outcome' });
  }
  if ((result.providerArtifactRef !== null && result.providerArtifactRef.kind !== 'provider')
    || (result.normalizedArtifactRef !== null
      && result.normalizedArtifactRef.kind !== 'normalized')) {
    context.addIssue({ code: 'custom', message: 'Artifact roles are invalid' });
  }
  const expectedPrefix = `users/${result.ownerId}/capability-results/${result.executionRef.id}/`;
  for (const artifact of [result.providerArtifactRef, result.normalizedArtifactRef]) {
    if (artifact !== null && !artifact.objectName.startsWith(expectedPrefix)) {
      context.addIssue({ code: 'custom', message: 'Artifact path is outside execution scope' });
    }
  }
  if (unsupported) {
    if (result.requestCount !== 0
      || result.pageCount !== 0
      || result.estimatedCostMicros !== 0
      || result.actualCostMicros !== 0
      || result.qualitySummary !== null
      || result.suggestedFactKeys.length !== 0) {
      context.addIssue({ code: 'custom', message: 'Unsupported result cannot report usage' });
    }
  } else if (result.requestCount !== 1
    || result.pageCount < 1
    || result.qualitySummary === null
    || result.actualCostMicros > result.estimatedCostMicros) {
    context.addIssue({ code: 'custom', message: 'Provider result usage is invalid' });
  }
});

export const parseCapabilityResult = (input) => CapabilityResultSchema.parse(input);
