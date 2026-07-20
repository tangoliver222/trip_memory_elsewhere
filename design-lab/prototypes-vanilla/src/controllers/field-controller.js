import { fragments } from '../fixtures/data.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const clone = (value) => JSON.parse(JSON.stringify(value));

const matchesQuery = (fragment, query) => {
  const haystack = [fragment.evidencePreview, fragment.placeCandidate, fragment.type, fragment.status].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
};

export function createFieldLayout(query = '', { compact = false } = {}) {
  const focused = query ? fragments.filter((fragment) => matchesQuery(fragment, query)).map((fragment) => fragment.id) : [];
  const compactAnchors = [
    [-148, -118, -44], [-4, -138, 24], [137, -104, -82],
    [-176, 6, 8], [-48, 3, 54], [87, 20, -26],
    [174, 77, -96], [-112, 132, -18], [29, 143, 34],
  ];
  let focusIndex = 0;
  return fragments.map((fragment, index) => {
    const isFocused = focused.includes(fragment.id);
    if (isFocused) {
      const position = focusIndex;
      focusIndex += 1;
      return { id: fragment.id, x: (position - (focused.length - 1) / 2) * 86, y: ((position % 2) - 0.5) * 76, z: 42 - position * 8, relevance: 1 };
    }
    if (compact && !query) {
      const anchor = compactAnchors[index % compactAnchors.length];
      return { id: fragment.id, x: anchor[0], y: anchor[1], z: anchor[2], relevance: 1 };
    }
    const band = index % 4;
    const angle = index * 1.87 + band;
    const radius = query
      ? (compact ? 260 + index * 12 : 470 + index * 26)
      : (compact ? 105 + band * 42 : 155 + band * 92);
    return {
      id: fragment.id,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius * 0.58,
      z: query ? -240 - index * 18 : -80 + band * 62,
      relevance: query ? 0.12 : 1,
    };
  });
}

export function createFieldController({ viewport, store, sceneManager, scenePayload = {}, environment = globalThis }) {
  if (!viewport || !store) throw new TypeError('Field controller requires a viewport and store.');
  const initial = store.getState().field;
  const resetCamera = clone(initial.camera);
  const state = {
    camera: clone(initial.camera),
    filters: clone(initial.filters),
    focusedIds: initial.filters.query ? fragments.filter((item) => matchesQuery(item, initial.filters.query)).map((item) => item.id) : [],
    layout: createFieldLayout(initial.filters.query, { compact: Boolean(environment.innerWidth && environment.innerWidth <= 700) }),
    velocity: { x: 0, y: 0 },
  };
  const pointers = new Map();
  const cleanups = [];
  let lastPointer = null;
  let pinchDistance = null;
  let inertiaFrame = null;
  let destroyed = false;

  const syncParticleCamera = () => {
    sceneManager?.setSpatialTransform?.({
      pixelX: state.camera.x - resetCamera.x,
      pixelY: state.camera.y - resetCamera.y,
      scale: state.camera.scale / Math.max(resetCamera.scale, 0.001),
      source: 'field-camera',
    });
  };

  const render = () => {
    const nodes = viewport.querySelectorAll?.('[data-field-node]') || [];
    const byId = Object.fromEntries(state.layout.map((node) => [node.id, node]));
    nodes.forEach((element) => {
      const node = byId[element.dataset.fragmentId];
      if (!node) return;
      element.style.setProperty('--field-x', `${node.x + state.camera.x}px`);
      element.style.setProperty('--field-y', `${node.y + state.camera.y}px`);
      element.style.setProperty('--field-z', `${node.z}px`);
      element.style.setProperty('--field-scale', `${state.camera.scale}`);
      element.style.opacity = String(node.relevance);
      element.dataset.relevance = node.relevance === 1 ? 'focused' : 'background';
    });
    syncParticleCamera();
  };

  const publishCamera = () => store.dispatch({ type: 'SET_FIELD_CAMERA', camera: clone(state.camera) });
  const panBy = (x, y, { publish = true } = {}) => {
    state.camera.x = clamp(state.camera.x + x, -820, 820);
    state.camera.y = clamp(state.camera.y + y, -620, 620);
    render();
    if (publish) publishCamera();
    return clone(state.camera);
  };

  const zoomAt = (x, y, delta, { publish = true } = {}) => {
    const previous = state.camera.scale;
    const next = clamp(previous * Math.exp(delta * 0.16), 0.62, 2.4);
    const ratio = next / previous;
    state.camera.x = x - (x - state.camera.x) * ratio;
    state.camera.y = y - (y - state.camera.y) * ratio;
    state.camera.scale = next;
    state.camera.depth = clamp(1.35 - next * 0.35, 0.35, 1.2);
    render();
    if (publish) publishCamera();
    return next;
  };

  const search = (query) => {
    const normalized = query.trim();
    state.filters.query = normalized;
    state.focusedIds = normalized ? fragments.filter((item) => matchesQuery(item, normalized)).map((item) => item.id) : [];
    state.layout = createFieldLayout(normalized, { compact: Boolean(environment.innerWidth && environment.innerWidth <= 700) });
    if (!normalized) state.camera = clone(resetCamera);
    store.dispatch({ type: 'SET_FIELD_FILTERS', filters: { query: normalized } });
    if (!normalized) publishCamera();
    sceneManager?.setMode?.('fragment-field', { ...scenePayload, query: normalized, focusedIds: [...state.focusedIds] });
    render();
    return [...state.focusedIds];
  };

  const filter = (type, status = state.filters.status) => {
    state.filters = { ...state.filters, type, status };
    store.dispatch({ type: 'SET_FIELD_FILTERS', filters: { type, status } });
    return clone(state.filters);
  };

  const focus = (fragmentId) => {
    const node = state.layout.find((item) => item.id === fragmentId);
    if (!node) return false;
    state.camera.x = -node.x;
    state.camera.y = -node.y;
    state.camera.scale = Math.max(1.35, state.camera.scale);
    sceneManager?.setMode?.('fragment-field', { ...scenePayload, fragmentId, focusedIds: [fragmentId] });
    render();
    publishCamera();
    return true;
  };

  const snapshot = () => ({ camera: clone(state.camera), filters: clone(state.filters), focusedIds: [...state.focusedIds] });
  const restore = (saved) => {
    state.camera = clone(saved.camera);
    state.filters = clone(saved.filters);
    state.focusedIds = [...(saved.focusedIds || [])];
    state.layout = createFieldLayout(state.filters.query, { compact: Boolean(environment.innerWidth && environment.innerWidth <= 700) });
    render();
    publishCamera();
    store.dispatch({ type: 'SET_FIELD_FILTERS', filters: clone(state.filters) });
  };

  const stopInertia = () => {
    if (inertiaFrame != null && environment.cancelAnimationFrame) environment.cancelAnimationFrame(inertiaFrame);
    inertiaFrame = null;
  };
  const runInertia = () => {
    stopInertia();
    const tick = () => {
      state.velocity.x *= 0.9;
      state.velocity.y *= 0.9;
      if (Math.hypot(state.velocity.x, state.velocity.y) < 0.02) {
        state.velocity = { x: 0, y: 0 };
        publishCamera();
        inertiaFrame = null;
        return;
      }
      panBy(state.velocity.x * 16, state.velocity.y * 16, { publish: false });
      inertiaFrame = environment.requestAnimationFrame?.(tick) ?? null;
    };
    inertiaFrame = environment.requestAnimationFrame?.(tick) ?? null;
  };

  const distanceBetweenPointers = () => {
    const values = [...pointers.values()];
    if (values.length < 2) return null;
    return Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
  };

  const onPointerDown = (event) => {
    if (event.target.closest?.('button, input, select')) return;
    stopInertia();
    viewport.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    lastPointer = { x: event.clientX, y: event.clientY, time: event.timeStamp || performance.now() };
    pinchDistance = distanceBetweenPointers();
  };
  const onPointerMove = (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const distance = distanceBetweenPointers();
    if (distance && pinchDistance) {
      zoomAt(event.clientX, event.clientY, Math.log(distance / pinchDistance) * 6, { publish: false });
      pinchDistance = distance;
      return;
    }
    if (!lastPointer) return;
    const now = event.timeStamp || performance.now();
    const elapsed = Math.max(1, now - lastPointer.time);
    const dx = event.clientX - lastPointer.x;
    const dy = event.clientY - lastPointer.y;
    state.velocity = { x: dx / elapsed, y: dy / elapsed };
    panBy(dx, dy, { publish: false });
    lastPointer = { x: event.clientX, y: event.clientY, time: now };
  };
  const onPointerUp = (event) => {
    pointers.delete(event.pointerId);
    pinchDistance = distanceBetweenPointers();
    if (!pointers.size) {
      lastPointer = null;
      runInertia();
    }
  };
  const onWheel = (event) => {
    event.preventDefault?.();
    zoomAt(event.clientX, event.clientY, -event.deltaY * 0.008);
  };

  [['pointerdown', onPointerDown], ['pointermove', onPointerMove], ['pointerup', onPointerUp], ['pointercancel', onPointerUp], ['wheel', onWheel]].forEach(([name, handler]) => {
    viewport.addEventListener?.(name, handler, name === 'wheel' ? { passive: false } : undefined);
    cleanups.push(() => viewport.removeEventListener?.(name, handler));
  });
  render();

  return {
    state,
    panBy,
    zoomAt,
    focus,
    search,
    filter,
    snapshot,
    restore,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stopInertia();
      cleanups.forEach((cleanup) => cleanup());
      pointers.clear();
    },
  };
}
