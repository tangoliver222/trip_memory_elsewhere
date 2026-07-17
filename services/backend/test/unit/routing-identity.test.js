import test from 'node:test';
import assert from 'node:assert/strict';
import { IdSchema } from '../../src/domain/common.js';
import {
  makeBudgetLedgerId,
  makeBudgetReservationId,
  makeCapabilityExecutionId,
  makeEscalationRequestId,
  makeRoutePlanId,
  makeRoutingCohortId,
  makeRoutingHeadId,
} from '../../src/routing/identity.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

const headInput = Object.freeze({
  ownerId: 'user_alpha',
  fragmentId: 'frag_12345678',
  routerName: 'fragment-routing',
});

const memberRevisionRefs = Object.freeze([
  Object.freeze({
    fragmentId: 'frag_12345678',
    bucket: 'demo-elsewhere.appspot.com',
    objectName: 'users/user_alpha/originals/batch_12345678/frag_12345678',
    generation: '1740000000000001',
    inputHash: HASH_A,
  }),
  Object.freeze({
    fragmentId: 'frag_87654321',
    bucket: 'demo-elsewhere.appspot.com',
    objectName: 'users/user_alpha/originals/batch_12345678/frag_87654321',
    generation: '1740000000000002',
    inputHash: HASH_B,
  }),
]);

test('routing head identity is stable and excludes source revision', () => {
  const expected = makeRoutingHeadId(headInput);

  assert.equal(makeRoutingHeadId({ ...headInput }), expected);
  assert.equal(makeRoutingHeadId({
    ...headInput,
    sourceRevision: { generation: '1740000000000001' },
  }), expected);
  assert.equal(makeRoutingHeadId({
    ...headInput,
    sourceRevision: { generation: '1740000000000002' },
  }), expected);
  assert.notEqual(makeRoutingHeadId({
    ...headInput,
    fragmentId: 'frag_87654321',
  }), expected);
});

test('route plan identity changes only with its canonical identity tuple', () => {
  const first = makeRoutePlanId({ ...headInput, revision: 1 });

  assert.equal(makeRoutePlanId({ ...headInput, revision: 1 }), first);
  assert.notEqual(makeRoutePlanId({ ...headInput, revision: 2 }), first);
  assert.notEqual(makeRoutePlanId({
    ...headInput,
    ownerId: 'user_bravo',
    revision: 1,
  }), first);
});

test('cohort identity is member-order independent and source-revision sensitive', () => {
  const input = {
    ownerId: 'user_alpha',
    type: 'near_duplicate',
    revision: 1,
    memberRevisionRefs,
  };
  const first = makeRoutingCohortId(input);

  assert.equal(makeRoutingCohortId({
    ...input,
    memberRevisionRefs: [...memberRevisionRefs].reverse(),
  }), first);
  assert.notEqual(makeRoutingCohortId({
    ...input,
    memberRevisionRefs: memberRevisionRefs.map((member, index) => (
      index === 0 ? { ...member, generation: '1740000000000003' } : member
    )),
  }), first);
  assert.deepEqual(memberRevisionRefs.map((member) => member.fragmentId), [
    'frag_12345678',
    'frag_87654321',
  ]);
});

test('budget execution and escalation identities bind their canonical inputs', () => {
  const routePlanId = makeRoutePlanId({ ...headInput, revision: 1 });
  const ledgerId = makeBudgetLedgerId({
    ownerId: 'user_alpha',
    type: 'user_day',
    key: '2026-07-17',
  });
  const reservationId = makeBudgetReservationId({
    routePlanId,
    capability: 'embedding',
  });
  const executionId = makeCapabilityExecutionId({
    routePlanId,
    capability: 'embedding',
    idempotencyKey: 'idem_12345678',
  });
  const reasons = ['document-ambiguous', 'ocr-text-insufficient'];
  const escalationId = makeEscalationRequestId({
    fromRoutePlanId: routePlanId,
    fromCapability: 'ocr',
    outcome: 'insufficient_input',
    reasonCodes: reasons,
    requestedCapability: 'gemini',
  });

  assert.notEqual(ledgerId, reservationId);
  assert.notEqual(reservationId, executionId);
  assert.equal(makeEscalationRequestId({
    fromRoutePlanId: routePlanId,
    fromCapability: 'ocr',
    outcome: 'insufficient_input',
    reasonCodes: [...reasons].reverse(),
    requestedCapability: 'gemini',
  }), escalationId);
  assert.deepEqual(reasons, ['document-ambiguous', 'ocr-text-insufficient']);
});

test('routing identities are bounded opaque IdSchema values', () => {
  const routePlanId = makeRoutePlanId({ ...headInput, revision: 1 });
  const ids = [
    makeRoutingHeadId(headInput),
    routePlanId,
    makeRoutingCohortId({
      ownerId: 'user_alpha',
      type: 'near_duplicate',
      revision: 1,
      memberRevisionRefs,
    }),
    makeBudgetLedgerId({
      ownerId: 'user_alpha',
      type: 'batch',
      key: 'batch_12345678',
    }),
    makeBudgetReservationId({ routePlanId, capability: 'ocr' }),
    makeCapabilityExecutionId({
      routePlanId,
      capability: 'ocr',
      idempotencyKey: 'idem_12345678',
    }),
    makeEscalationRequestId({
      fromRoutePlanId: routePlanId,
      fromCapability: 'ocr',
      outcome: 'unsupported',
      reasonCodes: ['private-path-reason'],
      requestedCapability: 'gemini',
    }),
  ];

  for (const id of ids) {
    assert.equal(IdSchema.safeParse(id).success, true);
    assert.ok(id.length < 128);
    for (const privateValue of [
      'user_alpha',
      'frag_12345678',
      'users/user_alpha/originals',
      'private-path-reason',
    ]) {
      assert.equal(id.includes(privateValue), false);
    }
  }
});

test('identity helpers reject unknown scopes capabilities and malformed tuples', () => {
  const routePlanId = makeRoutePlanId({ ...headInput, revision: 1 });

  assert.throws(() => makeRoutePlanId({ ...headInput, revision: 0 }), TypeError);
  assert.throws(() => makeRoutingCohortId({
    ownerId: 'user_alpha',
    type: 'unknown',
    revision: 1,
    memberRevisionRefs,
  }), TypeError);
  assert.throws(() => makeRoutingCohortId({
    ownerId: 'user_alpha',
    type: 'burst',
    revision: 1,
    memberRevisionRefs: [{ ...memberRevisionRefs[0], generation: '' }],
  }), TypeError);
  assert.throws(() => makeBudgetLedgerId({
    ownerId: 'user_alpha',
    type: 'global',
    key: 'all',
  }), TypeError);
  assert.throws(() => makeBudgetReservationId({
    routePlanId,
    capability: 'vision',
  }), TypeError);
  assert.throws(() => makeCapabilityExecutionId({
    routePlanId,
    capability: 'vision',
    idempotencyKey: 'idem_12345678',
  }), TypeError);
  assert.throws(() => makeEscalationRequestId({
    fromRoutePlanId: routePlanId,
    fromCapability: 'ocr',
    outcome: 'completed',
    reasonCodes: ['wrong-outcome'],
    requestedCapability: 'gemini',
  }), TypeError);
  assert.throws(() => makeEscalationRequestId({
    fromRoutePlanId: routePlanId,
    fromCapability: 'ocr',
    outcome: 'unsupported',
    reasonCodes: ['same-reason', 'same-reason'],
    requestedCapability: 'gemini',
  }), TypeError);
});
