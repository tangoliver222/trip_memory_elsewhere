import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  ShaderMaterial,
} from 'three';
import { createSemanticTarget } from './particle-targets.js';
import { fragmentShader, vertexShader } from './shaders.js';

let particlePoolSequence = 0;

export function createParticleSystem(profile, { reducedMotion = false } = {}) {
  const count = profile.particleCount;
  const geometry = new BufferGeometry();
  const initial = createSemanticTarget('deep-scatter', count);
  const positions = initial.positions;
  const targets = new Float32Array(positions);
  const visibility = new Float32Array(initial.visibility);
  const targetVisibility = new Float32Array(initial.visibility);
  const groups = new Float32Array(initial.groups);
  const aRandom = new Float32Array(count);
  const aScale = new Float32Array(count);
  const aPhase = new Float32Array(count);
  const aAmplitude = new Float32Array(count);
  const aColorMix = new Float32Array(count);
  const aTargetIndex = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const random = (Math.sin((i + 1) * 91.913) * 43758.5453) % 1;
    const normalized = Math.abs(random);
    aRandom[i] = normalized;
    aScale[i] = 0.24 + normalized * 0.72;
    aPhase[i] = normalized * Math.PI * 2;
    aAmplitude[i] = 0.18 + normalized * 0.8;
    aColorMix[i] = i % 71 === 0 ? 0.72 : 0.018 + normalized * 0.075;
    aTargetIndex[i] = i;
  }

  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aTarget', new BufferAttribute(targets, 3));
  geometry.setAttribute('aVisibility', new BufferAttribute(visibility, 1));
  geometry.setAttribute('aTargetVisibility', new BufferAttribute(targetVisibility, 1));
  geometry.setAttribute('aGroup', new BufferAttribute(groups, 1));
  geometry.setAttribute('aRandom', new BufferAttribute(aRandom, 1));
  geometry.setAttribute('aScale', new BufferAttribute(aScale, 1));
  geometry.setAttribute('aPhase', new BufferAttribute(aPhase, 1));
  geometry.setAttribute('aAmplitude', new BufferAttribute(aAmplitude, 1));
  geometry.setAttribute('aColorMix', new BufferAttribute(aColorMix, 1));
  geometry.setAttribute('aTargetIndex', new BufferAttribute(aTargetIndex, 1));

  const uniforms = {
    uTime: { value: 0 },
    uProgress: { value: 0 },
    uPositionRandom: { value: 0.16 },
    uDepth: { value: 1 },
    uNoiseStrength: { value: 0.7 },
    uPointSize: { value: 1.35 },
    uPixelRatio: { value: 1 },
    uReducedMotion: { value: reducedMotion ? 1 : 0 },
    uPulse: { value: 0 },
    uOpacity: { value: 0.84 },
    uCoolColor: { value: new Color('#e3e5e3') },
    uWarmColor: { value: new Color('#b9ad99') },
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
  let activeCount = count;

  const setTarget = (target, { resetProgress = true, activeCount: requestedActiveCount = count } = {}) => {
    const resolved = typeof target === 'string' ? createSemanticTarget(target, count) : target;
    const targetArray = resolved instanceof Float32Array ? resolved : resolved?.positions;
    if (!(targetArray instanceof Float32Array) || targetArray.length !== targets.length) {
      throw new TypeError(`Particle target must contain ${targets.length} float values.`);
    }
    const nextVisibility = resolved?.visibility instanceof Float32Array ? resolved.visibility : new Float32Array(count).fill(1);
    const nextGroups = resolved?.groups instanceof Float32Array ? resolved.groups : new Float32Array(count);
    activeCount = Math.max(0, Math.min(count, requestedActiveCount));

    const positionAttribute = geometry.getAttribute('position');
    const targetAttribute = geometry.getAttribute('aTarget');
    const visibilityAttribute = geometry.getAttribute('aVisibility');
    const targetVisibilityAttribute = geometry.getAttribute('aTargetVisibility');
    const groupAttribute = geometry.getAttribute('aGroup');
    const progress = uniforms.uProgress.value;
    for (let index = 0; index < targets.length; index += 1) {
      positions[index] += (targets[index] - positions[index]) * progress;
      targets[index] = targetArray[index];
    }
    for (let index = 0; index < count; index += 1) {
      visibility[index] += (targetVisibility[index] - visibility[index]) * progress;
      targetVisibility[index] = index < activeCount ? nextVisibility[index] : 0;
      groups[index] = nextGroups[index];
    }
    positionAttribute.needsUpdate = true;
    targetAttribute.needsUpdate = true;
    visibilityAttribute.needsUpdate = true;
    targetVisibilityAttribute.needsUpdate = true;
    groupAttribute.needsUpdate = true;
    if (resetProgress) uniforms.uProgress.value = 0;
  };

  return {
    count,
    poolId,
    points,
    uniforms,
    setTarget,
    get activeCount() { return activeCount; },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
