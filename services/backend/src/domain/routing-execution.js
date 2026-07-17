import { z } from 'zod';
import { CommonFields, IdSchema, IsoDateTimeSchema, ProcessorVersionSchema } from './common.js';
import { ROUTING_CAPABILITIES, RoutingSourceRevisionSchema } from './route-plan.js';

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
    z.strictObject({
      type: z.literal('capability'),
      key: CapabilitySchema,
      routePlanId: IdSchema,
    }),
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
  actualCostMicros: MicrosSchema.nullable(),
  settledAt: NullableInstantSchema,
  releasedAt: NullableInstantSchema,
  releaseReasonCode: CodeSchema.nullable(),
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
      && reservation.actualCostMicros === null
      && reservation.settledAt === null
      && reservation.releasedAt === null
      && reservation.releaseReasonCode === null)
    || (reservation.state === 'settled'
      && reservation.actualCostMicros !== null
      && reservation.settledAt !== null
      && reservation.releasedAt === null
      && reservation.releaseReasonCode === null)
    || (['released', 'expired'].includes(reservation.state)
      && reservation.actualCostMicros === null
      && reservation.settledAt === null
      && reservation.releasedAt !== null
      && reservation.releaseReasonCode !== null)
  );
  if (!validState) {
    context.addIssue({ code: 'custom', message: 'Reservation lifecycle is invalid' });
  }
});

const VersionLabelSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);

export const ProviderReceiptSchema = z.strictObject({
  clientRequestId: IdSchema,
  providerRequestId: z.string().trim().min(1).max(256).nullable(),
  requestCount: z.literal(1),
  taskDeliveryCount: z.number().int().nonnegative().max(1_000),
  pricingVersion: VersionLabelSchema,
  estimatedPages: z.literal(1),
  actualPages: z.literal(1),
  estimatedCostMicros: MicrosSchema,
  actualCostMicros: MicrosSchema,
  receivedAt: IsoDateTimeSchema,
});

export const CAPABILITY_EXECUTION_STATES = Object.freeze([
  'reserved',
  'queued',
  'claimed',
  'calling',
  'provider_succeeded',
  'settling',
  'completed',
  'failed_retryable',
  'failed_terminal',
  'billing_uncertain',
]);

export const CapabilityExecutionSchema = z.strictObject({
  ...CommonFields,
  routePlanRef: typedReference('routePlan'),
  routePlanRevision: z.number().int().positive().max(5),
  reservationRef: typedReference('budgetReservation'),
  fragmentRef: typedReference('fragment'),
  sourceRevision: RoutingSourceRevisionSchema,
  capability: CapabilitySchema,
  executorName: VersionLabelSchema,
  executorVersion: ProcessorVersionSchema,
  providerName: VersionLabelSchema,
  providerVersion: VersionLabelSchema,
  idempotencyKey: IdSchema,
  state: z.enum(CAPABILITY_EXECUTION_STATES),
  taskName: IdSchema.nullable(),
  queuedAt: NullableInstantSchema,
  leaseOwner: IdSchema.nullable(),
  leaseExpiresAt: NullableInstantSchema,
  billableAttempts: z.number().int().nonnegative().max(1),
  receipt: ProviderReceiptSchema.nullable(),
  resultRef: typedReference('capabilityResult').nullable(),
  errorCode: CodeSchema.nullable(),
  startedAt: NullableInstantSchema,
  completedAt: NullableInstantSchema,
}).superRefine((execution, context) => {
  const queued = execution.state !== 'reserved';
  const hasTaskName = execution.taskName !== null;
  const hasQueuedAt = execution.queuedAt !== null;
  if (hasTaskName !== hasQueuedAt || queued !== hasTaskName) {
    context.addIssue({ code: 'custom', message: 'Execution queue fields do not match state' });
  }
  const leased = ['claimed', 'calling', 'provider_succeeded', 'settling'].includes(execution.state);
  if (leased !== (execution.leaseOwner !== null && execution.leaseExpiresAt !== null)) {
    context.addIssue({ code: 'custom', message: 'Execution lease fields do not match state' });
  }
  const called = ['calling', 'provider_succeeded', 'settling'].includes(execution.state);
  if (called && (execution.billableAttempts !== 1 || execution.startedAt === null)) {
    context.addIssue({ code: 'custom', message: 'Provider call fields do not match state' });
  }
  if (['reserved', 'queued', 'claimed'].includes(execution.state)
    && execution.billableAttempts !== 0) {
    context.addIssue({ code: 'custom', message: 'Pre-call execution cannot be billable' });
  }
  const billingUncertain = execution.state === 'billing_uncertain';
  const hasReceipt = execution.receipt !== null;
  const hasResult = execution.resultRef !== null;
  const providerSucceeded = ['provider_succeeded', 'settling'].includes(execution.state);
  const completedWithProviderResult = execution.state === 'completed' && hasReceipt;
  const completedWithoutProviderCall = execution.state === 'completed' && !hasReceipt;
  if ((hasReceipt && !hasResult)
    || (providerSucceeded && (!hasReceipt || !hasResult))
    || (!providerSucceeded && !completedWithProviderResult && !billingUncertain && hasReceipt)
    || (execution.state !== 'completed' && !providerSucceeded && hasResult)
    || (completedWithoutProviderCall
      && (execution.billableAttempts !== 0 || execution.startedAt !== null))
    || (completedWithProviderResult
      && (execution.billableAttempts !== 1 || execution.startedAt === null))) {
    context.addIssue({ code: 'custom', message: 'Provider result fields do not match state' });
  }
  if (billingUncertain
    && (execution.billableAttempts !== 1 || execution.startedAt === null)) {
    context.addIssue({ code: 'custom', message: 'Billing uncertainty requires one provider attempt' });
  }
  const terminal = [
    'completed', 'failed_retryable', 'failed_terminal', 'billing_uncertain',
  ].includes(execution.state);
  if (terminal !== (execution.completedAt !== null)) {
    context.addIssue({ code: 'custom', message: 'Completion time does not match state' });
  }
  const failed = ['failed_retryable', 'failed_terminal', 'billing_uncertain'].includes(
    execution.state,
  );
  if (failed !== (execution.errorCode !== null)) {
    context.addIssue({ code: 'custom', message: 'Execution error does not match state' });
  }
  if (execution.receipt !== null
    && execution.receipt.actualCostMicros > execution.receipt.estimatedCostMicros) {
    context.addIssue({ code: 'custom', message: 'Receipt exceeds estimated cost' });
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
