const TAU = Math.PI * 2;

function seeded(index, salt = 1) {
  const value = Math.sin((index + 1) * (12.9898 + salt * 7.233)) * 43758.5453;
  return value - Math.floor(value);
}

const write = (array, index, x, y, z) => {
  const offset = index * 3;
  array[offset] = x;
  array[offset + 1] = y;
  array[offset + 2] = z;
};

function deepScatter(count) {
  const result = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const theta = seeded(i, 1) * TAU;
    const radius = 14 + seeded(i, 2) * 78;
    const depth = -70 + seeded(i, 3) * 132;
    write(result, i, Math.cos(theta) * radius, Math.sin(theta) * radius * 0.7, depth);
  }
  return result;
}

function globe(count, radius = 10.8) {
  const result = new Float32Array(count * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i += 1) {
    const y = 1 - (i / Math.max(1, count - 1)) * 2;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    const contour = 1 + (seeded(i, 4) - 0.5) * 0.055;
    write(result, i, Math.cos(theta) * ring * radius * contour, y * radius * contour, Math.sin(theta) * ring * radius * contour);
  }
  return result;
}

function cityBurst(count) {
  const result = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const theta = seeded(i, 6) * TAU;
    const radius = 8 + Math.pow(seeded(i, 7), 0.45) * 46;
    const lane = (i % 7) - 3;
    write(result, i, 8 + Math.cos(theta) * radius, -2 + Math.sin(theta) * radius * 0.5, 24 - radius * 0.72 + lane);
  }
  return result;
}

function cityField(count) {
  const result = new Float32Array(count * 3);
  const clusters = [
    [-15, 6, -8], [8, 10, -20], [19, -7, -4], [-5, -11, 7], [1, 1, -35],
  ];
  for (let i = 0; i < count; i += 1) {
    const cluster = clusters[i % clusters.length];
    const angle = seeded(i, 8) * TAU;
    const radius = Math.pow(seeded(i, 9), 1.7) * 12;
    write(result, i, cluster[0] + Math.cos(angle) * radius, cluster[1] + Math.sin(angle) * radius * 0.62, cluster[2] + (seeded(i, 10) - 0.5) * 15);
  }
  return result;
}

function fragmentField(count, payload = {}) {
  const result = new Float32Array(count * 3);
  const focused = Boolean(payload.query || payload.fragmentId);
  for (let i = 0; i < count; i += 1) {
    const band = i % 9;
    const angle = seeded(i, 11) * TAU;
    const radial = 5 + seeded(i, 12) * (focused ? 22 : 48);
    const relevance = focused && i % 5 !== 0 ? 0.35 : 1;
    write(result, i, Math.cos(angle) * radial * relevance, (band - 4) * 2.4 + Math.sin(angle) * 4, -42 + band * 7 + (seeded(i, 13) - 0.5) * 9);
  }
  return result;
}

function discovery(count) {
  const result = new Float32Array(count * 3);
  const dates = [[-16, 1, -17], [0, 8, -2], [15, -4, 10]];
  for (let i = 0; i < count; i += 1) {
    const node = dates[i % 3];
    const theta = seeded(i, 14) * TAU;
    const radius = Math.pow(seeded(i, 15), 2) * 10;
    const bridge = i % 11 === 0;
    const t = seeded(i, 16);
    if (bridge) write(result, i, -16 + t * 31, 1 + Math.sin(t * Math.PI) * 7, -17 + t * 27);
    else write(result, i, node[0] + Math.cos(theta) * radius, node[1] + Math.sin(theta) * radius, node[2] + (seeded(i, 17) - 0.5) * 8);
  }
  return result;
}

function quiet(count) {
  const result = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const theta = seeded(i, 18) * TAU;
    const radius = 26 + seeded(i, 19) * 40;
    write(result, i, Math.cos(theta) * radius, Math.sin(theta) * radius, -35 - seeded(i, 20) * 35);
  }
  return result;
}

function timeline(count) {
  const result = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const date = i % 5;
    const t = seeded(i, 24);
    const x = -28 + date * 14 + (t - 0.5) * 5;
    const y = Math.sin(t * Math.PI * 2) * (2 + date * 0.7);
    write(result, i, x, y, -24 + date * 9 + (seeded(i, 25) - 0.5) * 6);
  }
  return result;
}

function mapTarget(count) {
  const result = new Float32Array(count * 3);
  const anchors = [[-18,-8],[6,-15],[20,8],[-4,14]];
  for (let i = 0; i < count; i += 1) {
    const anchor = anchors[i % anchors.length];
    const angle = seeded(i, 26) * TAU;
    const radius = seeded(i, 27) * 10;
    write(result, i, anchor[0] + Math.cos(angle) * radius, anchor[1] + Math.sin(angle) * radius, -12 + (seeded(i, 28) - 0.5) * 7);
  }
  return result;
}

function relations(count) {
  const result = new Float32Array(count * 3);
  const nodes = [[-22,9,-20],[-7,-8,2],[8,12,-8],[23,-5,9]];
  for (let i = 0; i < count; i += 1) {
    const from = nodes[i % nodes.length];
    const to = nodes[(i + 1) % nodes.length];
    const t = seeded(i, 29);
    const curve = Math.sin(t * Math.PI) * 8;
    write(result, i, from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t + curve, from[2] + (to[2] - from[2]) * t);
  }
  return result;
}

function elseOrb(count, payload = {}) {
  const result = quiet(count);
  const closure = payload.state === 'uncertain' ? 0.72 : 1;
  const split = payload.state === 'conflict';
  const found = payload.state === 'found';
  const activeCount = Math.min(count, Math.floor(count * (found ? 0.58 : 0.17)));
  for (let i = 0; i < activeCount; i += 1) {
    if (found && i % 3 !== 0) {
      const source = [[-24, 13, -18], [-5, -16, 4], [19, 8, -7]][i % 3];
      const t = seeded(i, 30);
      write(result, i, source[0] + (17 - source[0]) * t, source[1] + (-12 - source[1]) * t + Math.sin(t * Math.PI) * 5, source[2] + (7 - source[2]) * t);
      continue;
    }
    const theta = seeded(i, 21) * TAU * closure;
    const phi = Math.acos(1 - 2 * seeded(i, 22));
    const radius = 3.2 + seeded(i, 23) * 1.4;
    const direction = split && i % 2 ? -1 : 1;
    write(result, i, 17 * direction + Math.sin(phi) * Math.cos(theta) * radius, -12 + Math.cos(phi) * radius, 7 + Math.sin(phi) * Math.sin(theta) * radius);
  }
  return result;
}

export function createSemanticTarget(mode, count, payload = {}) {
  if (mode === 'deep-scatter') return deepScatter(count);
  if (mode === 'globe' || mode === 'world' || mode === 'world-intro') return globe(count);
  if (mode === 'city-burst') return cityBurst(count);
  if (mode === 'city' || mode === 'city-field' || mode === 'capsule') return cityField(count);
  if (mode === 'fragment-field' || mode === 'field') return fragmentField(count, payload);
  if (mode === 'discovery') return discovery(count);
  if (mode === 'timeline') return timeline(count);
  if (mode === 'map') return mapTarget(count);
  if (mode === 'relations' || mode === 'connection') return relations(count);
  if (mode === 'else') return elseOrb(count, payload);
  return quiet(count);
}
