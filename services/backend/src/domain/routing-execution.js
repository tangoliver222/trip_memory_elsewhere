import { z } from 'zod';
import { CommonFields, IdSchema, IsoDateTimeSchema, ProcessorVersionSchema } from './common.js';
import { ROUTING_CAPABILITIES } from './route-plan.js';

const typedReference = (type) => z.strictObject({
  type: z.literal(type),
  id: IdSchema,
});

const MicrosSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const CapabilitySchema = z.enum(ROUTING_CAPABILITIES);
const CodeSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/);
const NullableInstantSchema = IsoDateTimeSchema.nullable();

const ReasonCodesSchema = z.array(CodeSchema).min(1).max(32).superRefine((codes, context) => {
  if (new Set(codes).size !== codes.length) {
    context.addIssue({ code: 'custom', message: 'Reason codes must be unique' });
  }
  const sorted = [...codes].sort();
  if (codes.some((code, index) => code !== sorted[index])) {
    context.addIssue({ code: 'custom', message: 'Reason codes must be sorted' });
  }
});

export const BudgetLedgerSchema = z.strictObject({
  ...CommonFields,
  scope: z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('user_day'), key: z.string().date() }),
    z.strictObject({ type: z.literal('batch'), key: IdSchema }),
    z.strictObject({ type: z.literal('route'), key: IdSchema }),
    z.strictObject({ type: z.literal('capability'), key: CapabilitySchema }),
  ]),
  currency: z.literal('USD'),
  ceilingMicros: MicrosSchema.positive(),
  reservedMicros: MicrosSchema,
  spentMicros: MicrosSchema,
  policyVersion: ProcessorVersionSchema,
  costModelVersion: ProcessorVersionSchema,
}).superRefine((ledger, context) => {
  if (ledger.reservedMicros + ledger.spentMicros > ledger.ceilingMicros) {
    context.addIssue({
      code: 'custom',
      message: 'Reserved and spent cost cannot exceed ceiling',
      path: ['reservedMicros'],
    });
  }
});

export const BudgetReservationSchema = z.strictObject({
  ...CommonFields,
  routePlanRef: typedReference('routePlan'),
  capability: CapabilitySchema,
  estimatedCostMicros: MicrosSchema.positive(),
  ceilingMicros: MicrosSchema.positive(),
  currency: z.literal('USD'),
  costModelVersion: ProcessorVersionSchema,
  maxBillableAttempts: z.number().int().positive().max(5),
  ledgerRefs: z.array(typedReference('budgetLedger')).min(1).max(4),
  state: z.enum(['reserved', 'settled', 'released', 'expired']),
  reservedAt: IsoDateTimeSchema,
  settledAt: NullableInstantSchema,
  releasedAt: NullableInstantSchema,
}).superRefine((reservation, context) => {
  if (reservation.estimatedCostMicros > reservation.ceilingMicros) {
    context.addIssue({
      code: 'custom',
      message: 'Estimated cost cannot exceed ceiling',
      path: ['estimatedCostMicros'],
    });
  }
  const validState = (
    (reservation.state === 'reserved'
      && reservation.settledAt === null
      && reservation.releasedAt === null)
    || (reservation.state === 'settled'
      && reservation.settledAt !== null
      && reservation.releasedAt === null)
    || (['released', 'expired'].includes(reservation.state)
      && reservation.settledAt === null
      && reservation.releasedAt !== null)
  );
  if (!validState) {
    context.addIssue({ code: 'custom', message: 'Reservation lifecycle is invalid' });
  }
});

const UsageSchema = z.record(z.string().min(1), z.number().nonnegative()).refine(
  (usage) => Object.keys(usage).length > 0,
  'Provider usage cannot be empty',
);

const ProviderReceiptSchema = z.strictObject({
  providerRequestId: z.string().trim().min(1).max(256),
  usage: UsageSchema,
  actualCostMicros: MicrosSchema,
  receivedAt: IsoDateTimeSchema,
});

export const CapabilityExecutionSchema = z.strictObject({
  ...CommonFields,
  routePlanRef: typedReference('routePlan'),
  reservationRef: typedReference('budgetReservation'),
  capability: CapabilitySchema,
  executorName: z.string().trim().min(1).max(128),
  executorVersion: ProcessorVersionSchema,
  idempotencyKey: IdSchema,
  state: z.enum([
    'reserved',
    'claimed',
    'calling',
    'provider_succeeded',
    'settling',
    'completed',
    'failed',
    'billing_uncertain',
  ]),
  billableAttempts: z.number().int().nonnegative().max(5),
  receipt: ProviderReceiptSchema.nullable(),
  resultRef: typedReference('capabilityResult').nullable(),
  errorCode: CodeSchema.nullable(),
  startedAt: NullableInstantSchema,
  completedAt: NullableInstantSchema,
}).superRefine((execution, context) => {
  const withReceipt = ['provider_succeeded', 'settling', 'completed'];
  if (withReceipt.includes(execution.state) !== (execution.receipt !== null)) {
    context.addIssue({ code: 'custom', message: 'Execution receipt does not match state' });
  }
  if (execution.state === 'completed') {
    if (execution.completedAt === null || execution.resultRef === null) {
      context.addIssue({ code: 'custom', message: 'Completed execution requires result' });
    }
  } else if (['failed', 'billing_uncertain'].includes(execution.state)) {
    if (execution.completedAt === null || execution.errorCode === null) {
      context.addIssue({ code: 'custom', message: 'Terminal execution requires error' });
    }
  } else if (execution.completedAt !== null) {
    context.addIssue({ code: 'custom', message: 'Active execution cannot be completed' });
  }
});

export const EscalationRequestSchema = z.strictObject({
  ...CommonFields,
  fromRoutePlanRef: typedReference('routePlan'),
  fromCapability: CapabilitySchema,
  outcome: z.enum(['unsupported', 'insufficient_input']),
  reasonCodes: ReasonCodesSchema,
  producedFactRefs: z.array(typedReference('capabilityResult')).max(32),
  requestedCapability: CapabilitySchema,
  state: z.enum(['pending', 'resolved', 'rejected']),
  resolvedByPlanRef: typedReference('routePlan').nullable(),
}).superRefine((request, context) => {
  if ((request.state === 'resolved') !== (request.resolvedByPlanRef !== null)) {
    context.addIssue({
      code: 'custom',
      message: 'Resolved request requires the resolving plan',
      path: ['resolvedByPlanRef'],
    });
  }
});

export const parseBudgetLedger = (input) => BudgetLedgerSchema.parse(input);
export const parseBudgetReservation = (input) => BudgetReservationSchema.parse(input);
export const parseCapabilityExecution = (input) => CapabilityExecutionSchema.parse(input);
export const parseEscalationRequest = (input) => EscalationRequestSchema.parse(input);
