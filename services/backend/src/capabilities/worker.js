import {
  IdSchema,
  IsoDateTimeSchema,
  parseCapabilityResult,
} from '../domain/index.js';
import { createCapabilityAuthorizer } from '../routing/authorization.js';
import { makeEscalationRequestId } from '../routing/identity.js';
import { assertCapabilityArtifactStore, assertOcrProvider } from './contract.js';
import { makeCapabilityIdentity } from './identity.js';
import { assertOcrInput } from './ocr-policy.js';

const TASK_KEYS = [
  'capabilityExecutionId',
  'ownerId',
  'routePlanId',
  'routePlanRevision',
  'taskDeliveryCount',
];
const PROVIDER_METADATA_KEYS = [
  'endpointRegion',
  'pricingVersion',
  'processorAuditId',
  'unitCostMicros',
];
const LEASE_MS = 5 * 60 * 1_000;
const SOURCE_DEADLINE_MS = 60 * 1_000;
const MAX_SOURCE_BYTES = 40_000_000;
const LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const STALE_CODES = new Set([
  'repository/conflict',
  'repository/owner-mismatch',
  'repository/routing-target-mismatch',
]);

function strictKeys(value, keys) {
  return value
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).sort().join('\0') === keys.join('\0');
}

function normalizeTask(input) {
  if (!strictKeys(input, TASK_KEYS)
    || !IdSchema.safeParse(input.capabilityExecutionId).success
    || !IdSchema.safeParse(input.ownerId).success
    || !IdSchema.safeParse(input.routePlanId).success
    || !Number.isSafeInteger(input.routePlanRevision)
    || input.routePlanRevision < 1
    || input.routePlanRevision > 5
    || !Number.isSafeInteger(input.taskDeliveryCount)
    || input.taskDeliveryCount < 0
    || input.taskDeliveryCount > 1_000) {
    throw new TypeError('OCR capability task is invalid');
  }
  return input;
}

function normalizeProviderMetadata(input) {
  if (!strictKeys(input, PROVIDER_METADATA_KEYS)
    || !IdSchema.safeParse(input.processorAuditId).success
    || typeof input.endpointRegion !== 'string'
    || !LABEL.test(input.endpointRegion)
    || typeof input.pricingVersion !== 'string'
    || !LABEL.test(input.pricingVersion)
    || !Number.isSafeInteger(input.unitCostMicros)
    || input.unitCostMicros < 1) {
    throw new TypeError('OCR provider metadata is invalid');
  }
  return Object.freeze({ ...input });
}

function requirePort(value, method, name) {
  if (!value || typeof value !== 'object' || typeof value[method] !== 'function') {
    throw new TypeError(`${name} is invalid`);
  }
  return value;
}

function stableReason(error, fallback) {
  const tail = typeof error?.code === 'string' ? error.code.split('/').at(-1) : null;
  return tail && /^[a-z0-9][a-z0-9-]{1,63}$/.test(tail) ? tail : fallback;
}

function identityFor(task, authorization, sourceRevision) {
  const identity = makeCapabilityIdentity({
    ownerId: task.ownerId,
    fragmentId: authorization.fragmentId,
    sourceRevision,
    routePlanRevision: authorization.routePlanRevision,
    capability: authorization.capability,
    provider: authorization.providerName,
    providerVersion: authorization.providerVersion,
  });
  if (identity.executionId !== authorization.executionId
    || identity.idempotencyKey !== authorization.idempotencyKey) {
    throw new TypeError('OCR authorization identity is invalid');
  }
  return identity;
}

function unsupportedResult({ task, authorization, work, identity, metadata, now }) {
  return parseCapabilityResult({
    id: identity.resultId,
    ownerId: task.ownerId,
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    executionRef: { type: 'capabilityExecution', id: authorization.executionId },
    routePlanRef: { type: 'routePlan', id: authorization.routePlanId },
    routePlanRevision: authorization.routePlanRevision,
    fragmentRef: { type: 'fragment', id: authorization.fragmentId },
    sourceRevision: work.sourceRevision,
    capability: authorization.capability,
    executorName: authorization.executorName,
    executorVersion: authorization.executorVersion,
    providerName: authorization.providerName,
    providerVersion: authorization.providerVersion,
    processorAuditId: metadata.processorAuditId,
    endpointRegion: metadata.endpointRegion,
    outcome: 'unsupported',
    providerArtifactRef: null,
    normalizedArtifactRef: null,
    requestCount: 0,
    pageCount: 0,
    taskDeliveryCount: task.taskDeliveryCount,
    pricingVersion: metadata.pricingVersion,
    estimatedCostMicros: 0,
    actualCostMicros: 0,
    qualitySummary: null,
    suggestedFactKeys: [],
  });
}

function providerResult({
  task,
  authorization,
  work,
  identity,
  metadata,
  now,
  normalized,
  providerArtifactRef,
  normalizedArtifactRef,
}) {
  return parseCapabilityResult({
    id: identity.resultId,
    ownerId: task.ownerId,
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    executionRef: { type: 'capabilityExecution', id: authorization.executionId },
    routePlanRef: { type: 'routePlan', id: authorization.routePlanId },
    routePlanRevision: authorization.routePlanRevision,
    fragmentRef: { type: 'fragment', id: authorization.fragmentId },
    sourceRevision: work.sourceRevision,
    capability: authorization.capability,
    executorName: authorization.executorName,
    executorVersion: authorization.executorVersion,
    providerName: authorization.providerName,
    providerVersion: authorization.providerVersion,
    processorAuditId: metadata.processorAuditId,
    endpointRegion: metadata.endpointRegion,
    outcome: normalized.outcome,
    providerArtifactRef,
    normalizedArtifactRef,
    requestCount: 1,
    pageCount: normalized.normalized.pageCount,
    taskDeliveryCount: task.taskDeliveryCount,
    pricingVersion: metadata.pricingVersion,
    estimatedCostMicros: metadata.unitCostMicros,
    actualCostMicros: metadata.unitCostMicros,
    qualitySummary: normalized.normalized.qualitySummary,
    suggestedFactKeys: Object.keys(normalized.suggestedFacts).sort(),
  });
}

function escalationRequest({ task, authorization, result, now }) {
  const reasonCodes = result.qualitySummary?.defectCodes.length > 0
    ? result.qualitySummary.defectCodes
    : ['ocr-insufficient-input'];
  const common = {
    fromRoutePlanId: authorization.routePlanId,
    fromCapability: 'ocr',
    outcome: 'insufficient_input',
    reasonCodes,
    requestedCapability: 'gemini',
  };
  return {
    id: makeEscalationRequestId(common),
    ownerId: task.ownerId,
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    fromRoutePlanRef: { type: 'routePlan', id: authorization.routePlanId },
    fromCapability: common.fromCapability,
    outcome: common.outcome,
    reasonCodes: [...reasonCodes].sort(),
    producedFactRefs: [{ type: 'capabilityResult', id: result.id }],
    requestedCapability: common.requestedCapability,
    state: 'pending',
    resolvedByPlanRef: null,
  };
}

function resultOnly(outcome, retryable) {
  return Object.freeze({ outcome, retryable });
}

export function createOcrCapabilityWorker({
  repository,
  materializer,
  ocrProvider,
  artifactStore,
  normalizer,
  clock,
  leaseOwnerFactory,
  supportedVersions,
  providerMetadata: providerMetadataInput,
} = {}) {
  if (typeof repository?.submitEscalationRequest !== 'function') {
    throw new TypeError('Capability repository is incomplete');
  }
  const source = requirePort(materializer, 'materialize', 'Materializer');
  const provider = assertOcrProvider(ocrProvider);
  const artifacts = assertCapabilityArtifactStore(artifactStore);
  if (typeof normalizer !== 'function') throw new TypeError('OCR normalizer is invalid');
  if (typeof clock !== 'function') throw new TypeError('clock is required');
  if (typeof leaseOwnerFactory !== 'function') throw new TypeError('leaseOwnerFactory is required');
  const metadata = normalizeProviderMetadata(providerMetadataInput);
  const authorizer = createCapabilityAuthorizer({ repository, supportedVersions, clock });

  async function markUncertain(tuple, errorCode) {
    try {
      await authorizer.markBillingUncertain({ ...tuple, errorCode });
    } catch {
      // A provider may already have charged. Never turn this into an automatic provider retry.
    }
    return resultOnly('billing_uncertain', false);
  }

  async function submitEscalation(task, authorization, result, now) {
    await repository.submitEscalationRequest(
      task.ownerId,
      escalationRequest({ task, authorization, result, now }),
    );
  }

  return Object.freeze({
    async handle(input) {
      const task = normalizeTask(input);
      const leaseOwner = leaseOwnerFactory();
      if (!IdSchema.safeParse(leaseOwner).success) throw new TypeError('Lease owner is invalid');
      const claimedAt = clock();
      if (!IsoDateTimeSchema.safeParse(claimedAt).success) throw new TypeError('Clock is invalid');
      const leaseExpiresAt = new Date(Date.parse(claimedAt) + LEASE_MS).toISOString();
      let claim;
      try {
        claim = await authorizer.claim({
          uid: task.ownerId,
          executionId: task.capabilityExecutionId,
          leaseOwner,
          leaseExpiresAt,
        });
      } catch (error) {
        if (STALE_CODES.has(error?.code)) return resultOnly('terminal_noop', false);
        return resultOnly('failed_retryable', true);
      }
      const { authorization, work } = claim;
      if (authorization.routePlanId !== task.routePlanId
        || authorization.routePlanRevision !== task.routePlanRevision
        || authorization.executionId !== task.capabilityExecutionId) {
        return resultOnly('terminal_noop', false);
      }
      const identity = identityFor(task, authorization, work.sourceRevision);
      const tuple = { uid: task.ownerId, executionId: authorization.executionId, leaseOwner };

      if (work.executionState === 'provider_succeeded') {
        try {
          if (work.result.outcome === 'insufficient_input') {
            await submitEscalation(task, authorization, work.result, clock());
          }
          await authorizer.settle(tuple);
          return resultOnly(work.result.outcome, false);
        } catch {
          return resultOnly('failed_retryable', true);
        }
      }

      try {
        assertOcrInput(work.ocrInput);
      } catch (error) {
        const now = clock();
        const result = unsupportedResult({
          task, authorization, work, identity, metadata, now,
        });
        await authorizer.fail({
          ...tuple,
          outcome: 'unsupported',
          errorCode: stableReason(error, 'input-unsupported'),
          result,
        });
        return resultOnly('unsupported', false);
      }

      let material = null;
      let providerInvoked = false;
      try {
        try {
          material = await source.materialize({
            sourceRevision: work.sourceRevision,
            expectedStorageFacts: work.storageFacts,
            maxBytes: MAX_SOURCE_BYTES,
            signal: new AbortController().signal,
            deadlineAt: new Date(Date.parse(claimedAt) + SOURCE_DEADLINE_MS).toISOString(),
          });
        } catch (error) {
          const retryable = error?.retryable !== false;
          await authorizer.fail({
            ...tuple,
            outcome: retryable ? 'failed_retryable' : 'failed_terminal',
            errorCode: stableReason(error, retryable ? 'storage-unavailable' : 'invalid-media'),
            result: null,
          });
          return resultOnly(retryable ? 'failed_retryable' : 'failed_terminal', retryable);
        }

        try {
          await authorizer.markCalling(tuple);
        } catch {
          return resultOnly('failed_retryable', true);
        }

        let providerOutput;
        try {
          providerInvoked = true;
          providerOutput = await provider.process({
            ...work.ocrInput,
            clientRequestId: identity.clientRequestId,
            executionId: authorization.executionId,
            filePath: material.path,
            signal: new AbortController().signal,
          });
        } catch {
          return markUncertain(tuple, 'provider-call-uncertain');
        }

        let resultRecorded = false;
        try {
          const providerArtifactRef = await artifacts.putProviderArtifact({
            bucket: work.sourceRevision.bucket,
            ownerId: task.ownerId,
            executionId: authorization.executionId,
            value: providerOutput,
          });
          const normalized = normalizer({
            document: providerOutput.document,
            resultId: identity.resultId,
            fragmentId: authorization.fragmentId,
            executionId: authorization.executionId,
            observedAt: clock(),
          });
          const normalizedArtifactRef = await artifacts.putNormalizedArtifact({
            bucket: work.sourceRevision.bucket,
            ownerId: task.ownerId,
            executionId: authorization.executionId,
            value: normalized.normalized,
          });
          if (normalized.normalized.pageCount !== 1
            || metadata.unitCostMicros > authorization.ceilingMicros) {
            return markUncertain(tuple, 'provider-result-invalid');
          }
          const receivedAt = clock();
          const receipt = {
            clientRequestId: identity.clientRequestId,
            providerRequestId: providerOutput.providerRequestId,
            requestCount: 1,
            taskDeliveryCount: task.taskDeliveryCount,
            pricingVersion: metadata.pricingVersion,
            estimatedPages: 1,
            actualPages: 1,
            estimatedCostMicros: metadata.unitCostMicros,
            actualCostMicros: metadata.unitCostMicros,
            receivedAt,
          };
          const result = providerResult({
            task,
            authorization,
            work,
            identity,
            metadata,
            now: receivedAt,
            normalized,
            providerArtifactRef,
            normalizedArtifactRef,
          });
          await authorizer.recordProviderSuccess({ ...tuple, receipt, result });
          resultRecorded = true;
          if (result.outcome === 'insufficient_input') {
            await submitEscalation(task, authorization, result, clock());
          }
          try {
            await authorizer.settle(tuple);
          } catch {
            return resultOnly('failed_retryable', true);
          }
          return resultOnly(result.outcome, false);
        } catch {
          if (resultRecorded) return resultOnly('failed_retryable', true);
          return markUncertain(tuple, 'provider-call-uncertain');
        }
      } finally {
        if (material !== null) {
          try {
            await material.cleanup();
          } catch {
            if (!providerInvoked) return resultOnly('failed_retryable', true);
          }
        }
      }
    },
  });
}
