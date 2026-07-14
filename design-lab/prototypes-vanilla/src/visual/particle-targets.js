/**
 * 语义粒子目标 v5。
 * 每个目标都是一种记忆状态的几何表达，不存在纯装饰分布：
 *   globe          —— 大陆点云 + 城市锚点（世界索引）
 *   cityCluster    —— 三个记忆聚类沿一条 S 形心流（一段旅行）
 *   multiCityField —— 多城市数据库星团 + 未安放边缘（全部碎片）
 *   timeline       —— 时间脊柱 + 日期节点 + 重复弧线
 *   placeMap       —— 地点锚点密度（真实相对坐标）
 *   connection     —— 关系流线（confirmed/suggested/unresolved/conflict）
 *   discovery      —— 证据环 → 汇入中心的收束云
 *   inboxDecision  —— 两份证据之间的未闭合关系线
 *   importBatch    —— 底部流入并凝聚的批次节点
 *   elseOrb        —— Else 状态（idle/reading/found/uncertain/conflict）
 *   capsuleDust    —— 暗房灰尘（Capsule 阅读）
 *   quiet          —— 工具页极弱远景
 *
 * 粒子池索引约定（与 particle-system.js 对齐）：
 *   [0, 0.82)    主结构
 *   [0.82, 0.96) 环境 / 次级
 *   [0.96, 1.0)  强调锚点（更亮更大）
 */
import { cities, places, scenes, connections } from '../fixtures/data.js';

const TAU = Math.PI * 2;
export const POOL_MAIN = 0.82;
export const POOL_HALO = 0.96;

export const GLOBE_RADIUS = 7.3;
const GLOBE_LNG0 = 100; // 亚洲面向镜头

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

/* ---------------------------------------------------------------- 大陆掩膜 */

let landDirs = null; // Float32Array 单位向量 xyz
const landReadyCallbacks = [];

export function dirFromLatLng(lat, lng, lng0 = GLOBE_LNG0) {
  const latRad = (lat * Math.PI) / 180;
  const lngRad = ((lng - lng0) * Math.PI) / 180;
  return [
    Math.cos(latRad) * Math.sin(lngRad),
    Math.sin(latRad),
    Math.cos(latRad) * Math.cos(lngRad),
  ];
}

export function isLandMaskReady() {
  return Boolean(landDirs);
}

export function onLandMaskReady(callback) {
  if (landDirs) callback();
  else landReadyCallbacks.push(callback);
}

/** 从 earth-topology 灰度图采样陆地方向；浏览器环境异步执行一次。 */
export function loadLandMask(url = '/assets/earth-topology.png') {
  if (landDirs || typeof Image === 'undefined' || typeof document === 'undefined') return;
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.onload = () => {
    try {
      const w = 320;
      const h = 160;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0, w, h);
      const { data } = context.getImageData(0, 0, w, h);
      const luminance = new Float32Array(w * h);
      const sorted = [];
      for (let i = 0; i < w * h; i += 1) {
        const alpha = data[i * 4 + 3] / 255;
        const value = ((data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 765) * alpha;
        luminance[i] = value;
        sorted.push(value);
      }
      sorted.sort((a, b) => a - b);
      // 自适应阈值：亮度前 ~30% 视为陆地（地球陆地占比 ~29%）
      const threshold = Math.max(0.06, sorted[Math.floor(sorted.length * 0.7)]);
      const dirs = [];
      for (let py = 0; py < h; py += 1) {
        const lat = 90 - (py / (h - 1)) * 180;
        // 等距圆柱投影在高纬度过采样，按 cos(lat) 抽稀避免极区堆积
        const keep = Math.cos((lat * Math.PI) / 180);
        for (let px = 0; px < w; px += 1) {
          const i = py * w + px;
          if (luminance[i] < threshold) continue;
          if (seeded(i, 41) > keep) continue;
          const lng = (px / (w - 1)) * 360 - 180;
          const [x, y, z] = dirFromLatLng(lat, lng);
          dirs.push(x, y, z);
        }
      }
      if (dirs.length >= 300) {
        landDirs = new Float32Array(dirs);
        landReadyCallbacks.splice(0).forEach((callback) => callback());
      }
    } catch {
      /* 采样失败保持斐波那契降级 */
    }
  };
  image.src = url;
}

/* ------------------------------------------------------------------ 工具 */

const cityDirs = cities.map((city) => ({
  slug: city.slug,
  dir: dirFromLatLng(city.coordinates.lat, city.coordinates.lng),
  weight: city.fragmentCount,
}));

function gaussian(i, salt) {
  return (seeded(i, salt) + seeded(i, salt + 13) - 1);
}

function bezier(p0, p1, p2, t) {
  const u = 1 - t;
  return [
    u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
    u * u * p0[2] + 2 * u * t * p1[2] + t * t * p2[2],
  ];
}

/* ------------------------------------------------------------------ 目标 */

function deepScatter(count) {
  const result = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const theta = seeded(i, 1) * TAU;
    const radius = 10 + seeded(i, 2) * 60;
    const depth = -80 + seeded(i, 3) * 120;
    write(result, i, Math.cos(theta) * radius, Math.sin(theta) * radius * 0.8, depth);
  }
  return result;
}

function globe(count) {
  const result = new Float32Array(count * 3);
  const mainEnd = Math.floor(count * POOL_MAIN);
  const haloEnd = Math.floor(count * POOL_HALO);
  const R = GLOBE_RADIUS;

  for (let i = 0; i < mainEnd; i += 1) {
    if (landDirs) {
      const pick = Math.floor(seeded(i, 5) * (landDirs.length / 3)) * 3;
      const jitter = 0.012;
      const x = landDirs[pick] + (seeded(i, 6) - 0.5) * jitter;
      const y = landDirs[pick + 1] + (seeded(i, 7) - 0.5) * jitter;
      const z = landDirs[pick + 2] + (seeded(i, 8) - 0.5) * jitter;
      const norm = Math.hypot(x, y, z) || 1;
      const rr = R * (1 + (seeded(i, 9) - 0.5) * 0.012);
      write(result, i, (x / norm) * rr, (y / norm) * rr, (z / norm) * rr);
    } else {
      // 掩膜未就绪的临时球面（加载后会重新凝聚成大陆）
      const golden = Math.PI * (3 - Math.sqrt(5));
      const y = 1 - (i / Math.max(1, mainEnd - 1)) * 2;
      const ring = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = golden * i;
      write(result, i, Math.cos(theta) * ring * R, y * R, Math.sin(theta) * ring * R);
    }
  }

  // 环境层：极稀薄的深空尘埃（世界仍在生长，不是星空壁纸）
  for (let i = mainEnd; i < haloEnd; i += 1) {
    const theta = seeded(i, 10) * TAU;
    const radius = R * (1.5 + seeded(i, 11) * 3.4);
    const y = (seeded(i, 12) - 0.5) * R * 2.4;
    write(result, i, Math.cos(theta) * radius, y, -R - seeded(i, 13) * 26);
  }

  // 强调层：三座城市锚点（亮点小簇，大小按碎片数）
  const totalWeight = cityDirs.reduce((sum, c) => sum + c.weight, 0);
  let cursor = haloEnd;
  cityDirs.forEach((city, index) => {
    const share = index === cityDirs.length - 1
      ? count - cursor
      : Math.floor((count - haloEnd) * (city.weight / totalWeight));
    for (let k = 0; k < share; k += 1) {
      const i = cursor + k;
      const spread = 0.035 + seeded(i, 14) * 0.05;
      const x = city.dir[0] + gaussian(i, 15) * spread;
      const y = city.dir[1] + gaussian(i, 16) * spread;
      const z = city.dir[2] + gaussian(i, 17) * spread;
      const norm = Math.hypot(x, y, z) || 1;
      const rr = R * 1.008;
      write(result, i, (x / norm) * rr, (y / norm) * rr, (z / norm) * rr);
    }
    cursor += share;
  });
  return result;
}

function cityBurst(count) {
  const result = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const theta = seeded(i, 6) * TAU;
    const radius = 6 + Math.pow(seeded(i, 7), 0.45) * 40;
    write(result, i, Math.cos(theta) * radius, Math.sin(theta) * radius * 0.6, 20 - radius * 0.7);
  }
  return result;
}

const DEFAULT_CITY_ANCHORS = [
  { x: 3.2, y: 5.6, z: -3, weight: 1 },    // Ari 早晨（右上）
  { x: -3.4, y: 0.6, z: -1, weight: 0.9 }, // 河岸傍晚（左中）
  { x: 1.2, y: -5, z: -4, weight: 0.8 },   // Old Town（下）
];

function cityCluster(count, payload = {}) {
  const anchors = (payload.anchors?.length ? payload.anchors : DEFAULT_CITY_ANCHORS)
    .map((anchor) => ({ z: -2, weight: 1, ...anchor }));
  const result = new Float32Array(count * 3);
  const mainEnd = Math.floor(count * POOL_MAIN);
  const haloEnd = Math.floor(count * POOL_HALO);
  const streamShare = Math.floor(mainEnd * 0.34);

  // 主结构 A：S 形心流串联聚类（记忆在同一段旅行里流动）
  for (let i = 0; i < streamShare; i += 1) {
    const t = seeded(i, 18);
    const segFloat = t * (anchors.length - 1);
    const seg = Math.min(anchors.length - 2, Math.floor(segFloat));
    const local = segFloat - seg;
    const a = anchors[seg];
    const b = anchors[seg + 1];
    const mid = [
      (a.x + b.x) / 2 + (seg % 2 ? -3.4 : 3.4),
      (a.y + b.y) / 2,
      ((a.z + b.z) / 2) - 2,
    ];
    const [x, y, z] = bezier([a.x, a.y, a.z], mid, [b.x, b.y, b.z], local);
    const spread = 0.24 + seeded(i, 19) * 0.5;
    write(result, i, x + gaussian(i, 20) * spread, y + gaussian(i, 21) * spread, z + gaussian(i, 22) * spread);
  }

  // 主结构 B：聚类体（每个记忆群的粒子骨架）
  for (let i = streamShare; i < mainEnd; i += 1) {
    const anchor = anchors[i % anchors.length];
    const radius = Math.pow(seeded(i, 23), 1.6) * 3.4 * (anchor.weight || 1);
    const theta = seeded(i, 24) * TAU;
    write(
      result, i,
      anchor.x + Math.cos(theta) * radius,
      anchor.y + Math.sin(theta) * radius * 0.72,
      anchor.z + (seeded(i, 25) - 0.5) * 4,
    );
  }

  // 环境层：远景微尘制造景深
  for (let i = mainEnd; i < haloEnd; i += 1) {
    write(result, i, (seeded(i, 26) - 0.5) * 26, (seeded(i, 27) - 0.5) * 34, -18 - seeded(i, 28) * 30);
  }

  // 强调层：聚类核心
  for (let i = haloEnd; i < count; i += 1) {
    const anchor = anchors[i % anchors.length];
    write(result, i, anchor.x + gaussian(i, 29) * 0.5, anchor.y + gaussian(i, 30) * 0.5, anchor.z + 0.5);
  }
  return result;
}

/** 全部碎片：多城市星团。focusCity 时目标城市入中心，其余退远。 */
function multiCityField(count, payload = {}) {
  const focus = payload.focusCity || null;
  const clusters = [
    { slug: 'bangkok', x: -2.6, y: 2.2, z: -6, r: 4.6, weight: 63 },
    { slug: 'tokyo', x: 5.4, y: 5.4, z: -30, r: 3.6, weight: 81 },
    { slug: 'chiang-mai', x: -6.6, y: -3.4, z: -22, r: 2.8, weight: 28 },
    { slug: 'unplaced', x: 3.4, y: -6.4, z: -12, r: 2.2, weight: 10 },
  ].map((cluster) => {
    if (!focus) return cluster;
    if (cluster.slug === focus) return { ...cluster, x: 0, y: 0.6, z: -3, r: cluster.r * 1.15 };
    return { ...cluster, x: cluster.x * 1.7, y: cluster.y * 1.55, z: cluster.z - 26 };
  });

  const totalWeight = clusters.reduce((sum, c) => sum + c.weight, 0);
  const result = new Float32Array(count * 3);
  const mainEnd = Math.floor(count * POOL_MAIN);
  const haloEnd = Math.floor(count * POOL_HALO);

  let cursor = 0;
  clusters.forEach((cluster, index) => {
    const share = index === clusters.length - 1
      ? mainEnd - cursor
      : Math.floor(mainEnd * (cluster.weight / totalWeight));
    for (let k = 0; k < share; k += 1) {
      const i = cursor + k;
      const loose = cluster.slug === 'unplaced' ? 2.1 : 1;
      const radius = Math.pow(seeded(i, 31), cluster.slug === 'unplaced' ? 0.7 : 1.5) * cluster.r * loose;
      const theta = seeded(i, 32) * TAU;
      const phi = Math.acos(1 - 2 * seeded(i, 33));
      write(
        result, i,
        cluster.x + Math.sin(phi) * Math.cos(theta) * radius,
        cluster.y + Math.sin(phi) * Math.sin(theta) * radius * 0.8,
        cluster.z + Math.cos(phi) * radius * 1.6,
      );
    }
    cursor += share;
  });

  // 环境层：城市之间的极稀疏连接尘埃（数据世界仍在呼吸）
  for (let i = mainEnd; i < haloEnd; i += 1) {
    const a = clusters[i % clusters.length];
    const b = clusters[(i + 1) % clusters.length];
    const t = seeded(i, 34);
    write(
      result, i,
      a.x + (b.x - a.x) * t + gaussian(i, 35) * 1.4,
      a.y + (b.y - a.y) * t + gaussian(i, 36) * 1.4,
      a.z + (b.z - a.z) * t,
    );
  }

  // 强调层：聚焦城市核心（或 Bangkok 默认）
  const core = clusters.find((cluster) => cluster.slug === (focus || 'bangkok')) || clusters[0];
  for (let i = haloEnd; i < count; i += 1) {
    write(result, i, core.x + gaussian(i, 37) * 0.8, core.y + gaussian(i, 38) * 0.8, core.z + 1.2);
  }
  return result;
}

/** 时间视角：垂直时间脊柱 + 日期节点 + 重复时间弧线。 */
function timeline(count) {
  const days = [...new Set(scenes.map((scene) => scene.date))].sort();
  const spineX = -4.6;
  const yTop = 7.5;
  const yBottom = -7.5;
  const yFor = (dayIndex) => yTop - (dayIndex / Math.max(1, days.length - 1)) * (yTop - yBottom);
  const repeated = scenes
    .filter((scene) => scene.placeId === 'place-common-grounds')
    .map((scene) => days.indexOf(scene.date));

  const result = new Float32Array(count * 3);
  const mainEnd = Math.floor(count * POOL_MAIN);
  const haloEnd = Math.floor(count * POOL_HALO);
  const spineShare = Math.floor(mainEnd * 0.3);
  const arcShare = Math.floor(mainEnd * 0.18);

  for (let i = 0; i < spineShare; i += 1) {
    const t = seeded(i, 40);
    write(result, i, spineX + (seeded(i, 41) - 0.5) * 0.22, yTop - t * (yTop - yBottom), -4 + (seeded(i, 42) - 0.5) * 1.2);
  }
  // 重复弧线：Common Grounds 三次到访在时间外侧划出弧
  for (let i = spineShare; i < spineShare + arcShare; i += 1) {
    const t = seeded(i, 43);
    const from = yFor(repeated[0] ?? 0);
    const to = yFor(repeated[repeated.length - 1] ?? 0);
    const [x, y, z] = bezier([spineX, from, -4], [spineX - 3.6, (from + to) / 2, -2], [spineX, to, -4], t);
    write(result, i, x + gaussian(i, 44) * 0.16, y, z);
  }
  // 日期节点附着的碎片群
  for (let i = spineShare + arcShare; i < mainEnd; i += 1) {
    const day = i % days.length;
    const y = yFor(day);
    const radius = Math.pow(seeded(i, 45), 1.4) * 2.2;
    const theta = seeded(i, 46) * TAU;
    write(result, i, spineX + 3 + Math.cos(theta) * radius + day * 0.4, y + Math.sin(theta) * radius * 0.5, -5 + (seeded(i, 47) - 0.5) * 3);
  }
  for (let i = mainEnd; i < haloEnd; i += 1) {
    write(result, i, (seeded(i, 48) - 0.5) * 24, (seeded(i, 49) - 0.5) * 30, -20 - seeded(i, 50) * 24);
  }
  for (let i = haloEnd; i < count; i += 1) {
    const day = i % days.length;
    write(result, i, spineX + gaussian(i, 51) * 0.14, yFor(day) + gaussian(i, 52) * 0.14, -3.6);
  }
  return result;
}

/** 地点视角：真实相对坐标的地点密度图。 */
function placeMap(count) {
  const kx = 90;
  const ky = 110;
  const anchors = places
    .filter((place) => place.coordinates)
    .map((place) => ({
      x: (place.coordinates.lng - 100.52) * kx,
      y: (place.coordinates.lat - 13.752) * ky,
      weight: place.visitCount || 1,
      status: place.status,
    }));
  const result = new Float32Array(count * 3);
  const mainEnd = Math.floor(count * POOL_MAIN);
  const haloEnd = Math.floor(count * POOL_HALO);
  const riverShare = Math.floor(mainEnd * 0.16);

  // 河流走廊（湄南河南北向弱曲线）—— 地图骨架而非装饰
  for (let i = 0; i < riverShare; i += 1) {
    const t = seeded(i, 53);
    const x = -0.4 + Math.sin(t * Math.PI * 1.2) * 1.4;
    const y = 8 - t * 17;
    write(result, i, x + gaussian(i, 54) * 0.3, y, -6 - seeded(i, 55) * 2);
  }
  const totalWeight = anchors.reduce((sum, a) => sum + a.weight, 0);
  let cursor = riverShare;
  anchors.forEach((anchor, index) => {
    const share = index === anchors.length - 1
      ? mainEnd - cursor
      : Math.floor((mainEnd - riverShare) * (anchor.weight / totalWeight));
    for (let k = 0; k < share; k += 1) {
      const i = cursor + k;
      const spread = anchor.status === 'unresolved' ? 1.9 : 0.9;
      const radius = Math.pow(seeded(i, 56), 1.5) * spread * (0.8 + anchor.weight * 0.28);
      const theta = seeded(i, 57) * TAU;
      write(result, i, anchor.x + Math.cos(theta) * radius, anchor.y + Math.sin(theta) * radius, -4 + (seeded(i, 58) - 0.5) * 2);
    }
    cursor += share;
  });
  for (let i = mainEnd; i < haloEnd; i += 1) {
    write(result, i, (seeded(i, 59) - 0.5) * 22, (seeded(i, 60) - 0.5) * 26, -18 - seeded(i, 61) * 20);
  }
  for (let i = haloEnd; i < count; i += 1) {
    const anchor = anchors[i % anchors.length];
    write(result, i, anchor.x + gaussian(i, 62) * 0.3, anchor.y + gaussian(i, 63) * 0.3, -3);
  }
  return result;
}

/** 连接视角：真实关系的流线。断裂 = 未决，虚线 = 建议，分叉 = 冲突。 */
function connectionField(count, payload = {}) {
  const nodes = payload.anchors?.length
    ? payload.anchors.map((anchor) => ({ z: -3, ...anchor }))
    : [
      { x: -4.6, y: 4.6, z: -4 }, { x: 3.8, y: 5.8, z: -8 }, { x: -1.2, y: 0, z: -2 },
      { x: -5.2, y: -4.6, z: -7 }, { x: 4.4, y: -4.2, z: -4 },
    ];
  const edges = connections.map((connection, index) => ({
    from: nodes[index % nodes.length],
    to: nodes[(index + 2) % nodes.length],
    status: connection.status,
  }));
  const result = new Float32Array(count * 3);
  const mainEnd = Math.floor(count * POOL_MAIN);
  const haloEnd = Math.floor(count * POOL_HALO);

  for (let i = 0; i < mainEnd; i += 1) {
    const edge = edges[i % edges.length];
    let t = seeded(i, 64);
    if (edge.status === 'unresolved' && t > 0.42 && t < 0.62) t = t < 0.52 ? 0.42 : 0.62;
    if (edge.status === 'suggested' && Math.floor(t * 12) % 2 === 1) t = Math.min(1, Math.floor(t * 12 + 1) / 12);
    const lift = Math.sin(t * Math.PI) * 1.8;
    const x = edge.from.x + (edge.to.x - edge.from.x) * t;
    let y = edge.from.y + (edge.to.y - edge.from.y) * t + lift;
    const z = edge.from.z + (edge.to.z - edge.from.z) * t;
    if (edge.status === 'conflicted' && t > 0.5) y += (i % 2 ? 1 : -1) * (t - 0.5) * 4;
    write(result, i, x + gaussian(i, 65) * 0.14, y + gaussian(i, 66) * 0.14, z);
  }
  for (let i = mainEnd; i < haloEnd; i += 1) {
    write(result, i, (seeded(i, 67) - 0.5) * 24, (seeded(i, 68) - 0.5) * 28, -16 - seeded(i, 69) * 22);
  }
  for (let i = haloEnd; i < count; i += 1) {
    const node = nodes[i % nodes.length];
    write(result, i, node.x + gaussian(i, 70) * 0.3, node.y + gaussian(i, 71) * 0.3, node.z + 0.6);
  }
  return result;
}

/** 发现：证据节点各自成环，流线汇入中心核。 */
function discovery(count, payload = {}) {
  const evidence = payload.anchors?.length
    ? payload.anchors.map((anchor) => ({ z: -3, ...anchor }))
    : [{ x: -4.4, y: 4, z: -5 }, { x: 4.6, y: 2.6, z: -7 }, { x: -3.4, y: -4.2, z: -4 }, { x: 4, y: -4.8, z: -6 }];
  const core = payload.core ? { z: -2, ...payload.core } : { x: 0.4, y: 0.2, z: -2 };
  const result = new Float32Array(count * 3);
  const mainEnd = Math.floor(count * POOL_MAIN);
  const haloEnd = Math.floor(count * POOL_HALO);
  const ringShare = Math.floor(mainEnd * 0.36);

  // 证据环
  for (let i = 0; i < ringShare; i += 1) {
    const node = evidence[i % evidence.length];
    const radius = 1 + seeded(i, 72) * 0.5;
    const theta = seeded(i, 73) * TAU;
    write(result, i, node.x + Math.cos(theta) * radius, node.y + Math.sin(theta) * radius, node.z + (seeded(i, 74) - 0.5));
  }
  // 汇入流线
  for (let i = ringShare; i < mainEnd; i += 1) {
    const node = evidence[i % evidence.length];
    const t = Math.pow(seeded(i, 75), 0.8);
    const mid = [(node.x + core.x) / 2 + gaussian(i, 76) * 1.6, (node.y + core.y) / 2 + gaussian(i, 77) * 1.6, (node.z + core.z) / 2];
    const [x, y, z] = bezier([node.x, node.y, node.z], mid, [core.x, core.y, core.z], t);
    const tighten = 0.5 - Math.abs(t - 0.5) * 0.7;
    write(result, i, x + gaussian(i, 78) * tighten, y + gaussian(i, 79) * tighten, z);
  }
  for (let i = mainEnd; i < haloEnd; i += 1) {
    write(result, i, (seeded(i, 80) - 0.5) * 22, (seeded(i, 81) - 0.5) * 28, -18 - seeded(i, 82) * 24);
  }
  // 中心收束核
  for (let i = haloEnd; i < count; i += 1) {
    const radius = Math.pow(seeded(i, 83), 2.2) * 1.1;
    const theta = seeded(i, 84) * TAU;
    write(result, i, core.x + Math.cos(theta) * radius, core.y + Math.sin(theta) * radius, core.z + (seeded(i, 85) - 0.5) * 0.8);
  }
  return result;
}

/** 收件箱：两份证据之间的未闭合关系线。result: open | confirmed | rejected */
function inboxDecision(count, payload = {}) {
  const [a, b] = payload.anchors?.length === 2
    ? payload.anchors.map((anchor) => ({ z: -2, ...anchor }))
    : [{ x: -3.6, y: 1.2, z: -2 }, { x: 3.6, y: 1.2, z: -2 }];
  const state = payload.result || 'open';
  const result = new Float32Array(count * 3);
  const mainEnd = Math.floor(count * POOL_MAIN);
  const haloEnd = Math.floor(count * POOL_HALO);

  for (let i = 0; i < mainEnd; i += 1) {
    let t = seeded(i, 86);
    if (state === 'open' && t > 0.44 && t < 0.56) {
      // 中心问号区：粒子悬浮不连线
      const theta = seeded(i, 87) * TAU;
      const radius = 0.5 + seeded(i, 88) * 0.4;
      write(result, i, (a.x + b.x) / 2 + Math.cos(theta) * radius, (a.y + b.y) / 2 + Math.sin(theta) * radius, a.z);
      continue;
    }
    if (state === 'rejected') {
      t = t < 0.5 ? t * 0.64 : 1 - (1 - t) * 0.64;
    }
    const lift = state === 'confirmed' ? 0 : Math.sin(t * Math.PI) * 0.5;
    write(
      result, i,
      a.x + (b.x - a.x) * t + gaussian(i, 89) * 0.1,
      a.y + (b.y - a.y) * t + lift + gaussian(i, 90) * 0.1,
      a.z + (seeded(i, 91) - 0.5) * 0.5,
    );
  }
  for (let i = mainEnd; i < haloEnd; i += 1) {
    write(result, i, (seeded(i, 92) - 0.5) * 20, (seeded(i, 93) - 0.5) * 24, -20 - seeded(i, 94) * 20);
  }
  for (let i = haloEnd; i < count; i += 1) {
    const end = i % 2 ? a : b;
    write(result, i, end.x + gaussian(i, 95) * 0.3, end.y + gaussian(i, 96) * 0.3, end.z + 0.4);
  }
  return result;
}

/** 导入：碎片从底部流入，凝聚成批次节点。 */
function importBatch(count, payload = {}) {
  const node = payload.node ? { z: -3, ...payload.node } : { x: 0, y: 1.4, z: -3 };
  const result = new Float32Array(count * 3);
  const mainEnd = Math.floor(count * POOL_MAIN);
  const haloEnd = Math.floor(count * POOL_HALO);

  for (let i = 0; i < mainEnd; i += 1) {
    const t = Math.pow(seeded(i, 97), 0.72);
    const lane = ((i % 5) - 2) * 1.7;
    const [x, y, z] = bezier([lane * 1.8, -13, 2], [lane, -4, -1], [node.x, node.y, node.z], t);
    const tighten = (1 - t) * 1.1 + 0.12;
    write(result, i, x + gaussian(i, 98) * tighten, y + gaussian(i, 99) * tighten * 0.5, z);
  }
  for (let i = mainEnd; i < haloEnd; i += 1) {
    write(result, i, (seeded(i, 100) - 0.5) * 20, (seeded(i, 101) - 0.5) * 26, -18 - seeded(i, 102) * 20);
  }
  for (let i = haloEnd; i < count; i += 1) {
    const radius = Math.pow(seeded(i, 103), 2) * 0.9;
    const theta = seeded(i, 104) * TAU;
    write(result, i, node.x + Math.cos(theta) * radius, node.y + Math.sin(theta) * radius, node.z + 0.4);
  }
  return result;
}

function elseOrb(count, payload = {}) {
  const state = payload.state || 'idle';
  const center = payload.center ? { z: -1, ...payload.center } : { x: 0, y: -2.4, z: -1 };
  const result = new Float32Array(count * 3);
  const mainEnd = Math.floor(count * POOL_MAIN);
  const haloEnd = Math.floor(count * POOL_HALO);

  for (let i = 0; i < mainEnd; i += 1) {
    if (state === 'found' && i % 3 !== 0) {
      // 来源流：从三个来源角流向 Orb
      const source = [[-7, 6, -8], [7, 5, -12], [-5, -7, -6]][i % 3];
      const t = Math.pow(seeded(i, 105), 0.8);
      const [x, y, z] = bezier(source, [(source[0] + center.x) / 2, (source[1] + center.y) / 2 + 2, -4], [center.x, center.y, center.z], t);
      write(result, i, x + gaussian(i, 106) * 0.3, y + gaussian(i, 107) * 0.3, z);
      continue;
    }
    const closure = state === 'uncertain' ? 0.74 : 1;
    const theta = seeded(i, 108) * TAU * closure;
    const phi = Math.acos(1 - 2 * seeded(i, 109));
    const radius = state === 'reading' ? 2 + seeded(i, 110) * 1.6 : 2.6 + seeded(i, 111) * 0.7;
    const direction = state === 'conflict' && i % 2 ? -1 : 1;
    write(
      result, i,
      center.x + direction * (state === 'conflict' ? 1.2 : 0) + Math.sin(phi) * Math.cos(theta) * radius,
      center.y + Math.cos(phi) * radius,
      center.z + Math.sin(phi) * Math.sin(theta) * radius * 0.6,
    );
  }
  for (let i = mainEnd; i < haloEnd; i += 1) {
    write(result, i, (seeded(i, 112) - 0.5) * 18, (seeded(i, 113) - 0.5) * 22, -16 - seeded(i, 114) * 18);
  }
  for (let i = haloEnd; i < count; i += 1) {
    write(result, i, center.x + gaussian(i, 115) * 0.5, center.y + gaussian(i, 116) * 0.5, center.z + 0.4);
  }
  return result;
}

function capsuleDust(count) {
  const result = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const behind = seeded(i, 117) < 0.85;
    write(
      result, i,
      (seeded(i, 118) - 0.5) * 22,
      (seeded(i, 119) - 0.5) * 30,
      behind ? -14 - seeded(i, 120) * 30 : -2 - seeded(i, 121) * 4,
    );
  }
  return result;
}

function quiet(count) {
  const result = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const theta = seeded(i, 18) * TAU;
    const radius = 22 + seeded(i, 19) * 40;
    write(result, i, Math.cos(theta) * radius, Math.sin(theta) * radius, -40 - seeded(i, 20) * 30);
  }
  return result;
}

export function createSemanticTarget(mode, count, payload = {}) {
  if (mode === 'deep-scatter') return deepScatter(count);
  if (mode === 'globe' || mode === 'world' || mode === 'world-intro') return globe(count);
  if (mode === 'city-burst') return cityBurst(count);
  if (mode === 'city' || mode === 'city-field' || mode === 'cityCluster') return cityCluster(count, payload);
  if (mode === 'capsule' || mode === 'capsuleDust') return capsuleDust(count);
  if (mode === 'fragment-field' || mode === 'field' || mode === 'multiCityField') return multiCityField(count, payload);
  if (mode === 'discovery') return discovery(count, payload);
  if (mode === 'timeline') return timeline(count);
  if (mode === 'map' || mode === 'placeMap') return placeMap(count);
  if (mode === 'relations' || mode === 'connection') return connectionField(count, payload);
  if (mode === 'inbox' || mode === 'inboxDecision') return inboxDecision(count, payload);
  if (mode === 'import' || mode === 'importBatch') return importBatch(count, payload);
  if (mode === 'else') return elseOrb(count, payload);
  return quiet(count);
}
