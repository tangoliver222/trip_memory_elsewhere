import {
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createFlowController } from './flow-controller.js';
import { createParticleSystem } from './particle-system.js';
import { createSemanticTarget } from './particle-targets.js';
import { detectPerformanceProfile, getPerformanceProfile } from './performance-profile.js';

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
    this.phases = [];
    this.rendererCount = 0;
    this.paused = true;
    this.lastFrame = 0;
    this.resizeObserver = null;
    this.intersectionObserver = null;
    this._boundFrame = (time) => this.renderFrame(time);
    this._boundVisibility = () => (this.environment.document?.hidden ? this.pause() : this.resume());
    this._boundContextLost = (event) => { event.preventDefault?.(); this.pause(); };
    this._boundContextRestored = () => this.resume();
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

  target(mode, payload) {
    const array = createSemanticTarget(mode, this.particles.count, payload);
    this.particles.setTarget(array);
  }

  setMode(mode, payload = {}) {
    this.mode = mode;
    if (!this.particles) return this;
    if (this.controls) this.controls.enabled = mode === 'world' || mode === 'world-intro';
    const options = { ...payload, reducedMotion: this.reducedMotion };

    if (mode === 'world-intro') {
      this.phases.push('deep-scatter', 'globe');
      this.target('deep-scatter', payload);
      this.flows.worldIntro(this.particles, {
        ...options,
        onGlobe: () => this.target('globe', payload),
        onCities: payload.onCities,
        onComplete: payload.onComplete,
      });
      return this;
    }

    if (mode === 'city' && payload.transition === 'globeToCity') {
      this.phases.push('city-burst', 'city-field');
      this.target('city-burst', payload);
      this.flows.globeToCity(this.particles, { ...options, onField: () => this.target('city-field', payload) });
      return this;
    }

    if (mode === 'discovery') {
      this.phases.push('time-nodes', 'relation-flow', 'shared-entity');
      this.target('discovery', payload);
      this.flows.discoveryReveal(this.particles, options);
      return this;
    }

    if (mode === 'lens') {
      this.phases.push('lens-extract');
      this.flows.lensExtract(this.particles, options);
      return this;
    }

    if (mode === 'else') {
      this.phases.push(`else-${payload.state || 'idle'}`);
      this.target('else', payload);
      this.flows.elseState(this.particles, options);
      return this;
    }

    this.phases.push(mode);
    this.target(payload.target || mode, payload);
    this.flows.morph(this.particles, { ...options, duration: mode === 'quiet-tool' ? 0.8 : 1.3 });
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
    return {
      rendererCount: this.rendererCount,
      particlePoolId: this.particles?.poolId || null,
      particleCount: this.particles?.count || 0,
      mode: this.mode,
      phases: [...this.phases],
      profile: { ...this.profile },
      paused: this.paused,
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
    this.controls = null;
    this.canvas = null;
  }
}
