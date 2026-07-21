import test from 'node:test';
import assert from 'node:assert/strict';
import { createActionController } from '../../src/controllers/action-controller.js';

function controllerHarness({ client, mode = 'live' }) {
  const listeners = new Map();
  const actions = [];
  const state = {
    runtime: { mode, client },
    importFlow: { files: [], status: 'idle' },
    else: { query: '' },
    field: { camera: {}, filters: {} },
    selectedFragmentId: null,
    notes: { note_12345678: '当前文字' },
    savedDiscoveryIds: [],
  };
  const root = {
    addEventListener(name, handler) { listeners.set(name, handler); },
    removeEventListener() {},
    contains() { return true; },
  };
  const store = {
    getState: () => state,
    dispatch(action) {
      actions.push(action);
      if (action.type === 'SET_OPERATION_STATUS') state.operation = action.value;
      return {};
    },
  };
  createActionController({ root, store });
  const click = (dataset) => listeners.get('click')({
    target: { closest: () => ({ dataset }) },
  });
  return { actions, click, state };
}

test('live review failure never dispatches a local success decision', async () => {
  const calls = [];
  const { actions, click } = controllerHarness({
    client: {
      async saveInboxDecision(id, decision) {
        calls.push([id, decision]);
        throw Object.assign(new Error('offline'), { code: 'experience/unavailable' });
      },
    },
  });

  click({
    action: 'review-choice',
    reviewId: 'inbox-place-frag_12345678',
    value: '0',
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(calls, [[
    'inbox-place-frag_12345678',
    { decision: 'yes' },
  ]]);
  assert.equal(actions.some(({ type }) => type === 'SET_REVIEW_DECISION'), false);
  assert.equal(actions.at(-1).type, 'SET_OPERATION_STATUS');
  assert.equal(actions.at(-1).value.status, 'error');
});

test('fixture review remains an explicit local design-lab action', () => {
  const { actions, click } = controllerHarness({ client: null, mode: 'fixture' });

  click({ action: 'review-choice', reviewId: 'review_fixture', value: '1' });

  assert.deepEqual(actions, [{
    type: 'SET_REVIEW_DECISION', reviewId: 'review_fixture', value: '1',
  }]);
});
