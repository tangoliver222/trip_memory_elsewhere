import {
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createAnchorRegistry } from './anchor-registry.js';
import { createFlowController } from './flow-controller.js';
import { createParticleSystem } from './particle-system.js';
import { createSemanticTarget } from './particle-targets.js';
import { detectPerformanceProfile, getPerformanceProfile } from './performance-profile.js';
import { getSceneDefinition } from './scene-definitions.js';

const DEFAULT_CAMERA_Z = 44;
const createBrowserControls = (camera, element) => (
  typeof element?.getRootNode === 'function' ? new OrbitControls(camera, element) : null
);

export class MemorySceneManager {
  constructor({
    rendererFactory = (options) => new WebGLRenderer(options),
    controlsFactory = createBrowserControls,
    profile,
    flowController,
    environment = globalThis,
  } = {}) {
    this.rendererFactory = rendererFactory;
    this.controlsFactory = controlsFactory;
    this.environment = environment;
    const detected = detectPerformanceProfile(environment);
    this.profileName = typeof profile === 'string' ? profile : (profile?.name || detected.name);
    this.reducedMotion = profile?.reducedMotion ?? detected.reducedMotion;
    this.profile = typeof profile === 'object'
      ? { ...getPerformanceProfile(this.profileName, { reducedMotion: this.reducedMotion }), ...profile }
      : getPerformanceProfile(this.profileName, { reducedMotion: this.reducedMotion });
    this.flows = flowController || createFlowController();
    this.canvas = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.particles = null;
    this.controls = null;
    this.mode = 'quiet-tool';
    this.definition = getSceneDefinition('quiet-tool', { particleCount: this.profile.particleCount });
    this.anchorRegistry = createAnchorRegistry();
    this.targetMetadata = {};
    this.phases = [];
    this.rendererCount = 0;
    this.paused = true;
    this.lastFrame = 0;
    this.resizeObserver = null;
    this.intersectionObserver = null;
    this._boundFrame = (time) => this.renderFrame(time);
    this._boundVisibility = () => (this.environment.document?.hidden ? this.pause() : this.resume());
    this._boundContextLost = (event) => { event.preventDefault?.(); this.pause(); this.setStaticFallback(true); };
    this._boundContextRestored = () => { this.setStaticFallback(false); this.resume(); };
  }

  mount(canvas) {
    if (this.renderer) return this;
    if (!canvas) throw new TypeError('MemorySceneManager.mount requires a canvas.');
    this.canvas = canvas;
    this.renderer = this.rendererFactory({ canvas, alpha: true, antialias: this.profile.antialias, powerPreference: 'high-performance' });
    this.rendererCount += 1;
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(44, 1, 0.1, 240);
    this.camera.position.z = DEFAULT_CAMERA_Z;
    this.controls = this.controlsFactory?.(this.camera, canvas) || null;
    if (this.controls) {
      this.controls.enabled = false;
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.055;
      this.controls.enablePan = false;
      this.controls.enableZoom = true;
      this.controls.rotateSpeed = 0.38;
      this.controls.zoomSpeed = 0.52;
      this.controls.minDistance = 32;
      this.controls.maxDistance = 54;
    }
    this.particles = createParticleSystem(this.profile, { reducedMotion: this.reducedMotion });
    this.scene.add(this.particles.points);

    const dpr = Math.min(this.environment.devicePixelRatio || 1, this.profile.maxDpr);
    this.renderer.setPixelRatio?.(dpr);
    this.particles.uniforms.uPixelRatio.value = dpr;
    this.resize();
    this.installLifecycleListeners();
    this.resume();
    return this;
  }

  installLifecycleListeners() {
    this.environment.document?.addEventListener?.('visibilitychange', this._boundVisibility);
    this.canvas.addEventListener?.('webglcontextlost', this._boundContextLost);
    this.canvas.addEventListener?.('webglcontextrestored', this._boundContextRestored);
    if (this.environment.ResizeObserver) {
      this.resizeObserver = new this.environment.ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.canvas);
    }
    if (this.environment.IntersectionObserver) {
      this.intersectionObserver = new this.environment.IntersectionObserver(([entry]) => {
        if (entry?.isIntersecting) this.resume();
        else this.pause();
      });
      this.intersectionObserver.observe(this.canvas);
    }
  }

  resize() {
    if (!this.renderer || !this.camera || !this.canvas) return;
    const width = Math.max(1, this.canvas.clientWidth || this.environment.innerWidth || 1);
    const height = Math.max(1, this.canvas.clientHeight || this.environment.innerHeight || 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize?.(width, height, false);
  }

  resolveDefinitionMode(mode, payload = {}) {
    const viewTargets = new Set(['timeline', 'map', 'relations']);
    return viewTargets.has(payload.target) ? payload.target : mode;
  }

  measureAnchors(root) {
    if (!root || !this.camera) {
      this.anchorRegistry.clear();
      return new Map();
    }
    const rect = this.canvas?.getBoundingClientRect?.();
    return this.anchorRegistry.measure(root, this.camera, {
      left: rect?.left || 0,
      top: rect?.top || 0,
      width: rect?.width || this.canvas?.clientWidth || this.environment.innerWidth || 1,
      height: rect?.height || this.canvas?.clientHeight || this.environment.innerHeight || 1,
    });
  }

  configureScene(mode, payload = {}) {
    const resolvedMode = this.resolveDefinitionMode(mode, payload);
    this.definition = getSceneDefinition(resolvedMode, { ...payload, particleCount: this.particles.count });
    this.camera.fov = this.definition.camera.fov;
    this.camera.position.z = this.definition.camera.z;
    this.camera.updateProjectionMatrix();
    if (this.controls) this.controls.enabled = this.definition.interaction === 'orbit';
    this.particles.uniforms.uCoolColor.value.set(this.definition.palette.primary);
    this.particles.uniforms.uWarmColor.value.set(this.definition.palette.accent);
    return this.definition;
  }

  target(mode, payload, activeCount = this.definition.activeCount) {
    const target = createSemanticTarget(mode, this.particles.count, payload);
    this.targetMetadata = target.metadata || {};
    this.particles.setTarget(target, { activeCount });
    return target;
  }

  setStaticFallback(visible) {
    const fallback = this.canvas?.parentElement?.querySelector?.('[data-visual-fallback]');
    if (fallback) fallback.hidden = !visible;
    this.canvas?.parentElement?.classList?.toggle?.('is-static-visual', visible);
  }

  loseContext() {
    const extension = this.renderer?.getContext?.()?.getExtension?.('WEBGL_lose_context');
    if (extension?.loseContext) {
      extension.loseContext();
      return true;
    }
    this._boundContextLost({ preventDefault() {} });
    return false;
  }

  waitForTimeline(timeline) {
    if (!timeline?.eventCallback) return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      timeline.eventCallback('onComplete', finish);
      timeline.eventCallback('onInterrupt', finish);
    });
  }

  transitionTo(mode, payload = {}) {
    this.mode = mode;
    if (!this.particles) return Promise.resolve();
    const definition = this.configureScene(mode, payload);
    const anchors = this.measureAnchors(payload.root);
    const scenePayload = { ...payload, anchors };
    const options = { ...scenePayload, reducedMotion: this.reducedMotion };

    if (mode === 'world-intro') {
      this.phases.push('deep-scatter', 'globe');
      this.target('deep-scatter', scenePayload, this.particles.count);
      const timeline = this.flows.worldIntro(this.particles, {
        ...options,
        onGlobe: () => this.target(definition.generator, scenePayload, definition.activeCount),
        onCities: payload.onCities,
        onComplete: payload.onComplete,
      });
      return this.waitForTimeline(timeline);
    }

    if (mode === 'city' && payload.transition === 'globeToCity') {
      this.phases.push('city-burst', 'city-field');
      this.target('city-burst', scenePayload, definition.activeCount);
      const timeline = this.flows.globeToCity(this.particles, {
        ...options,
        onField: () => this.target(definition.generator, scenePayload, definition.activeCount),
      });
      return this.waitForTimeline(timeline);
    }

    if (mode === 'discovery') {
      this.phases.push('time-nodes', 'relation-flow', 'shared-entity');
      this.target(definition.generator, scenePayload, definition.activeCount);
      return this.waitForTimeline(this.flows.discoveryReveal(this.particles, options));
    }

    if (mode === 'lens') {
      this.phases.push('lens-extract');
      this.target(definition.generator, scenePayload, definition.activeCount);
      return this.waitForTimeline(this.flows.lensExtract(this.particles, options));
    }

    if (mode === 'else') {
      this.phases.push(`else-${payload.state || 'idle'}`);
      this.target(definition.generator, scenePayload, definition.activeCount);
      return this.waitForTimeline(this.flows.elseState(this.particles, options));
    }

    this.phases.push(mode);
    this.target(definition.generator, scenePayload, definition.activeCount);
    return this.waitForTimeline(this.flows.morph(this.particles, {
      ...options,
      duration: this.reducedMotion ? definition.reducedMotion.duration : definition.duration,
      noiseStrength: definition.activeCount ? 0.42 : 0,
      opacity: definition.activeCount ? 0.9 : 0,
    }));
  }

  setMode(mode, payload = {}) {
    this.transitionTo(mode, payload);
    return this;
  }

  renderFrame(time = 0) {
    if (this.paused || !this.renderer) return;
    const frameInterval = 1000 / this.profile.fps;
    if (time - this.lastFrame < frameInterval) return;
    this.lastFrame = time;
    this.particles.uniforms.uTime.value = time * 0.001;
    if (this.controls?.enabled) this.controls.update?.();
    this.renderer.render?.(this.scene, this.camera);
  }

  pause() {
    if (!this.renderer || this.paused) return;
    this.paused = true;
    this.renderer.setAnimationLoop?.(null);
  }

  resume() {
    if (!this.renderer || !this.paused) return;
    this.paused = false;
    this.lastFrame = 0;
    this.renderer.setAnimationLoop?.(this._boundFrame);
  }

  debug() {
    const flowDebug = this.flows.debug?.() || { tracked: 0, active: 0 };
    return {
      rendererCount: this.rendererCount,
      particlePoolId: this.particles?.poolId || null,
      particleCount: this.particles?.count || 0,
      activeCount: this.particles?.activeCount || 0,
      mode: this.mode,
      definition: this.definition,
      anchorCount: this.anchorRegistry.debug().count,
      targetMetadata: this.targetMetadata,
      phases: [...this.phases],
      profile: { name: this.profileName, reducedMotion: this.reducedMotion, ...this.profile },
      paused: this.paused,
      trackedTimelines: flowDebug.tracked,
      activeTimelines: flowDebug.active,
    };
  }

  dispose() {
    this.pause();
    this.flows.killAll();
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    this.environment.document?.removeEventListener?.('visibilitychange', this._boundVisibility);
    this.canvas?.removeEventListener?.('webglcontextlost', this._boundContextLost);
    this.canvas?.removeEventListener?.('webglcontextrestored', this._boundContextRestored);
    this.particles?.dispose();
    this.controls?.dispose?.();
    this.renderer?.dispose?.();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.particles = null;
    this.anchorRegistry.clear();
    this.targetMetadata = {};
    this.controls = null;
    this.canvas = null;
  }
}
