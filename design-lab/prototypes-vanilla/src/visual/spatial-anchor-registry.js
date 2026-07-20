const MOVEMENT_TOLERANCE = 0.75;

const near = (left, right) => Math.abs(left - right) <= MOVEMENT_TOLERANCE;

const readAnchors = (elements) => [...elements].map((element, index) => {
  const rect = element.getBoundingClientRect();
  return {
    id: element.dataset?.particleId || `anchor-${index}`,
    role: element.dataset?.particleRole || 'fragment',
    weight: Number(element.dataset?.particleWeight) || 1,
    viewportX: rect.left + rect.width / 2,
    viewportY: rect.top + rect.height / 2,
    left: rect.left,
    top: rect.top,
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

  const flush = (source = 'layout') => {
    if (!elements.length) return;
    const current = readAnchors(elements);
    const transform = sharedTransform(baseline, current);
    if (transform) {
      onTransform({ ...transform, source });
      return;
    }
    baseline = current;
    onTransform({ pixelX: 0, pixelY: 0, scale: 1, source: 'layout' });
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

  const clear = () => {
    scrollRoot?.removeEventListener?.('scroll', onScroll);
    elements = [];
    scrollRoot = null;
    baseline = [];
    pending = false;
  };

  const bind = ({ elements: nextElements = [], scrollRoot: nextScrollRoot = null } = {}) => {
    clear();
    elements = [...nextElements];
    scrollRoot = nextScrollRoot;
    baseline = readAnchors(elements);
    if (baseline.length) onLayout({ anchors: baseline, source: 'initial' });
    scrollRoot?.addEventListener?.('scroll', onScroll, { passive: true });
    return clear;
  };

  return { bind, clear, flush };
}
