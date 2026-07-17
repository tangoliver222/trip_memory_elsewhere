import { z } from 'zod';
import {
  CommonFields,
  IdSchema,
  IsoDateTimeSchema,
  ProcessorVersionSchema,
} from './common.js';

export const ROUTE_PLAN_STATES = Object.freeze([
  'draft',
  'approved',
  'executing',
  'completed',
  'superseded',
  'rejected',
]);

export const CAPABILITY_DECISIONS = Object.freeze([
  'approved',
  'skipped',
  'deferred',
  'blocked',
]);

export const ROUTING_CAPABILITIES = Object.freeze([
  'ocr',
  'places',
  'embedding',
  'gemini',
]);

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const CodeSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/);
const RouteReasonSchema = z.string().regex(
  /^(?:[a-z0-9][a-z0-9-]{1,63}|routing\/[a-z0-9][a-z0-9-]{1,55})$/,
);

function uniqueSorted(schema, { min = 0, max = 32, key = (value) => value } = {}) {
  return z.array(schema).min(min).max(max).superRefine((values, context) => {
    const keys = values.map(key);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({ code: 'custom', message: 'Values must be unique' });
    }
    const sorted = [...keys].sort();
    if (keys.some((value, index) => value !== sorted[index])) {
      context.addIssue({ code: 'custom', message: 'Values must be sorted' });
    }
  });
}

const typedReference = (type) => z.strictObject({
  type: z.literal(type),
  id: IdSchema,
});

export const RoutingSourceRevisionSchema = z.strictObject({
  bucket: z.string().trim().min(1),
  objectName: z.string().min(1),
  generation: z.string().trim().min(1),
  inputHash: z.string().regex(SHA256_PATTERN).nullable(),
});

const CapabilityScopeSchema = z.enum(['self', 'representative', 'cohort']);
const ExecutorClassSchema = z.enum([
  'document-ocr',
  'places-resolution',
  'multimodal-embedding',
  'gemini-multimodal',
]);

export const CapabilityBudgetSchema = z.strictObject({
  class: z.literal('standard'),
  currency: z.literal('USD'),
  estimatedMicros: z.number().int().positive(),
  ceilingMicros: z.number().int().positive(),
  maxBillableAttempts: z.number().int().positive().max(5),
}).superRefine((budget, context) => {
  if (budget.estimatedMicros > budget.ceilingMicros) {
    context.addIssue({
      code: 'custom',
      message: 'Estimated cost cannot exceed ceiling',
      path: ['estimatedMicros'],
    });
  }
});

const CapabilityBase = {
  scope: CapabilityScopeSchema,
  reasonCodes: uniqueSorted(CodeSchema, { min: 1 }),
};

export const CapabilityDecisionSchema = z.discriminatedUnion('decision', [
  z.strictObject({
    ...CapabilityBase,
    decision: z.literal('approved'),
    executorClass: ExecutorClassSchema,
    budget: CapabilityBudgetSchema,
  }),
  z.strictObject({
    ...CapabilityBase,
    decision: z.literal('skipped'),
    executorClass: z.null(),
    budget: z.null(),
  }),
  z.strictObject({
    ...CapabilityBase,
    decision: z.literal('deferred'),
    executorClass: z.null(),
    reconsiderOn: uniqueSorted(CodeSchema, { min: 1 }),
    budget: z.null(),
  }),
  z.strictObject({
    ...CapabilityBase,
    decision: z.literal('blocked'),
    executorClass: z.null(),
    budget: z.null(),
  }),
]);

const CapabilitiesSchema = z.strictObject(Object.fromEntries(
  ROUTING_CAPABILITIES.map((capability) => [capability, CapabilityDecisionSchema]),
));

export const RoutePlanSchema = z.strictObject({
  ...CommonFields,
  fragmentRef: typedReference('fragment'),
  batchRef: typedReference('importBatch'),
  sourceRevision: RoutingSourceRevisionSchema,
  router: z.strictObject({
    name: z.literal('fragment-routing'),
    version: ProcessorVersionSchema,
    policyVersion: ProcessorVersionSchema,
    costModelVersion: ProcessorVersionSchema,
  }),
  revision: z.number().int().positive(),
  state: z.enum(ROUTE_PLAN_STATES),
  inputs: z.strictObject({
    deterministicTaskId: IdSchema,
    deterministicProcessorName: z.literal('deterministic-media'),
    deterministicProcessorVersion: ProcessorVersionSchema,
    cohortRevisionIds: uniqueSorted(IdSchema, { max: 32 }),
    userDecisionVersion: z.number().int().nonnegative(),
  }),
  classification: z.strictObject({
    mediaKind: z.enum(['image', 'document', 'text']),
    documentKind: z.enum([
      'receipt',
      'ticket',
      'menu',
      'screenshot',
      'pdf',
    ]).nullable(),
    confidence: z.number().min(0).max(1),
    basis: uniqueSorted(CodeSchema, { min: 1 }),
  }),
  representation: z.strictObject({
    role: z.enum(['independent', 'representative', 'supporting']),
    representativeRef: typedReference('fragment'),
    cohortRefs: uniqueSorted(typedReference('routingCohort'), {
      max: 32,
      key: ({ id }) => id,
    }),
    reasonCodes: uniqueSorted(CodeSchema, { min: 1 }),
  }),
  capabilities: CapabilitiesSchema,
  priority: z.enum(['low', 'normal', 'high']),
  budgetClass: z.enum(['deterministic_only', 'standard']),
  routeReasons: uniqueSorted(RouteReasonSchema, { min: 1 }),
  approvedAt: IsoDateTimeSchema.nullable(),
  completedAt: IsoDateTimeSchema.nullable(),
  supersededAt: IsoDateTimeSchema.nullable(),
  rejectedAt: IsoDateTimeSchema.nullable(),
}).superRefine((plan, context) => {
  const issue = (path, message) => context.addIssue({
    code: 'custom',
    message,
    path: [path],
  });
  const approvedCapabilities = Object.values(plan.capabilities)
    .filter(({ decision }) => decision === 'approved');

  if (approvedCapabilities.length > 0 && plan.sourceRevision.inputHash === null) {
    issue('sourceRevision', 'Approved capabilities require an input hash');
  }
  if (plan.budgetClass === 'deterministic_only' && approvedCapabilities.length > 0) {
    issue('budgetClass', 'Deterministic-only plans cannot approve capabilities');
  }
  if (plan.budgetClass === 'standard' && approvedCapabilities.length === 0) {
    issue('budgetClass', 'Standard plans require an approved capability');
  }
  if (plan.representation.role === 'supporting'
    && plan.representation.representativeRef.id === plan.fragmentRef.id) {
    issue('representation', 'Supporting Fragment requires a different representative');
  }
  if (plan.representation.role !== 'supporting'
    && plan.representation.representativeRef.id !== plan.fragmentRef.id) {
    issue('representation', 'Independent and representative plans point to self');
  }

  const fields = {
    approvedAt: plan.approvedAt,
    completedAt: plan.completedAt,
    supersededAt: plan.supersededAt,
    rejectedAt: plan.rejectedAt,
  };
  const only = (...present) => Object.entries(fields).every(([name, value]) => (
    present.includes(name) ? value !== null : value === null
  ));
  const lifecycleValid = (
    (plan.state === 'draft' && only())
    || (['approved', 'executing'].includes(plan.state) && only('approvedAt'))
    || (plan.state === 'completed' && only('approvedAt', 'completedAt'))
    || (plan.state === 'superseded' && only('approvedAt', 'supersededAt'))
    || (plan.state === 'rejected' && only('rejectedAt'))
  );
  if (!lifecycleValid) issue('state', 'RoutePlan lifecycle fields do not match state');
});

export const RoutingHeadSchema = z.strictObject({
  ...CommonFields,
  fragmentRef: typedReference('fragment'),
  routerName: z.literal('fragment-routing'),
  currentPlanRef: typedReference('routePlan'),
  currentRevision: z.number().int().positive(),
  sourceRevision: RoutingSourceRevisionSchema,
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function routePlanImmutablePayload(input) {
  const plan = RoutePlanSchema.parse(input);
  return deepFreeze(structuredClone({
    fragmentRef: plan.fragmentRef,
    batchRef: plan.batchRef,
    sourceRevision: plan.sourceRevision,
    router: plan.router,
    revision: plan.revision,
    inputs: plan.inputs,
    classification: plan.classification,
    representation: plan.representation,
    capabilities: plan.capabilities,
    priority: plan.priority,
    budgetClass: plan.budgetClass,
    routeReasons: plan.routeReasons,
  }));
}

export const parseRoutePlan = (input) => RoutePlanSchema.parse(input);
export const parseRoutingHead = (input) => RoutingHeadSchema.parse(input);
