import { z } from 'zod';
import { CommonFields, IdSchema, IsoDateTimeSchema, ProcessorVersionSchema } from './common.js';
import { RoutingSourceRevisionSchema } from './route-plan.js';

export const ROUTING_ROLES = Object.freeze([
  'independent',
  'representative',
  'supporting',
]);

export const ROUTING_COHORT_TYPES = Object.freeze([
  'exact_duplicate',
  'near_duplicate',
  'burst',
  'same_time_place',
  'document_sequence',
]);

const FragmentReferenceSchema = z.strictObject({
  type: z.literal('fragment'),
  id: IdSchema,
});

const CodeSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/);
const WarningCodeSchema = z.string().regex(
  /^(?:[a-z0-9][a-z0-9-]{1,63}|routing\/[a-z0-9][a-z0-9-]{1,55})$/,
);

function sortedUniqueReferences(max) {
  return z.array(FragmentReferenceSchema).max(max).superRefine((refs, context) => {
    const ids = refs.map(({ id }) => id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: 'custom', message: 'References must be unique' });
    }
    const sorted = [...ids].sort();
    if (ids.some((id, index) => id !== sorted[index])) {
      context.addIssue({ code: 'custom', message: 'References must be sorted' });
    }
  });
}

function codesSchema(schema) {
  return z.array(schema).max(32).superRefine((codes, context) => {
    if (new Set(codes).size !== codes.length) {
      context.addIssue({ code: 'custom', message: 'Codes must be unique' });
    }
    const sorted = [...codes].sort();
    if (codes.some((code, index) => code !== sorted[index])) {
      context.addIssue({ code: 'custom', message: 'Codes must be sorted' });
    }
  });
}

const CodesSchema = codesSchema(CodeSchema);
const WarningCodesSchema = codesSchema(WarningCodeSchema);

export const RoutingCohortSchema = z.strictObject({
  ...CommonFields,
  type: z.enum(ROUTING_COHORT_TYPES),
  revision: z.number().int().positive(),
  inputRevisionRefs: z.array(z.strictObject({
    fragmentRef: FragmentReferenceSchema,
    sourceRevision: RoutingSourceRevisionSchema,
  })).min(2).max(200),
  memberRefs: sortedUniqueReferences(200).refine(
    (refs) => refs.length >= 2,
    'Cohort requires at least two members',
  ),
  representativeRefs: sortedUniqueReferences(2),
  selector: z.strictObject({
    name: z.literal('deterministic-representative'),
    version: ProcessorVersionSchema,
  }),
  basisCodes: CodesSchema.refine((codes) => codes.length > 0, 'Basis is required'),
  warningCodes: WarningCodesSchema,
  state: z.enum(['open', 'resolved', 'superseded']),
  resolvedAt: IsoDateTimeSchema.nullable(),
}).superRefine((cohort, context) => {
  const inputIds = cohort.inputRevisionRefs.map(({ fragmentRef }) => fragmentRef.id);
  const memberIds = cohort.memberRefs.map(({ id }) => id);
  if (inputIds.some((id, index) => id !== memberIds[index])) {
    context.addIssue({
      code: 'custom',
      message: 'Input revisions must align with sorted members',
      path: ['inputRevisionRefs'],
    });
  }
  const members = new Set(memberIds);
  if (cohort.representativeRefs.some(({ id }) => !members.has(id))) {
    context.addIssue({
      code: 'custom',
      message: 'Representatives must be cohort members',
      path: ['representativeRefs'],
    });
  }
  if (cohort.state === 'open') {
    if (cohort.resolvedAt !== null || cohort.representativeRefs.length !== 0) {
      context.addIssue({ code: 'custom', message: 'Open cohort cannot be resolved' });
    }
  } else if (cohort.resolvedAt === null || cohort.representativeRefs.length === 0) {
    context.addIssue({ code: 'custom', message: 'Resolved cohort requires representatives' });
  }
});

export const parseRoutingCohort = (input) => RoutingCohortSchema.parse(input);
