import { IdSchema, parseCapabilityExecution } from '../domain/index.js';
import { makeCapabilityIdentity } from './identity.js';
import { assertCapabilityDispatcher } from './contract.js';
import { retryableCapabilityError } from './errors.js';

const PROVIDER_NAME = 'document-ai-enterprise-ocr';
const PROVIDER_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SUPPORTED_ROUTING_VERSIONS = new Set(['v2', 'v3']);
const INPUT_KEYS = ['batchId', 'uid'];
const REPOSITORY_METHODS = [
  'loadRoutingSnapshot',
  'markCapabilityQueued',
  'prepareCapabilityExecution',
];
const ref = (type, id) => ({ type, id });

function assertRepository(repository) {
  if (REPOSITORY_METHODS.some((method) => typeof repository?.[method] !== 'function')) {
    throw new TypeError('Capability scheduling repository is incomplete');
  }
  return repository;
}

function normalizeInput(input) {
  if (!input
    || typeof input !== 'object'
    || Array.isArray(input)
    || Object.keys(input).sort().join('\0') !== INPUT_KEYS.join('\0')
    || !IdSchema.safeParse(input.uid).success
    || !IdSchema.safeParse(input.batchId).success) {
    throw new TypeError('Capability scheduling input is invalid');
  }
  return input;
}

function currentApprovedOcrPlans(snapshot) {
  const heads = new Map((snapshot?.routingHeads ?? []).map((head) => (
    [head.currentPlanRef.id, head]
  )));
  return (snapshot?.routePlans ?? [])
    .filter((plan) => {
      const head = heads.get(plan.id);
      return head
        && ['approved', 'executing'].includes(plan.state)
        && head.currentRevision === plan.revision
        && JSON.stringify(head.sourceRevision) === JSON.stringify(plan.sourceRevision)
        && plan.router?.version === 'v1'
        && SUPPORTED_ROUTING_VERSIONS.has(plan.router?.policyVersion)
        && plan.router.policyVersion === plan.router.costModelVersion
        && plan.representation?.role !== 'supporting'
        && plan.capabilities?.ocr?.decision === 'approved'
        && plan.capabilities.ocr.executorClass === 'document-ocr';
    })
    .sort((left, right) => left.fragmentRef.id.localeCompare(right.fragmentRef.id));
}

function reservationFor(snapshot, routePlan) {
  return (snapshot.budgetReservations ?? []).find((reservation) => (
    reservation.routePlanRef.id === routePlan.id
      && reservation.capability === 'ocr'
      && reservation.state !== 'released'
      && reservation.state !== 'settled'
  ));
}

function reservedExecution({ uid, routePlan, reservation, identity, providerVersion }) {
  const createdAt = routePlan.approvedAt ?? routePlan.createdAt;
  return parseCapabilityExecution({
    id: identity.executionId,
    ownerId: uid,
    schemaVersion: 1,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    routePlanRef: ref('routePlan', routePlan.id),
    routePlanRevision: routePlan.revision,
    reservationRef: ref('budgetReservation', reservation.id),
    fragmentRef: routePlan.fragmentRef,
    sourceRevision: routePlan.sourceRevision,
    capability: 'ocr',
    executorName: 'document-ocr',
    executorVersion: 'v1',
    providerName: PROVIDER_NAME,
    providerVersion,
    idempotencyKey: identity.idempotencyKey,
    state: 'reserved',
    taskName: null,
    queuedAt: null,
    leaseOwner: null,
    leaseExpiresAt: null,
    billableAttempts: 0,
    receipt: null,
    resultRef: null,
    errorCode: null,
    startedAt: null,
    completedAt: null,
  });
}

export function createCapabilityScheduler({
  repository,
  dispatcher,
  providerVersion,
  clock,
} = {}) {
  const store = assertRepository(repository);
  const tasks = assertCapabilityDispatcher(dispatcher);
  if (typeof providerVersion !== 'string' || !PROVIDER_VERSION.test(providerVersion)) {
    throw new TypeError('OCR provider version is invalid');
  }
  if (typeof clock !== 'function') throw new TypeError('clock is required');
  const supportedVersions = Object.freeze({
    router: Object.freeze(['v1']),
    policy: Object.freeze(['v2', 'v3']),
    costModel: Object.freeze(['v2', 'v3']),
    executors: Object.freeze({ 'document-ocr': Object.freeze(['v1']) }),
    providers: Object.freeze({ [PROVIDER_NAME]: Object.freeze([providerVersion]) }),
  });

  return Object.freeze({
    async handle(input) {
      const { uid, batchId } = normalizeInput(input);
      const snapshot = await store.loadRoutingSnapshot(uid, { batchId });
      if (!snapshot) return Object.freeze({ outcome: 'terminal_noop', queued: 0 });
      const existing = new Map((snapshot.capabilityExecutions ?? []).map((execution) => (
        [execution.id, execution]
      )));
      let queued = 0;
      for (const routePlan of currentApprovedOcrPlans(snapshot)) {
        const reservation = reservationFor(snapshot, routePlan);
        if (!reservation) continue;
        const identity = makeCapabilityIdentity({
          ownerId: uid,
          fragmentId: routePlan.fragmentRef.id,
          sourceRevision: routePlan.sourceRevision,
          routePlanRevision: routePlan.revision,
          capability: 'ocr',
          provider: PROVIDER_NAME,
          providerVersion,
        });
        const stored = existing.get(identity.executionId);
        if (stored && stored.state !== 'reserved') continue;
        if (!stored) {
          const prepared = await store.prepareCapabilityExecution(uid, {
            execution: reservedExecution({
              uid, routePlan, reservation, identity, providerVersion,
            }),
            supportedVersions,
          });
          if (!['created', 'duplicate'].includes(prepared?.outcome)) {
            throw retryableCapabilityError('capability/repository-unavailable');
          }
          if (prepared.execution.state !== 'reserved') continue;
        }
        const payload = Object.freeze({
          capabilityExecutionId: identity.executionId,
          ownerId: uid,
          routePlanId: routePlan.id,
          routePlanRevision: routePlan.revision,
        });
        let dispatched;
        try {
          dispatched = await tasks.enqueueOcrTask({ taskName: identity.taskName, payload });
        } catch {
          throw retryableCapabilityError('capability/dispatch-unavailable');
        }
        if (!['created', 'duplicate'].includes(dispatched?.outcome)) {
          throw retryableCapabilityError('capability/dispatch-unavailable');
        }
        await store.markCapabilityQueued(uid, {
          executionId: identity.executionId,
          taskName: identity.taskName,
          queuedAt: clock(),
        });
        queued += 1;
      }
      return Object.freeze({
        outcome: queued > 0 ? 'queued' : 'terminal_noop',
        queued,
      });
    },
  });
}
