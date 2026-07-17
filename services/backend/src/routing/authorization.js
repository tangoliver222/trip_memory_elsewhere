import { z } from 'zod';
import {
  CapabilityResultSchema,
  IdSchema,
  IsoDateTimeSchema,
  ProcessorVersionSchema,
  ProviderReceiptSchema,
} from '../domain/index.js';

const CodeSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/);
const VersionLabelSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
const versionsMap = (versionSchema) => z.record(
  z.string().min(1),
  z.array(versionSchema).min(1),
).refine((value) => Object.keys(value).length > 0, 'Version map cannot be empty');
const VersionsSchema = z.strictObject({
  router: z.array(ProcessorVersionSchema).min(1),
  policy: z.array(ProcessorVersionSchema).min(1),
  costModel: z.array(ProcessorVersionSchema).min(1),
  executors: versionsMap(ProcessorVersionSchema),
  providers: versionsMap(VersionLabelSchema),
});
const LeaseTupleFields = {
  uid: IdSchema,
  executionId: IdSchema,
  leaseOwner: IdSchema,
};
const LeaseTupleSchema = z.strictObject(LeaseTupleFields);
const ClaimSchema = z.strictObject({
  ...LeaseTupleFields,
  leaseExpiresAt: IsoDateTimeSchema,
});
const ProviderSuccessSchema = z.strictObject({
  ...LeaseTupleFields,
  receipt: ProviderReceiptSchema,
  result: CapabilityResultSchema,
});
const FailureSchema = z.strictObject({
  ...LeaseTupleFields,
  outcome: z.enum(['unsupported', 'failed_retryable', 'failed_terminal']),
  errorCode: CodeSchema,
  result: CapabilityResultSchema.nullable(),
});
const BillingUncertainSchema = z.strictObject({
  ...LeaseTupleFields,
  errorCode: CodeSchema,
});
const AuthorizationSchema = z.strictObject({
  executionId: IdSchema,
  routePlanId: IdSchema,
  routePlanRevision: z.number().int().positive().max(5),
  fragmentId: IdSchema,
  capability: z.enum(['ocr', 'places', 'embedding', 'gemini']),
  executorName: z.string().min(1).max(128),
  executorVersion: ProcessorVersionSchema,
  providerName: z.string().min(1).max(128),
  providerVersion: VersionLabelSchema,
  idempotencyKey: IdSchema,
  ceilingMicros: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

const METHODS = [
  'claimCapabilityExecution',
  'markCapabilityCalling',
  'recordCapabilityResult',
  'settleCapabilityExecution',
  'failCapabilityExecution',
  'markCapabilityBillingUncertain',
];

function parse(schema, input, name) {
  const result = schema.safeParse(input);
  if (!result.success) throw new TypeError(`${name} is invalid`);
  return result.data;
}

export function createCapabilityAuthorizer({ repository, supportedVersions, clock } = {}) {
  if (METHODS.some((method) => typeof repository?.[method] !== 'function')) {
    throw new TypeError('Capability repository is incomplete');
  }
  const versions = parse(VersionsSchema, supportedVersions, 'supportedVersions');
  if (typeof clock !== 'function') throw new TypeError('clock is required');
  const now = () => parse(IsoDateTimeSchema, clock(), 'clock result');

  const delegate = (method, schema, input, fields) => {
    const value = parse(schema, input, `${method} input`);
    return repository[method](value.uid, {
      executionId: value.executionId,
      leaseOwner: value.leaseOwner,
      ...fields(value),
    });
  };

  return Object.freeze({
    async claim(input) {
      const value = parse(ClaimSchema, input, 'claim input');
      const result = await repository.claimCapabilityExecution(value.uid, {
        executionId: value.executionId,
        leaseOwner: value.leaseOwner,
        claimedAt: now(),
        leaseExpiresAt: value.leaseExpiresAt,
        supportedVersions: versions,
      });
      return parse(AuthorizationSchema, result?.authorization, 'authorization');
    },

    async markCalling(input) {
      return delegate('markCapabilityCalling', LeaseTupleSchema, input, () => ({ calledAt: now() }));
    },

    async recordProviderSuccess(input) {
      return delegate('recordCapabilityResult', ProviderSuccessSchema, input, (value) => ({
        receipt: value.receipt,
        result: value.result,
        recordedAt: now(),
      }));
    },

    async settle(input) {
      return delegate('settleCapabilityExecution', LeaseTupleSchema, input, () => ({
        settledAt: now(),
      }));
    },

    async fail(input) {
      return delegate('failCapabilityExecution', FailureSchema, input, (value) => ({
        outcome: value.outcome,
        errorCode: value.errorCode,
        result: value.result,
        completedAt: now(),
      }));
    },

    async markBillingUncertain(input) {
      return delegate(
        'markCapabilityBillingUncertain',
        BillingUncertainSchema,
        input,
        (value) => ({ errorCode: value.errorCode, completedAt: now() }),
      );
    },
  });
}
