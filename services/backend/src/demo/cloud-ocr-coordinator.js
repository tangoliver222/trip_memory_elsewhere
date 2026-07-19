import { IdSchema } from '../domain/index.js';
import { retryableCapabilityError } from '../capabilities/errors.js';

const INPUT_KEYS = ['batchId', 'uid'];
const TERMINAL_OUTCOMES = new Set([
  'completed',
  'insufficient_input',
  'unsupported',
  'failed_terminal',
  'terminal_noop',
  'billing_uncertain',
]);

function strictInput(input) {
  if (!input
    || typeof input !== 'object'
    || Array.isArray(input)
    || Object.keys(input).sort().join('\0') !== INPUT_KEYS.join('\0')
    || !IdSchema.safeParse(input.uid).success
    || !IdSchema.safeParse(input.batchId).success) {
    throw new TypeError('Cloud OCR coordinator input is invalid');
  }
  return input;
}

function sameSource(left, right) {
  return left?.bucket === right?.bucket
    && left?.objectName === right?.objectName
    && left?.generation === right?.generation
    && left?.inputHash === right?.inputHash;
}

function currentQueuedExecutions(snapshot, uid) {
  const plans = new Map((snapshot?.routePlans ?? []).map((plan) => [plan.id, plan]));
  const heads = new Map((snapshot?.routingHeads ?? []).map((head) => (
    [head.currentPlanRef.id, head]
  )));
  return (snapshot?.capabilityExecutions ?? []).filter((execution) => {
    const plan = plans.get(execution.routePlanRef?.id);
    const head = plan ? heads.get(plan.id) : null;
    return execution.ownerId === uid
      && execution.capability === 'ocr'
      && execution.state === 'queued'
      && plan
      && head
      && ['approved', 'executing'].includes(plan.state)
      && plan.revision === execution.routePlanRevision
      && head.currentRevision === plan.revision
      && head.fragmentRef?.id === plan.fragmentRef?.id
      && execution.fragmentRef?.id === plan.fragmentRef?.id
      && sameSource(head.sourceRevision, plan.sourceRevision)
      && sameSource(execution.sourceRevision, plan.sourceRevision)
      && plan.capabilities?.ocr?.decision === 'approved'
      && plan.capabilities.ocr.executorClass === 'document-ocr';
  }).sort((left, right) => left.id.localeCompare(right.id));
}

function retryableFailure() {
  return retryableCapabilityError('capability/repository-unavailable');
}

export function createCloudOcrCoordinator({ repository, worker } = {}) {
  if (typeof repository?.loadRoutingSnapshot !== 'function') {
    throw new TypeError('Cloud OCR coordinator repository is incomplete');
  }
  if (typeof worker?.handle !== 'function') {
    throw new TypeError('Cloud OCR coordinator worker is incomplete');
  }

  const load = async (uid, batchId) => {
    try {
      return await repository.loadRoutingSnapshot(uid, { batchId });
    } catch {
      throw retryableFailure();
    }
  };

  return Object.freeze({
    async handle(input) {
      const { uid, batchId } = strictInput(input);
      const snapshot = await load(uid, batchId);
      const executions = currentQueuedExecutions(snapshot, uid);
      if (executions.length === 0) {
        return Object.freeze({ outcome: 'terminal_noop', executed: 0 });
      }

      const outcomes = [];
      for (const execution of executions) {
        let result;
        try {
          result = await worker.handle(Object.freeze({
            capabilityExecutionId: execution.id,
            ownerId: uid,
            routePlanId: execution.routePlanRef.id,
            routePlanRevision: execution.routePlanRevision,
            taskDeliveryCount: 0,
          }));
        } catch {
          throw retryableFailure();
        }
        if (!result || result.retryable === true || !TERMINAL_OUTCOMES.has(result.outcome)) {
          throw retryableFailure();
        }
        outcomes.push(result.outcome);
      }

      const persisted = await load(uid, batchId);
      const remaining = new Set(currentQueuedExecutions(persisted, uid).map(({ id }) => id));
      if (executions.some(({ id }) => remaining.has(id))) throw retryableFailure();
      return Object.freeze({
        outcome: outcomes.includes('billing_uncertain') ? 'billing_uncertain' : 'completed',
        executed: executions.length,
      });
    },
  });
}
