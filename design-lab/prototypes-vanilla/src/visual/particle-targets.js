const TAU = Math.PI * 2;

function seeded(index, salt = 1) {
  const value = Math.sin((index + 1) * (12.9898 + salt * 7.233)) * 43758.5453;
  return value - Math.floor(value);
}

const bundle = (count, metadata = {}) => ({
  positions: new Float32Array(count * 3),
  visibility: new Float32Array(count),
  groups: new Float32Array(count),
  metadata,
});

const point = (target, index, x, y, z, visibility = 1, group = 0) => {
  const offset = index * 3;
  target.positions[offset] = x;
  target.positions[offset + 1] = y;
  target.positions[offset + 2] = z;
  target.visibility[index] = visibility;
  target.groups[index] = group;
};

const anchorsFrom = (payload = {}, kinds = null) => {
  const anchors = payload.anchors instanceof Map ? [...payload.anchors.values()] : (payload.anchors || []);
  return kinds ? anchors.filter((anchor) => kinds.includes(anchor.kind)) : anchors;
};

const longitudeDistance = (a, b) => {
  const distance = Math.abs(a - b) % 360;
  return Math.min(distance, 360 - distance);
};

const landMasses = [
  { lng: 58, lat: 49, rx: 105, ry: 28 },
  { lng: 102, lat: 17, rx: 35, ry: 27 },
  { lng: 20, lat: 3, rx: 31, ry: 39 },
  { lng: -105, lat: 46, rx: 52, ry: 29 },
  { lng: -61, lat: -17, rx: 24, ry: 42 },
  { lng: 134, lat: -26, rx: 24, ry: 17 },
  { lng: -42, lat: 72, rx: 18, ry: 11 },
  { lng: 47, lat: -20, rx: 8, ry: 15 },
  { lng: 138, lat: 37, rx: 7, ry: 13 },
];

const isLand = (lng, lat) => landMasses.some((mass) => {
  const x = longitudeDistance(lng, mass.lng) / mass.rx;
  const y = (lat - mass.lat) / mass.ry;
  return x * x + y * y <= 1;
});

const sphericalPoint = (lng, lat, radius = 10.8) => {
  const latitude = lat * Math.PI / 180;
  const longitude = (lng - 100) * Math.PI / 180;
  const ring = Math.cos(latitude);
  return {
    x: Math.sin(longitude) * ring * radius,
    y: Math.sin(latitude) * radius,
    z: Math.cos(longitude) * ring * radius,
  };
};

export function createEmptyTargets(count) {
  const target = bundle(count, { active: 0 });
  for (let index = 0; index < count; index += 1) point(target, index, 0, 0, -120, 0, -1);
  return target;
}

export function createDeepScatterTargets(count) {
  const target = bundle(count, { depth: 'intro-only' });
  for (let index = 0; index < count; index += 1) {
    const theta = seeded(index, 1) * TAU;
    const radius = 16 + seeded(index, 2) * 70;
    point(target, index, Math.cos(theta) * radius, Math.sin(theta) * radius * 0.62, -72 + seeded(index, 3) * 124, 0.88, 0);
  }
  return target;
}

export function createGlobeTargets(count, payload = {}) {
  const landTarget = Math.floor(count * 0.88);
  const target = bundle(count, { landPoints: landTarget, oceanPoints: count - landTarget, landPointRatio: landTarget / Math.max(1, count) });
  for (let index = 0; index < count; index += 1) {
    const wantsLand = index < landTarget;
    let lng = 0;
    let lat = 0;
    for (let attempt = 0; attempt < 90; attempt += 1) {
      const sample = index * 97 + attempt * 17;
      lng = seeded(sample, 4) * 360 - 180;
      lat = Math.asin(seeded(sample, 5) * 2 - 1) * 180 / Math.PI;
      if (isLand(lng, lat) === wantsLand) break;
    }
    const radius = (payload.radius || 10.8) + (seeded(index, 6) - 0.5) * (wantsLand ? 0.09 : 0.025);
    const world = sphericalPoint(lng, lat, radius);
    point(target, index, world.x, world.y, world.z, wantsLand ? 0.94 : 0.055, wantsLand ? 1 : 0);
  }
  return target;
}

const fallbackCityAnchors = [
  { id: 'ari', kind: 'scene', world: { x: -12, y: 7, z: 3 } },
  { id: 'river', kind: 'scene', world: { x: 9, y: 0, z: -9 } },
  { id: 'old-town', kind: 'scene', world: { x: -3, y: -10, z: -20 } },
];

export function createCityClusterTargets(count, payload = {}) {
  const measured = anchorsFrom(payload, ['fragment', 'scene', 'place']);
  const anchors = measured.length ? measured : fallbackCityAnchors;
  const target = bundle(count, { anchorCount: measured.length, clusterCount: Math.min(anchors.length, 6) });
  for (let index = 0; index < count; index += 1) {
    const group = index % anchors.length;
    const anchor = anchors[group].world;
    const theta = seeded(index, 8) * TAU;
    const radius = 0.7 + Math.pow(seeded(index, 9), 1.8) * 6.5;
    point(target, index,
      anchor.x + Math.cos(theta) * radius,
      anchor.y + Math.sin(theta) * radius * 0.55,
      anchor.z + (seeded(index, 10) - 0.5) * 7,
      0.72 + seeded(index, 11) * 0.26,
      group);
  }
  return target;
}

export function createMultiCityFieldTargets(count, payload = {}) {
  const depthBands = [5, -13, -31];
  const centers = [
    { x: -11, y: 2, z: depthBands[0] },
    { x: 10, y: 8, z: depthBands[1] },
    { x: 14, y: -9, z: depthBands[2] },
  ];
  const focused = Boolean(payload.query || payload.fragmentId);
  const target = bundle(count, { depthBands, cityCount: 3, focused });
  for (let index = 0; index < count; index += 1) {
    const group = index % 3;
    const center = centers[group];
    const theta = seeded(index, 12) * TAU;
    const shell = group > 0;
    const rawRadius = shell ? 5.2 + seeded(index, 13) * 1.5 : 0.8 + Math.pow(seeded(index, 13), 1.8) * 7.2;
    const relevance = focused && group !== 0 ? 0.42 : 1;
    point(target, index,
      center.x * relevance + Math.cos(theta) * rawRadius,
      center.y * relevance + Math.sin(theta) * rawRadius * 0.62,
      center.z + (seeded(index, 14) - 0.5) * (shell ? 2.5 : 8),
      focused && group !== 0 ? 0.16 : (shell ? 0.46 : 0.88),
      group);
  }
  return target;
}

export function createTimelineTargets(count, payload = {}) {
  const anchors = anchorsFrom(payload, ['scene', 'fragment']);
  const target = bundle(count, { anchorCount: anchors.length, structure: 'vertical-spine' });
  for (let index = 0; index < count; index += 1) {
    const t = index / Math.max(1, count - 1);
    if (index % 4 === 0 || !anchors.length) {
      point(target, index, -7.5, 14 - t * 28, -10, 0.74, 0);
      continue;
    }
    const group = index % anchors.length;
    const anchor = anchors[group].world;
    const theta = seeded(index, 15) * TAU;
    const radius = seeded(index, 16) * 2.8;
    point(target, index, anchor.x + Math.cos(theta) * radius, anchor.y + Math.sin(theta) * radius, anchor.z, 0.86, group + 1);
  }
  return target;
}

export function createPlaceMapTargets(count, payload = {}) {
  const measured = anchorsFrom(payload, ['place']);
  const anchors = measured.length ? measured : [
    { world: { x: -10, y: 7, z: -12 } }, { world: { x: 8, y: -5, z: -12 } }, { world: { x: 1, y: 11, z: -12 } },
  ];
  const target = bundle(count, { anchorCount: measured.length, structure: 'coordinate-density' });
  for (let index = 0; index < count; index += 1) {
    const group = index % anchors.length;
    const anchor = anchors[group].world;
    const theta = seeded(index, 17) * TAU;
    const radius = 0.6 + seeded(index, 18) * 3.8;
    point(target, index, anchor.x + Math.cos(theta) * radius, anchor.y + Math.sin(theta) * radius, anchor.z + (seeded(index, 19) - 0.5) * 2, 0.72, group);
  }
  return target;
}

export function createConnectionTargets(count, payload = {}) {
  const measured = anchorsFrom(payload, ['connection', 'fragment', 'place']);
  const nodes = measured.length >= 2 ? measured : [
    { world: { x: -14, y: 8, z: -10 } }, { world: { x: 0, y: -4, z: -8 } }, { world: { x: 14, y: 7, z: -13 } },
  ];
  const target = bundle(count, { anchorCount: measured.length, pathCount: Math.max(1, nodes.length - 1) });
  for (let index = 0; index < count; index += 1) {
    const group = index % Math.max(1, nodes.length - 1);
    const from = nodes[group].world;
    const to = nodes[group + 1].world;
    const t = seeded(index, 20);
    const curve = Math.sin(t * Math.PI) * (group % 2 ? -3.5 : 3.5);
    point(target, index,
      from.x + (to.x - from.x) * t,
      from.y + (to.y - from.y) * t + curve,
      from.z + (to.z - from.z) * t,
      0.78,
      group);
  }
  return target;
}

export function createDiscoveryTargets(count, payload = {}) {
  const measured = anchorsFrom(payload, ['fragment', 'entity', 'place']);
  const sources = measured.filter((anchor) => anchor.kind === 'fragment');
  const entity = measured.find((anchor) => anchor.kind === 'entity' || anchor.kind === 'place')?.world || { x: 0, y: -3, z: -7 };
  const fallback = [{ world: { x: -14, y: 8, z: -18 } }, { world: { x: 0, y: 10, z: -8 } }, { world: { x: 14, y: 6, z: 2 } }];
  const origins = sources.length ? sources : fallback;
  const target = bundle(count, { anchorCount: measured.length, phases: ['evidence', 'relations', 'entity'] });
  for (let index = 0; index < count; index += 1) {
    const group = index % origins.length;
    const origin = origins[group].world;
    const isPath = index % 3 === 0;
    if (isPath) {
      const t = seeded(index, 21);
      point(target, index,
        origin.x + (entity.x - origin.x) * t,
        origin.y + (entity.y - origin.y) * t + Math.sin(t * Math.PI) * 2.8,
        origin.z + (entity.z - origin.z) * t,
        0.9,
        group);
      continue;
    }
    const theta = seeded(index, 22) * TAU;
    const radius = Math.pow(seeded(index, 23), 2) * 4.4;
    point(target, index, origin.x + Math.cos(theta) * radius, origin.y + Math.sin(theta) * radius, origin.z, 0.76, group);
  }
  return target;
}

export function createElseOrbTargets(count, payload = {}) {
  const anchor = anchorsFrom(payload).find((item) => item.id?.includes('else'))?.world || { x: 13, y: -12, z: 2 };
  const target = bundle(count, { state: payload.state || 'idle' });
  const closure = payload.state === 'uncertain' ? 0.72 : 1;
  for (let index = 0; index < count; index += 1) {
    const theta = seeded(index, 24) * TAU * closure;
    const phi = Math.acos(1 - 2 * seeded(index, 25));
    const radius = 2.2 + seeded(index, 26) * 0.8;
    const split = payload.state === 'conflict' && index % 2 ? -1 : 1;
    point(target, index,
      anchor.x + Math.sin(phi) * Math.cos(theta) * radius * split,
      anchor.y + Math.cos(phi) * radius,
      anchor.z + Math.sin(phi) * Math.sin(theta) * radius,
      0.68,
      split);
  }
  return target;
}

export function createImportBatchTargets(count, payload = {}) {
  const measured = anchorsFrom(payload);
  const anchors = measured.length ? measured : [{ world: { x: 0, y: 0, z: -8 } }];
  const target = bundle(count, { structure: 'batch-orbits', anchorCount: measured.length });
  for (let index = 0; index < count; index += 1) {
    const group = index % 4;
    const anchor = anchors[index % anchors.length].world;
    const theta = seeded(index, 27) * TAU;
    const radius = 3 + group * 2.1 + seeded(index, 28) * 0.8;
    point(target, index, anchor.x + Math.cos(theta) * radius, anchor.y + Math.sin(theta) * radius * 0.62, anchor.z - group * 1.2, 0.72, group);
  }
  return target;
}

export function createLensTargets(count, payload = {}) {
  const selected = anchorsFrom(payload).find((anchor) => anchor.id === payload.fragmentId) || anchorsFrom(payload)[0];
  return createCityClusterTargets(count, { anchors: selected ? [selected] : [] });
}

export function createSemanticTarget(mode, count, payload = {}) {
  const generators = {
    empty: createEmptyTargets,
    'deep-scatter': createDeepScatterTargets,
    globe: createGlobeTargets,
    world: createGlobeTargets,
    'world-intro': createGlobeTargets,
    city: createCityClusterTargets,
    'city-burst': createCityClusterTargets,
    'city-field': createCityClusterTargets,
    'city-clusters': createCityClusterTargets,
    field: createMultiCityFieldTargets,
    'fragment-field': createMultiCityFieldTargets,
    'multi-city-field': createMultiCityFieldTargets,
    timeline: createTimelineTargets,
    'timeline-spine': createTimelineTargets,
    map: createPlaceMapTargets,
    'place-map': createPlaceMapTargets,
    relations: createConnectionTargets,
    connection: createConnectionTargets,
    connections: createConnectionTargets,
    inbox: createConnectionTargets,
    discovery: createDiscoveryTargets,
    'discovery-growth': createDiscoveryTargets,
    else: createElseOrbTargets,
    'else-orb': createElseOrbTargets,
    import: createImportBatchTargets,
    'import-batch': createImportBatchTargets,
    processing: createImportBatchTargets,
    lens: createLensTargets,
    'lens-focus': createLensTargets,
    capsule: createCityClusterTargets,
    'capsule-chapters': createCityClusterTargets,
    onboarding: createCityClusterTargets,
    'onboarding-cluster': createCityClusterTargets,
    quiet: createEmptyTargets,
    'quiet-tool': createEmptyTargets,
  };
  return (generators[mode] || createEmptyTargets)(count, payload);
}
