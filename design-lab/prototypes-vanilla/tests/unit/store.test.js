import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, createStore } from '../../src/store.js';

const snapshot = {
  route: '#/world/fragments',
  scrollY: 640,
  focusId: 'fragment-frag-river-1018-photo',
  fieldCamera: { x: 24, y: -18, scale: 1.45, depth: 0.6 },
  filters: { type: 'photo', status: 'all', query: 'river' },
  selectedFragmentId: null,
};

test('Lens close restores field camera, filters, selection and scroll snapshot', () => {
  const store = createStore(createInitialState({ route: snapshot.route }));
  store.dispatch({ type: 'OPEN_LENS', fragmentId: 'frag-river-1018-photo', snapshot });
  store.dispatch({ type: 'SET_FIELD_CAMERA', camera: { x: 0, y: 0, scale: 2, depth: 0.1 } });
  const closeResult = store.dispatch({ type: 'CLOSE_OVERLAY' });

  assert.deepEqual(store.getState().field.camera, snapshot.fieldCamera);
  assert.deepEqual(store.getState().field.filters, snapshot.filters);
  assert.equal(store.getState().selectedFragmentId, snapshot.selectedFragmentId);
  assert.deepEqual(closeResult.restore, { scrollY: snapshot.scrollY, focusId: snapshot.focusId });
});

test('opening Original Viewer hides Else and closing returns to Lens', () => {
  const store = createStore(createInitialState());
  store.dispatch({ type: 'OPEN_LENS', fragmentId: 'frag-river-1018-photo', snapshot });
  store.dispatch({ type: 'OPEN_ORIGINAL' });

  assert.equal(store.getState().else.hidden, true);
  assert.equal(store.getState().overlays.at(-1).name, 'originalViewer');

  store.dispatch({ type: 'CLOSE_OVERLAY' });
  assert.equal(store.getState().overlays.at(-1).name, 'fragmentLens');
});

test('dispatch creates a new state object and notifies subscribers once', () => {
  const store = createStore(createInitialState());
  const previous = store.getState();
  let calls = 0;
  store.subscribe(() => { calls += 1; });
  store.dispatch({ type: 'SET_FIELD_FILTERS', filters: { query: 'Common Grounds' } });
  assert.notEqual(store.getState(), previous);
  assert.equal(calls, 1);
  assert.equal(store.getState().field.filters.query, 'Common Grounds');
});

test('navigation closes spatial overlays and returns Else to its route-safe idle state', () => {
  const store = createStore(createInitialState({ route: '#/world/fragments' }));
  store.dispatch({ type: 'OPEN_LENS', fragmentId: 'frag-river-1018-photo', snapshot });
  store.dispatch({ type: 'SET_ELSE', value: { open: true, state: 'found', query: '河岸', answer: { text: 'answer' } } });

  store.dispatch({ type: 'NAVIGATE', route: '#/world/import' });

  assert.equal(store.getState().route, '#/world/import');
  assert.deepEqual(store.getState().overlays, []);
  assert.equal(store.getState().else.hidden, false);
  assert.equal(store.getState().else.open, false);
  assert.equal(store.getState().else.state, 'idle');
});

test('an older remote mutation response cannot overwrite newer owner state', () => {
  const store = createStore(createInitialState());
  store.dispatch({
    type: 'HYDRATE_REMOTE_STATE',
    value: { revision: 3, savedDiscoveryIds: ['discovery_new'] },
  });
  store.dispatch({
    type: 'HYDRATE_REMOTE_STATE',
    value: { revision: 2, savedDiscoveryIds: [] },
  });

  assert.equal(store.getState().remoteRevision, 3);
  assert.deepEqual(store.getState().savedDiscoveryIds, ['discovery_new']);
});
