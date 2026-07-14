const SILVER = Object.freeze({ primary: '#e3e5e3', secondary: '#8e969b', accent: '#b9ad99' });
const COOL = Object.freeze({ primary: '#dfe4e3', secondary: '#7d878c', accent: '#aab2b0' });

const base = Object.freeze({
  camera: Object.freeze({ fov: 44, z: 44 }),
  palette: SILVER,
  interaction: 'none',
  idle: 'micro-breathe',
  duration: 1.2,
  reducedMotion: Object.freeze({ duration: 0.01, idle: 'none' }),
  anchorSelectors: Object.freeze(['[data-particle-anchor]']),
});

const definitions = Object.freeze({
  world: { generator: 'globe', ratio: 1, camera: { fov: 42, z: 38 }, interaction: 'orbit', idle: 'slow-rotate', duration: 1.45 },
  city: { generator: 'city-clusters', ratio: 0.82, camera: { fov: 43, z: 42 }, interaction: 'parallax', idle: 'cluster-breathe', duration: 1.25 },
  'fragment-field': { generator: 'multi-city-field', ratio: 0.92, camera: { fov: 46, z: 46 }, interaction: 'field', idle: 'depth-drift', duration: 1.15 },
  timeline: { generator: 'timeline-spine', ratio: 0.55, camera: { fov: 42, z: 44 }, interaction: 'focus', idle: 'node-pulse', duration: 0.9 },
  map: { generator: 'place-map', ratio: 0.48, camera: { fov: 40, z: 45 }, interaction: 'focus', idle: 'orbit-density', duration: 0.9, palette: COOL },
  relations: { generator: 'connections', ratio: 0.5, camera: { fov: 43, z: 45 }, interaction: 'focus', idle: 'path-breathe', duration: 1, palette: COOL },
  discovery: { generator: 'discovery-growth', ratio: 0.62, camera: { fov: 44, z: 43 }, interaction: 'focus', idle: 'entity-breathe', duration: 1.5 },
  else: { generator: 'else-orb', ratio: 0.34, camera: { fov: 44, z: 44 }, interaction: 'none', idle: 'orb-dust', duration: 0.65, palette: COOL },
  import: { generator: 'import-batch', ratio: 0.4, camera: { fov: 42, z: 44 }, interaction: 'none', idle: 'batch-orbit', duration: 0.85 },
  inbox: { generator: 'connections', ratio: 0.18, camera: { fov: 42, z: 43 }, interaction: 'focus', idle: 'gap-breathe', duration: 0.75, palette: COOL },
  lens: { generator: 'lens-focus', ratio: 0.26, camera: { fov: 39, z: 42 }, interaction: 'none', idle: 'focus-breathe', duration: 0.65 },
  capsule: { generator: 'capsule-chapters', ratio: 0.3, camera: { fov: 42, z: 46 }, interaction: 'none', idle: 'darkroom-dust', duration: 0.9 },
  onboarding: { generator: 'onboarding-cluster', ratio: 0.42, camera: { fov: 42, z: 44 }, interaction: 'none', idle: 'cluster-breathe', duration: 1.2 },
  'quiet-tool': { generator: 'empty', ratio: 0, camera: { fov: 44, z: 44 }, interaction: 'none', idle: 'none', duration: 0.01 },
});

const aliases = Object.freeze({
  'world-intro': 'world',
  globe: 'world',
  'city-field': 'city',
  field: 'fragment-field',
  place: 'map',
  connection: 'relations',
  quiet: 'quiet-tool',
  empty: 'quiet-tool',
});

export function getSceneDefinition(mode, payload = {}) {
  const resolvedMode = aliases[mode] || mode;
  const selected = definitions[resolvedMode] || definitions['quiet-tool'];
  const particleCount = Math.max(0, payload.particleCount ?? 9800);
  return Object.freeze({
    ...base,
    ...selected,
    camera: Object.freeze({ ...base.camera, ...selected.camera }),
    palette: selected.palette || base.palette,
    reducedMotion: base.reducedMotion,
    mode: resolvedMode,
    activeCount: selected.ratio === 0 ? 0 : Math.max(1, Math.min(particleCount, Math.round(particleCount * selected.ratio))),
  });
}

export const SCENE_MODES = Object.freeze(Object.keys(definitions));
