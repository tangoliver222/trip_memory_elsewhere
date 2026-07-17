import { z } from 'zod';
import {
  IdSchema,
  IsoDateTimeSchema,
  ProcessorVersionSchema,
  ROUTING_CAPABILITIES,
  RoutingSourceRevisionSchema,
} from '../domain/index.js';
import { makeCapabilityExecutionId } from './identity.js';

const CapabilitySchema = z.enum(ROUTING_CAPABILITIES);
const ExecutorClassSchema = z.enum([
  'document-ocr',
  'places-resolution',
  'multimodal-embedding',
  'gemini-multimodal',
]);
const CodeSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/);
const ResultRefSchema = z.strictObject({
  type: z.literal('capabilityResult'),
  id: IdSchema,
});
const UsageSchema = z.record(z.string().min(1), z.number().nonnegative()).refine(
  (value) => Object.keys(value).length > 0,
  'Provider usage cannot be empty',
);

const ClaimSchema = z.strictObject({
  uid: IdSchema,
  routePlanId: IdSchema,
  capability: CapabilitySchema,
  executorClass: ExecutorClassSchema,
  executorVersion: ProcessorVersionSchema,
  sourceRevision: RoutingSourceRevisionSchema,
  idempotencyKey: IdSchema,
});

const TupleFields = {
  uid: IdSchema,
  routePlanId: IdSchema,
  capability: CapabilitySchema,
  idempotencyKey: IdSchema,
};
const TupleSchema = z.strictObject(TupleFields);
const ProviderSuccessSchema = z.strictObject({
  ...TupleFields,
  providerRequestId: z.string().trim().min(1).max(256),
  usage: UsageSchema,
  actualCostMicros: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  resultRef: ResultRefSchema,
});
const FailureSchema = z.strictObject({
  ...TupleFields,
  errorCode: CodeSchema,
});
const ExecutorVersionsSchema = z.strictObject({
  'document-ocr': z.array(ProcessorVersionSchema).min(1).optional(),
  'places-resolution': z.array(ProcessorVersionSchema).min(1).optional(),
  'multimodal-embedding': z.array(ProcessorVersionSchema).min(1).optional(),
  'gemini-multimodal': z.array(ProcessorVersionSchema).min(1).optional(),
}).refine((value) => Object.keys(value).length > 0, 'Executor versions cannot be empty');
const VersionsSchema = z.strictObject({
  router: z.array(ProcessorVersionSchema).min(1),
  policy: z.array(ProcessorVersionSchema).min(1),
  costModel: z.array(ProcessorVersionSchema).min(1),
  executors: ExecutorVersionsSchema,
});
const AuthorizationSchema = z.strictObject({
  routePlanId: IdSchema,
  capability: CapabilitySchema,
  executorClass: ExecutorClassSchema,
  scope: z.enum(['self', 'representative', 'cohort']),
  idempotencyKey: IdSchema,
  ceilingMicros: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

const METHODS = [
  'claimCapabilityExecution',
  'markCapabilityCalling',
  'recordCapabilityReceipt',
  'settleCapabilityExecution',
  'markCapabilityBillingUncertain',
];

function parse(schema, value, name) {
  const result = schema.safeParse(value);
  if (!result.success) throw new TypeError(`${name} is invalid`);
  return result.data;
}

function executionId(input) {
  return makeCapabilityExecutionId({
    routePlanId: input.routePlanId,
    capability: input.capability,
    idempotencyKey: input.idempotencyKey,
  });
}

export function createCapabilityAuthorizer({ repository, supportedVersions, clock } = {}) {
  if (METHODS.some((method) => typeof repository?.[method] !== 'function')) {
    throw new TypeError('Routing repository is incomplete');
  }
  const versions = parse(VersionsSchema, supportedVersions, 'supportedVersions');
  if (typeof clock !== 'function') throw new TypeError('clock is required');

  const now = () => parse(IsoDateTimeSchema, clock(), 'clock result');
  const tupleCommand = (input) => {
    const value = parse(TupleSchema, input, 'execution input');
    return { uid: value.uid, executionId: executionId(value) };
  };

  return Object.freeze({
    async claim(input) {
      const value = parse(ClaimSchema, input, 'claim input');
      const result = await repository.claimCapabilityExecution(value.uid, {
        routePlanId: value.routePlanId,
        capability: value.capability,
        executorClass: value.executorClass,
        executorVersion: value.executorVersion,
        sourceRevision: value.sourceRevision,
        idempotencyKey: value.idempotencyKey,
        supportedVersions: versions,
        claimedAt: now(),
      });
      return parse(AuthorizationSchema, result?.authorization, 'authorization');
    },

    async markCalling(input) {
      const command = tupleCommand(input);
      return repository.markCapabilityCalling(command.uid, {
        executionId: command.executionId,
        calledAt: now(),
      });
    },

    async recordProviderSuccess(input) {
      const value = parse(ProviderSuccessSchema, input, 'provider success');
      return repository.recordCapabilityReceipt(value.uid, {
        executionId: executionId(value),
        providerRequestId: value.providerRequestId,
        usage: value.usage,
        actualCostMicros: value.actualCostMicros,
        resultRef: value.resultRef,
        receivedAt: now(),
      });
    },

    async settle(input) {
      const command = tupleCommand(input);
      return repository.settleCapabilityExecution(command.uid, {
        executionId: command.executionId,
        outcome: 'completed',
        errorCode: null,
        settledAt: now(),
      });
    },

    async fail(input) {
      const value = parse(FailureSchema, input, 'failure');
      return repository.settleCapabilityExecution(value.uid, {
        executionId: executionId(value),
        outcome: 'failed',
        errorCode: value.errorCode,
        settledAt: now(),
      });
    },

    async markBillingUncertain(input) {
      const value = parse(FailureSchema, input, 'billing uncertainty');
      return repository.markCapabilityBillingUncertain(value.uid, {
        executionId: executionId(value),
        errorCode: value.errorCode,
        completedAt: now(),
      });
    },
  });
}
