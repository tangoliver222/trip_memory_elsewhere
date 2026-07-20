const MOVEMENT_TOLERANCE = 0.75;

const near = (left, right) => Math.abs(left - right) <= MOVEMENT_TOLERANCE;

const readAnchors = (elements, scrollDelta = { x: 0, y: 0 }) => [...elements].map((element, index) => {
  const rect = element.getBoundingClientRect();
  return {
    id: element.dataset?.particleId || `anchor-${index}`,
    role: element.dataset?.particleRole || 'fragment',
    weight: Number(element.dataset?.particleWeight) || 1,
    depth: Number.isFinite(Number(element.dataset?.particleDepth)) ? Number(element.dataset.particleDepth) : null,
    viewportX: rect.left + rect.width / 2 + scrollDelta.x,
    viewportY: rect.top + rect.height / 2 + scrollDelta.y,
    left: rect.left + scrollDelta.x,
    top: rect.top + scrollDelta.y,
    width: rect.width,
    height: rect.height,
  };
});

const sharedTransform = (baseline, current) => {
  if (baseline.length !== current.length || baseline.length === 0) return null;
  const pixelX = current[0].left - baseline[0].left;
  const pixelY = current[0].top - baseline[0].top;
  const scale = baseline[0].width > 0 ? current[0].width / baseline[0].width : 1;
  const uniform = current.every((anchor, index) => {
    const base = baseline[index];
    return near(anchor.left - base.left, pixelX)
      && near(anchor.top - base.top, pixelY)
      && near(anchor.width / Math.max(base.width, 1), scale)
      && near(anchor.height / Math.max(base.height, 1), scale);
  });
  return uniform ? { pixelX, pixelY, scale } : null;
};

/**
 * Observes DOM fragment anchors and separates cheap page transforms from real
 * layout changes. Scroll/pan translates the existing particle world in the
 * same frame; only non-uniform layout changes request a scene recompile.
 */
export function createSpatialAnchorRegistry({
  environment = globalThis,
  onTransform = () => {},
  onLayout = () => {},
} = {}) {
  let elements = [];
  let scrollRoot = null;
  let baseline = [];
  let pending = false;
  let pendingSource = 'layout';
  let resizeObserver = null;
  let scrollOrigin = { left: 0, top: 0 };
  let layoutTransform = { pixelX: 0, pixelY: 0, scale: 1 };

  const scrollDelta = () => ({
    x: (scrollRoot?.scrollLeft || 0) - scrollOrigin.left,
    y: (scrollRoot?.scrollTop || 0) - scrollOrigin.top,
  });

  const emitPageTransform = (source) => {
    const delta = scrollDelta();
    onTransform({
      pixelX: layoutTransform.pixelX - delta.x,
      pixelY: layoutTransform.pixelY - delta.y,
      scale: layoutTransform.scale,
      source,
    });
  };

  const flush = (source = 'layout') => {
    if (!elements.length) return;
    if (source === 'scroll') {
      emitPageTransform(source);
      return;
    }
    const delta = scrollDelta();
    const current = readAnchors(elements, delta);
    const transform = sharedTransform(baseline, current);
    if (transform) {
      layoutTransform = transform;
      emitPageTransform(source);
      return;
    }
    baseline = current;
    layoutTransform = { pixelX: 0, pixelY: 0, scale: 1 };
    emitPageTransform('layout');
    onLayout({ anchors: current, source });
  };

  const schedule = (source) => {
    pendingSource = source;
    if (pending) return;
    pending = true;
    const raf = environment.requestAnimationFrame || ((callback) => callback());
    raf(() => {
      pending = false;
      flush(pendingSource);
    });
  };

  const onScroll = () => schedule('scroll');
  const onResize = () => schedule('layout');

  const clear = () => {
    scrollRoot?.removeEventListener?.('scroll', onScroll);
    environment.removeEventListener?.('resize', onResize);
    resizeObserver?.disconnect?.();
    resizeObserver = null;
    elements = [];
    scrollRoot = null;
    baseline = [];
    pending = false;
    scrollOrigin = { left: 0, top: 0 };
    layoutTransform = { pixelX: 0, pixelY: 0, scale: 1 };
  };

  const bind = ({ elements: nextElements = [], scrollRoot: nextScrollRoot = null } = {}) => {
    clear();
    elements = [...nextElements];
    scrollRoot = nextScrollRoot;
    scrollOrigin = { left: scrollRoot?.scrollLeft || 0, top: scrollRoot?.scrollTop || 0 };
    baseline = readAnchors(elements);
    if (baseline.length) onLayout({ anchors: baseline, source: 'initial' });
    scrollRoot?.addEventListener?.('scroll', onScroll, { passive: true });
    environment.addEventListener?.('resize', onResize, { passive: true });
    if (environment.ResizeObserver) {
      resizeObserver = new environment.ResizeObserver(onResize);
      resizeObserver.observe?.(scrollRoot);
      elements.forEach((element) => resizeObserver.observe?.(element));
    }
    return clear;
  };

  return { bind, clear, flush };
}
