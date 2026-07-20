import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  ShaderMaterial,
} from 'three';
import { POOL_HALO, POOL_MAIN, createSemanticTarget } from './particle-targets.js';
import { fragmentShader, vertexShader } from './shaders.js';

let particlePoolSequence = 0;

/**
 * 单一粒子池。池按索引分层（与 particle-targets 对齐）：
 *   主结构  —— 常规银灰
 *   环境层  —— 更小更暗（景深尘埃）
 *   强调层  —— 更大更亮，允许极少量暖灰（用户确认 / 锚点语义）
 */
export function createParticleSystem(profile, { reducedMotion = false } = {}) {
  const count = profile.particleCount;
  const geometry = new BufferGeometry();
  const positions = createSemanticTarget('deep-scatter', count);
  const targets = new Float32Array(positions);
  const aRandom = new Float32Array(count);
  const aScale = new Float32Array(count);
  const aPhase = new Float32Array(count);
  const aAmplitude = new Float32Array(count);
  const aColorMix = new Float32Array(count);
  const aLayer = new Float32Array(count);
  const aVisibility = new Float32Array(count).fill(1);
  const aTargetVisibility = new Float32Array(count).fill(1);

  const mainEnd = Math.floor(count * POOL_MAIN);
  const haloEnd = Math.floor(count * POOL_HALO);

  for (let i = 0; i < count; i += 1) {
    const random = Math.abs((Math.sin((i + 1) * 91.913) * 43758.5453) % 1);
    aRandom[i] = random;
    aPhase[i] = random * Math.PI * 2;
    if (i >= haloEnd) {
      // 强调层：锚点与确认语义
      aScale[i] = 1.05 + random * 0.9;
      aAmplitude[i] = 0.08 + random * 0.2;
      aColorMix[i] = 0.34 + random * 0.3;
      aLayer[i] = 2;
    } else if (i >= mainEnd) {
      // 环境层：极弱远尘
      aScale[i] = 0.16 + random * 0.3;
      aAmplitude[i] = 0.3 + random * 0.9;
      aColorMix[i] = 0.01 + random * 0.04;
      aLayer[i] = 1;
    } else {
      aScale[i] = 0.3 + random * 0.62;
      aAmplitude[i] = 0.16 + random * 0.6;
      aColorMix[i] = i % 97 === 0 ? 0.5 : 0.015 + random * 0.06;
      aLayer[i] = 0;
    }
  }

  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aTarget', new BufferAttribute(targets, 3));
  geometry.setAttribute('aRandom', new BufferAttribute(aRandom, 1));
  geometry.setAttribute('aScale', new BufferAttribute(aScale, 1));
  geometry.setAttribute('aPhase', new BufferAttribute(aPhase, 1));
  geometry.setAttribute('aAmplitude', new BufferAttribute(aAmplitude, 1));
  geometry.setAttribute('aColorMix', new BufferAttribute(aColorMix, 1));
  geometry.setAttribute('aLayer', new BufferAttribute(aLayer, 1));
  geometry.setAttribute('aVisibility', new BufferAttribute(aVisibility, 1));
  geometry.setAttribute('aTargetVisibility', new BufferAttribute(aTargetVisibility, 1));

  const uniforms = {
    uTime: { value: 0 },
    uProgress: { value: 0 },
    uPositionRandom: { value: 0.16 },
    uDepth: { value: 1 },
    uNoiseStrength: { value: 0.55 },
    uPointSize: { value: 1.35 },
    uPixelRatio: { value: 1 },
    uReducedMotion: { value: reducedMotion ? 1 : 0 },
    uPulse: { value: 0 },
    uOpacity: { value: 0.85 },
    uFocus: { value: 0 },
    uPointer: { value: { x: 0, y: 0 } },
    uCoolColor: { value: new Color('#ccd3d0') },
    uWarmColor: { value: new Color('#b8ad9b') },
  };

  const material = new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  const poolId = `memory-pool-${particlePoolSequence += 1}`;
  let sceneMeta = Object.freeze({ activeCount: count, dataSignature: 'deep-scatter', anchorCount: 0, state: 'populated' });

  const setScene = (scene, { resetProgress = true, snap = false } = {}) => {
    const targetArray = scene?.positions;
    const targetVisibility = scene?.visibility;
    if (!(targetArray instanceof Float32Array) || targetArray.length !== targets.length) {
      throw new TypeError(`Particle target must contain ${targets.length} float values.`);
    }
    if (!(targetVisibility instanceof Float32Array) || targetVisibility.length !== count) {
      throw new TypeError(`Particle visibility must contain ${count} float values.`);
    }

    const positionAttribute = geometry.getAttribute('position');
    const targetAttribute = geometry.getAttribute('aTarget');
    const visibilityAttribute = geometry.getAttribute('aVisibility');
    const targetVisibilityAttribute = geometry.getAttribute('aTargetVisibility');
    const progress = uniforms.uProgress.value;
    for (let index = 0; index < targets.length; index += 1) {
      positions[index] = snap ? targetArray[index] : positions[index] + (targets[index] - positions[index]) * progress;
      targets[index] = targetArray[index];
    }
    for (let index = 0; index < count; index += 1) {
      aVisibility[index] = snap
        ? targetVisibility[index]
        : aVisibility[index] + (aTargetVisibility[index] - aVisibility[index]) * progress;
      aTargetVisibility[index] = targetVisibility[index];
    }
    positionAttribute.needsUpdate = true;
    targetAttribute.needsUpdate = true;
    visibilityAttribute.needsUpdate = true;
    targetVisibilityAttribute.needsUpdate = true;
    if (snap) uniforms.uProgress.value = 1;
    else if (resetProgress) uniforms.uProgress.value = 0;
    sceneMeta = Object.freeze({
      activeCount: scene.activeCount,
      dataSignature: scene.dataSignature,
      anchorCount: scene.anchorCount,
      state: scene.state,
    });
  };

  const setTarget = (target, options) => {
    const positionsArray = typeof target === 'string' ? createSemanticTarget(target, count) : target;
    setScene({
      positions: positionsArray,
      visibility: new Float32Array(count).fill(1),
      activeCount: count,
      dataSignature: typeof target === 'string' ? target : 'legacy-target',
      anchorCount: 0,
      state: 'populated',
    }, options);
  };

  return {
    count,
    poolId,
    points,
    uniforms,
    setScene,
    setTarget,
    getSceneMeta: () => sceneMeta,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
