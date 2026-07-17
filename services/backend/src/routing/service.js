import { z } from 'zod';
import {
  IdSchema,
  IsoDateTimeSchema,
  ROUTING_CAPABILITIES,
  RoutingSourceRevisionSchema,
  parseRoutePlan,
  parseRoutingCohort,
} from '../domain/index.js';
import { buildRoutingCohorts } from './cohorts.js';
import { RoutingServiceError } from './errors.js';
import {
  makeEscalationRequestId,
  makeRoutePlanId,
  makeRoutingCohortId,
} from './identity.js';
import {
  COST_MODEL_V1,
  POLICY_V1,
  ROUTER_V1,
  classifyRoutingInput,
  compileCapabilityIntents,
} from './policy.js';
import {
  deriveRepresentationForFragment,
  selectRoutingRepresentatives,
} from './selector.js';

const CapabilitySchema = z.enum(ROUTING_CAPABILITIES);
const SourceEventSchema = RoutingSourceRevisionSchema.omit({ inputHash: true });
const ResultRefSchema = z.strictObject({ type: z.literal('capabilityResult'), id: IdSchema });
const EscalationSchema = z.strictObject({
  fromRoutePlanId: IdSchema,
  fromCapability: CapabilitySchema,
  outcome: z.enum(['unsupported', 'insufficient_input']),
  reasonCodes: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/)).min(1).max(32),
  producedFactRefs: z.array(ResultRefSchema).max(32),
  requestedCapability: CapabilitySchema,
});
const EventSchema = z.strictObject({
  uid: IdSchema,
  batchId: IdSchema,
  fragmentId: IdSchema,
  sourceRevision: SourceEventSchema,
  escalationRequest: EscalationSchema.optional(),
});
const METHODS = [
  'loadRoutingSnapshot',
  'saveRoutingDraft',
  'commitRoutingApproval',
  'submitEscalationRequest',
];
const TERMINAL_STATES = new Set(['succeeded', 'failed_terminal']);
const ref = (type, id) => ({ type, id });

function parseEvent(input) {
  const result = EventSchema.safeParse(input);
  if (!result.success) throw new TypeError('routing event is invalid');
  return result.data;
}

function sourceRevision(fragment) {
  return {
    bucket: fragment.storage.bucket,
    objectName: fragment.storage.originalPath,
    generation: fragment.storage.generation,
    inputHash: fragment.hashes.sha256,
  };
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function currentPlan(fragmentId, snapshot) {
  const head = snapshot.routingHeads.find(({ fragmentRef }) => fragmentRef.id === fragmentId);
  const plan = head
    ? snapshot.routePlans.find(({ id }) => id === head.currentPlanRef.id) ?? null
    : null;
  return { head: head ?? null, plan };
}

function deterministicMatches(fragment, snapshot) {
  const deterministic = fragment.processing.deterministic;
  const task = snapshot.processingTasks.find(({ id }) => id === deterministic?.taskId);
  return deterministic
    && TERMINAL_STATES.has(deterministic.state)
    && deterministic.processorName === 'deterministic-media'
    && deterministic.processorVersion === 'v1'
    && task
    && TERMINAL_STATES.has(task.state)
    && task.fragmentId === fragment.id
    && task.batchId === fragment.batchId
    && task.processorName === deterministic.processorName
    && task.processorVersion === deterministic.processorVersion
    && task.sourceRevision.bucket === fragment.storage.bucket
    && task.sourceRevision.objectName === fragment.storage.originalPath
    && task.sourceRevision.generation === fragment.storage.generation;
}

function converged(batch) {
  const summary = batch.processingSummary?.deterministic;
  return summary?.processorName === 'deterministic-media'
    && summary.processorVersion === 'v1'
    && summary.eligible === batch.counters.saved
    && summary.running === 0
    && summary.failedRetryable === 0
    && summary.succeeded + summary.failedTerminal === summary.eligible;
}

function persistedDecision(intent) {
  const common = {
    executorClass: null,
    scope: intent.scope,
    reasonCodes: intent.reasonCodes,
    budget: null,
  };
  if (intent.decision === 'approve') {
    return { ...common, decision: 'blocked', reasonCodes: ['await-budget-gate'] };
  }
  if (intent.decision === 'defer') {
    return { ...common, decision: 'deferred', reconsiderOn: intent.reconsiderOn };
  }
  return { ...common, decision: intent.decision === 'skip' ? 'skipped' : 'blocked' };
}

function intentFromDecision(decision) {
  const names = { skipped: 'skip', deferred: 'defer', blocked: 'block' };
  return {
    decision: names[decision.decision] ?? 'approve',
    executorClass: decision.executorClass,
    scope: decision.scope,
    reasonCodes: decision.reasonCodes,
    reconsiderOn: decision.reconsiderOn ?? [],
  };
}

function provisionalIntents() {
  return Object.fromEntries(ROUTING_CAPABILITIES.map((capability) => [capability, {
    decision: 'defer',
    executorClass: null,
    scope: 'self',
    reasonCodes: ['batch-deterministic-unsettled'],
    reconsiderOn: ['batch-deterministic-settled'],
  }]));
}

function makeDraft({
  uid,
  batchId,
  fragment,
  revision,
  representation,
  compiled,
  now,
  extraRouteReasons = [],
}) {
  const id = makeRoutePlanId({
    ownerId: uid,
    fragmentId: fragment.id,
    routerName: ROUTER_V1.name,
    revision,
  });
  return parseRoutePlan({
    id,
    ownerId: uid,
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    fragmentRef: ref('fragment', fragment.id),
    batchRef: ref('importBatch', batchId),
    sourceRevision: sourceRevision(fragment),
    router: {
      name: ROUTER_V1.name,
      version: ROUTER_V1.version,
      policyVersion: POLICY_V1.version,
      costModelVersion: COST_MODEL_V1.version,
    },
    revision,
    state: 'draft',
    inputs: {
      deterministicTaskId: fragment.processing.deterministic.taskId,
      deterministicProcessorName: 'deterministic-media',
      deterministicProcessorVersion: 'v1',
      cohortRevisionIds: representation.cohortRefs.map(({ id: cohortId }) => cohortId).sort(),
      userDecisionVersion: 0,
    },
    classification: compiled.classification,
    representation,
    capabilities: Object.fromEntries(Object.entries(compiled.intents).map(
      ([capability, intent]) => [capability, persistedDecision(intent)],
    )),
    priority: compiled.priority,
    budgetClass: 'deterministic_only',
    routeReasons: [...new Set([...compiled.routeReasons, ...extraRouteReasons])].sort(),
    approvedAt: null,
    completedAt: null,
    supersededAt: null,
    rejectedAt: null,
  });
}

function makeProvisionalDraft({ uid, batchId, fragment, revision, now }) {
  const representation = {
    role: 'independent',
    representativeRef: ref('fragment', fragment.id),
    cohortRefs: [],
    reasonCodes: ['independent-fragment'],
  };
  return makeDraft({
    uid,
    batchId,
    fragment,
    revision,
    representation,
    compiled: {
      classification: classifyRoutingInput(fragment),
      intents: provisionalIntents(),
      priority: 'normal',
      routeReasons: ['batch-deterministic-unsettled'],
    },
    now,
  });
}

function boundedCohortFragments(batchFragments, snapshotFragments) {
  const byId = new Map(batchFragments.map((fragment) => [fragment.id, fragment]));
  for (const fragment of [...snapshotFragments].sort((left, right) => left.id.localeCompare(right.id))) {
    if (byId.size >= 200) break;
    if (fragment.hashes.sha256 !== null) byId.set(fragment.id, fragment);
  }
  return [...byId.values()]
    .filter((fragment) => fragment.hashes.sha256 !== null)
    .sort((left, right) => left.id.localeCompare(right.id));
}

function makeResolvedCohorts({ uid, drafts, fragments, features, now, existing }) {
  const byId = new Map(fragments.map((fragment) => [fragment.id, fragment]));
  const identified = drafts.map((draft) => {
    const members = draft.memberRevisionRefs.map((member) => {
      const fragment = byId.get(member.fragmentId);
      return {
        fragmentId: fragment.id,
        bucket: fragment.storage.bucket,
        objectName: fragment.storage.originalPath,
        generation: fragment.storage.generation,
        inputHash: fragment.hashes.sha256,
      };
    });
    return {
      ...draft,
      id: makeRoutingCohortId({
        ownerId: uid,
        type: draft.type,
        revision: 1,
        memberRevisionRefs: members,
      }),
    };
  });
  const selections = selectRoutingRepresentatives({ fragments, cohorts: identified, features });
  const selectionById = new Map(selections.map((selection) => [selection.cohortId, selection]));
  const cohorts = identified.map((draft) => {
    const stored = existing.find(({ id }) => id === draft.id);
    if (stored) return stored;
    const selection = selectionById.get(draft.id);
    return parseRoutingCohort({
      id: draft.id,
      ownerId: uid,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      type: draft.type,
      revision: 1,
      inputRevisionRefs: draft.memberRevisionRefs.map((member) => {
        const fragment = byId.get(member.fragmentId);
        return {
          fragmentRef: ref('fragment', fragment.id),
          sourceRevision: sourceRevision(fragment),
        };
      }),
      memberRefs: selection.memberRefs,
      representativeRefs: selection.representativeRefs,
      selector: { name: 'deterministic-representative', version: 'v1' },
      basisCodes: draft.basisCodes,
      warningCodes: draft.warningCodes,
      state: 'resolved',
      resolvedAt: now,
    });
  });
  return { cohorts, identified, selections };
}

function thumbnailEligible(fragment) {
  const deterministic = fragment.processing.deterministic;
  const thumbnail = fragment.derivatives.thumbnail;
  return deterministic?.state === 'succeeded'
    && deterministic.thumbnailStatus === 'complete'
    && thumbnail !== null
    && fragment.hashes.sha256 !== null
    && thumbnail.path.includes(`/deterministic-media/v1/${fragment.hashes.sha256}/`);
}

export function createAuthoritativeRouter({ repository, featureReader, clock, randomUUID } = {}) {
  if (METHODS.some((method) => typeof repository?.[method] !== 'function')) {
    throw new TypeError('routing repository is incomplete');
  }
  if (typeof featureReader?.read !== 'function'
    || typeof clock !== 'function'
    || typeof randomUUID !== 'function') {
    throw new TypeError('routing dependencies are incomplete');
  }

  const callRepository = async (operation) => {
    try {
      return await operation();
    } catch {
      throw new RoutingServiceError('routing/repository-unavailable');
    }
  };

  return Object.freeze({
    async handle(input) {
      const event = parseEvent(input);
      const nowResult = IsoDateTimeSchema.safeParse(clock());
      if (!nowResult.success) throw new TypeError('clock result is invalid');
      const now = nowResult.data;
      const loadedSnapshot = await callRepository(() => repository.loadRoutingSnapshot(
        event.uid,
        { batchId: event.batchId },
      ));
      const snapshot = loadedSnapshot ? structuredClone(loadedSnapshot) : null;
      if (!snapshot
        || snapshot.batch?.id !== event.batchId
        || snapshot.batch.ownerId !== event.uid
        || !Array.isArray(snapshot.fragments)
        || !Array.isArray(snapshot.processingTasks)
        || !Array.isArray(snapshot.routePlans)
        || !Array.isArray(snapshot.routingHeads)) return { outcome: 'terminal_noop' };
      const eventFragment = snapshot.fragments.find(({ id }) => id === event.fragmentId);
      if (!eventFragment
        || eventFragment.ownerId !== event.uid
        || eventFragment.batchId !== event.batchId
        || !same(event.sourceRevision, {
          bucket: eventFragment.storage.bucket,
          objectName: eventFragment.storage.originalPath,
          generation: eventFragment.storage.generation,
        })
        || !deterministicMatches(eventFragment, snapshot)) {
        return { outcome: 'terminal_noop' };
      }

      const batchFragmentIds = Object.values(snapshot.batch.uploads)
        .filter(({ state }) => state === 'finalized')
        .map(({ fragmentId }) => fragmentId)
        .sort();
      const batchFragments = batchFragmentIds.map((fragmentId) => (
        snapshot.fragments.find(({ id }) => id === fragmentId)
      ));
      if (batchFragments.some((fragment) => !fragment || !deterministicMatches(fragment, snapshot))) {
        return { outcome: 'terminal_noop' };
      }

      let escalation = null;
      let escalationPlan = null;
      if (event.escalationRequest) {
        const current = currentPlan(event.fragmentId, snapshot);
        escalationPlan = current.plan;
        if (!current.head
          || !escalationPlan
          || current.head.currentPlanRef.id !== event.escalationRequest.fromRoutePlanId
          || !same(current.head.sourceRevision, sourceRevision(eventFragment))
          || escalationPlan.capabilities[event.escalationRequest.fromCapability]?.decision
            !== 'approved') return { outcome: 'terminal_noop' };
        const request = {
          id: makeEscalationRequestId({
            fromRoutePlanId: escalationPlan.id,
            fromCapability: event.escalationRequest.fromCapability,
            outcome: event.escalationRequest.outcome,
            reasonCodes: event.escalationRequest.reasonCodes,
            requestedCapability: event.escalationRequest.requestedCapability,
          }),
          ownerId: event.uid,
          schemaVersion: 1,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          fromRoutePlanRef: ref('routePlan', escalationPlan.id),
          fromCapability: event.escalationRequest.fromCapability,
          outcome: event.escalationRequest.outcome,
          reasonCodes: [...event.escalationRequest.reasonCodes].sort(),
          producedFactRefs: event.escalationRequest.producedFactRefs,
          requestedCapability: event.escalationRequest.requestedCapability,
          state: 'pending',
          resolvedByPlanRef: null,
        };
        const submitted = await callRepository(() => (
          repository.submitEscalationRequest(event.uid, request)
        ));
        escalation = submitted.request ?? request;
      }

      if (!converged(snapshot.batch)) {
        const existing = snapshot.routePlans
          .filter(({ fragmentRef, state }) => (
            fragmentRef.id === event.fragmentId && state === 'draft'
          ))
          .sort((left, right) => right.revision - left.revision)[0];
        const draft = existing ?? makeProvisionalDraft({
          uid: event.uid,
          batchId: event.batchId,
          fragment: eventFragment,
          revision: 1,
          now,
        });
        await callRepository(() => repository.saveRoutingDraft(event.uid, { routePlan: draft }));
        return { outcome: 'drafted' };
      }

      const orphanProvisionals = snapshot.routePlans
        .filter((plan) => plan.batchRef.id === event.batchId
          && plan.state === 'draft'
          && plan.routeReasons.includes('batch-deterministic-unsettled')
          && !snapshot.routingHeads.some(({ fragmentRef }) => (
            fragmentRef.id === plan.fragmentRef.id
          )))
        .sort((left, right) => left.fragmentRef.id.localeCompare(right.fragmentRef.id));
      if (orphanProvisionals.length > 0) {
        await callRepository(() => repository.commitRoutingApproval(event.uid, {
          batchId: event.batchId,
          approvals: orphanProvisionals.map((routePlan) => ({
            routePlanId: routePlan.id,
            capabilityIntents: Object.fromEntries(Object.entries(routePlan.capabilities).map(
              ([capability, decision]) => [capability, intentFromDecision(decision)],
            )),
          })),
          cohorts: [],
          approvedAt: now,
        }));
        for (const provisional of orphanProvisionals) {
          const closed = parseRoutePlan({
            ...provisional,
            state: 'completed',
            updatedAt: now,
            approvedAt: now,
            completedAt: now,
          });
          snapshot.routePlans = snapshot.routePlans.map((plan) => (
            plan.id === closed.id ? closed : plan
          ));
          snapshot.routingHeads.push({
            fragmentRef: provisional.fragmentRef,
            currentPlanRef: ref('routePlan', provisional.id),
            currentRevision: provisional.revision,
            sourceRevision: provisional.sourceRevision,
          });
        }
      }

      const targets = event.escalationRequest ? [eventFragment] : batchFragments.filter((fragment) => {
        const current = currentPlan(fragment.id, snapshot);
        return !current.head
          || !same(current.head.sourceRevision, sourceRevision(fragment))
          || current.plan?.routeReasons.includes('batch-deterministic-unsettled');
      });
      if (targets.length === 0) return { outcome: 'terminal_noop' };

      const cohortFragments = boundedCohortFragments(batchFragments, snapshot.fragments);
      const controller = new AbortController();
      const features = {};
      const featureUnavailable = new Set();
      for (const fragment of cohortFragments) {
        if (!thumbnailEligible(fragment)) continue;
        try {
          features[fragment.id] = await featureReader.read(fragment, {
            signal: controller.signal,
          });
        } catch {
          featureUnavailable.add(fragment.id);
        }
      }
      const cohortDrafts = buildRoutingCohorts({
        fragments: cohortFragments,
        duplicateCandidates: snapshot.duplicateCandidates ?? [],
        routerVersion: ROUTER_V1.version,
      });
      const resolved = makeResolvedCohorts({
        uid: event.uid,
        drafts: cohortDrafts,
        fragments: cohortFragments,
        features,
        now,
        existing: snapshot.routingCohorts ?? [],
      });

      const approvalEntries = [];
      for (const fragment of [...targets].sort((left, right) => left.id.localeCompare(right.id))) {
        const current = currentPlan(fragment.id, snapshot);
        const storedDrafts = snapshot.routePlans
          .filter(({ fragmentRef, state }) => fragmentRef.id === fragment.id && state === 'draft')
          .sort((left, right) => left.revision - right.revision);
        const existingCompiled = storedDrafts[0] ?? null;
        const revision = current.head
          ? current.head.currentRevision + 1
          : existingCompiled?.revision ?? 1;
        const representation = deriveRepresentationForFragment({
          fragmentId: fragment.id,
          cohorts: resolved.identified,
          selections: resolved.selections,
        });
        const compiled = compileCapabilityIntents({
          fragment,
          representation,
          features: features[fragment.id] ?? null,
          priorResults: {},
          escalation: fragment.id === event.fragmentId ? escalation : null,
          revision,
          requestContext: { kind: 'automatic', serverAuthenticated: true },
        });
        const draft = existingCompiled ?? makeDraft({
          uid: event.uid,
          batchId: event.batchId,
          fragment,
          revision,
          representation,
          compiled,
          now,
          extraRouteReasons: featureUnavailable.has(fragment.id)
            ? ['routing/feature-unavailable']
            : [],
        });
        approvalEntries.push({ routePlan: draft, intents: compiled.intents });
      }

      approvalEntries.sort((left, right) => (
        left.routePlan.fragmentRef.id.localeCompare(right.routePlan.fragmentRef.id)
          || left.routePlan.revision - right.routePlan.revision
      ));
      for (const entry of approvalEntries) {
        await callRepository(() => repository.saveRoutingDraft(event.uid, {
          routePlan: entry.routePlan,
        }));
      }
      const approval = await callRepository(() => repository.commitRoutingApproval(event.uid, {
        batchId: event.batchId,
        approvals: approvalEntries.map(({ routePlan, intents }) => ({
          routePlanId: routePlan.id,
          capabilityIntents: intents,
        })),
        cohorts: resolved.cohorts,
        approvedAt: now,
      }));
      return {
        outcome: approval.plans.every(({ state }) => state === 'completed')
          ? 'completed'
          : 'approved',
      };
    },
  });
}
