import { settings as fixtureSettings } from './fixtures/data.js';

const DEFAULT_CAMERA = Object.freeze({ x: 0, y: 0, scale: 1, depth: 1 });
const DEFAULT_FILTERS = Object.freeze({ type: 'all', status: 'all', query: '' });

const clone = (value) => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

export function createInitialState(overrides = {}) {
  const defaults = {
    route: '#/onboarding',
    selectedCityId: 'bangkok',
    selectedFragmentId: null,
    selectedSceneId: 'scene-river-evening',
    selectedPlaceId: 'place-common-grounds',
    selectedConnectionId: 'rel-river-ticket-photo',
    selectedDiscoveryId: 'disc-ari-mornings',
    selectedWritingId: 'writing-city-reflection',
    field: {
      camera: { ...DEFAULT_CAMERA },
      filters: { ...DEFAULT_FILTERS },
    },
    overlays: [],
    else: {
      state: 'idle',
      hidden: false,
      open: false,
      query: '',
      answer: null,
      sources: [],
    },
    discoveryFilter: 'all',
    savedDiscoveryIds: [],
    notes: {},
    reviewDecisions: {},
    connectionDecisions: {},
    settings: { ...fixtureSettings },
    cacheCleared: false,
    deletedTargets: [],
  };

  return {
    ...defaults,
    ...clone(overrides),
    field: {
      ...defaults.field,
      ...(overrides.field || {}),
      camera: { ...DEFAULT_CAMERA, ...(overrides.field?.camera || {}) },
      filters: { ...DEFAULT_FILTERS, ...(overrides.field?.filters || {}) },
    },
    else: { ...defaults.else, ...(overrides.else || {}) },
    settings: { ...defaults.settings, ...(overrides.settings || {}) },
    overlays: clone(overrides.overlays || []),
  };
}

function closeOverlay(state) {
  if (!state.overlays.length) return { state, result: {} };

  const overlays = state.overlays.slice(0, -1);
  const closed = state.overlays.at(-1);
  const lensStillOpen = overlays.some((overlay) => overlay.name === 'fragmentLens');
  let next = {
    ...state,
    overlays,
    else: { ...state.else, hidden: lensStillOpen },
  };
  let result = {};

  if (closed.name === 'fragmentLens' && closed.snapshot) {
    const snapshot = closed.snapshot;
    next = {
      ...next,
      selectedFragmentId: snapshot.selectedFragmentId ?? null,
      field: {
        ...state.field,
        camera: { ...snapshot.fieldCamera },
        filters: { ...snapshot.filters },
      },
      else: { ...state.else, hidden: false },
    };
    result = { restore: { scrollY: snapshot.scrollY, focusId: snapshot.focusId } };
  }

  return { state: next, result };
}

function reduce(state, action) {
  switch (action.type) {
    case 'NAVIGATE':
      return { state: { ...state, route: action.route }, result: {} };
    case 'SELECT_CITY':
      return { state: { ...state, selectedCityId: action.cityId }, result: {} };
    case 'SELECT_SCENE':
      return { state: { ...state, selectedSceneId: action.sceneId }, result: {} };
    case 'SELECT_PLACE':
      return { state: { ...state, selectedPlaceId: action.placeId }, result: {} };
    case 'SELECT_CONNECTION':
      return { state: { ...state, selectedConnectionId: action.connectionId }, result: {} };
    case 'SELECT_DISCOVERY':
      return { state: { ...state, selectedDiscoveryId: action.discoveryId }, result: {} };
    case 'SELECT_WRITING':
      return { state: { ...state, selectedWritingId: action.writingId }, result: {} };
    case 'SET_FIELD_CAMERA':
      return {
        state: { ...state, field: { ...state.field, camera: { ...state.field.camera, ...action.camera } } },
        result: {},
      };
    case 'SET_FIELD_FILTERS':
      return {
        state: { ...state, field: { ...state.field, filters: { ...state.field.filters, ...action.filters } } },
        result: {},
      };
    case 'OPEN_LENS':
      return {
        state: {
          ...state,
          selectedFragmentId: action.fragmentId,
          overlays: [
            ...state.overlays,
            { name: 'fragmentLens', payload: { fragmentId: action.fragmentId }, snapshot: clone(action.snapshot || {}) },
          ],
          else: { ...state.else, hidden: true },
        },
        result: {},
      };
    case 'OPEN_ORIGINAL':
      return {
        state: {
          ...state,
          overlays: [...state.overlays, { name: 'originalViewer', payload: { fragmentId: state.selectedFragmentId } }],
          else: { ...state.else, hidden: true },
        },
        result: {},
      };
    case 'OPEN_SHARE':
      return {
        state: {
          ...state,
          overlays: [...state.overlays, { name: 'sharePreview', payload: action.payload || {} }],
          else: { ...state.else, hidden: true },
        },
        result: {},
      };
    case 'OPEN_DELETE':
      return {
        state: {
          ...state,
          overlays: [...state.overlays, { name: 'deleteImpact', payload: { targetId: action.targetId } }],
          else: { ...state.else, hidden: true },
        },
        result: {},
      };
    case 'CLOSE_OVERLAY':
      return closeOverlay(state);
    case 'CLOSE_ALL_OVERLAYS':
      return {
        state: { ...state, overlays: [], else: { ...state.else, hidden: false, open: false, state: 'idle' } },
        result: {},
      };
    case 'TOGGLE_ELSE':
      return {
        state: { ...state, else: { ...state.else, open: !state.else.open, state: state.else.open ? 'idle' : 'reading' } },
        result: {},
      };
    case 'SET_ELSE':
      return {
        state: {
          ...state,
          else: {
            ...state.else,
            ...action.value,
            sources: action.value?.sources ? [...action.value.sources] : state.else.sources,
          },
        },
        result: {},
      };
    case 'SET_DISCOVERY_FILTER':
      return { state: { ...state, discoveryFilter: action.filter }, result: {} };
    case 'SAVE_DISCOVERY':
      return {
        state: {
          ...state,
          savedDiscoveryIds: state.savedDiscoveryIds.includes(action.discoveryId)
            ? state.savedDiscoveryIds.filter((id) => id !== action.discoveryId)
            : [...state.savedDiscoveryIds, action.discoveryId],
        },
        result: {},
      };
    case 'SET_NOTE':
      return { state: { ...state, notes: { ...state.notes, [action.noteId]: action.text } }, result: {} };
    case 'SET_REVIEW_DECISION':
      return { state: { ...state, reviewDecisions: { ...state.reviewDecisions, [action.reviewId]: action.value } }, result: {} };
    case 'SET_CONNECTION_DECISION':
      return { state: { ...state, connectionDecisions: { ...state.connectionDecisions, [action.connectionId || 'current']: action.value } }, result: {} };
    case 'SET_SETTING':
      return { state: { ...state, settings: { ...state.settings, [action.key]: action.value } }, result: {} };
    case 'CLEAR_CACHE':
      return { state: { ...state, cacheCleared: true }, result: {} };
    case 'CONFIRM_DELETE':
      return { state: { ...state, deletedTargets: [...state.deletedTargets, action.targetId], overlays: [], else: { ...state.else, hidden: false } }, result: {} };
    default:
      return { state, result: {} };
  }
}

export function createStore(initialState = createInitialState()) {
  let state = initialState;
  const listeners = new Set();

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch(action) {
      const previous = state;
      const reduced = reduce(state, action);
      state = reduced.state;
      if (state !== previous) listeners.forEach((listener) => listener(state, action));
      return reduced.result;
    },
  };
}

export const store = createStore();
