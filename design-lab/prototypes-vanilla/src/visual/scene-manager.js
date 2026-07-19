import {
  Group,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createFlowController } from './flow-controller.js';
import { createParticleSystem } from './particle-system.js';
import { GLOBE_RADIUS, createSemanticTarget, dirFromLatLng, loadLandMask, onLandMaskReady } from './particle-targets.js';
import { detectPerformanceProfile, getPerformanceProfile } from './performance-profile.js';

const DEFAULT_CAMERA_Z = 44;
const WORLD_GROUP_OFFSET = Object.freeze({ x: 0, y: 3.3, z: 0 });
const WORLD_MODES = new Set(['world', 'world-intro', 'globe']);

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
    this.group = null;
    this.particles = null;
    this.controls = null;
    this.mode = 'quiet-tool';
    this.lastPayload = {};
    this.phases = [];
    this.rendererCount = 0;
    this.paused = true;
    this.lastFrame = 0;
    this.resizeObserver = null;
    this.intersectionObserver = null;
    this.userInteracting = false;
    this.trackedPins = [];
    this.trackedAnchorLayout = null;
    this.trackedWorldElement = null;
    this.stableCallbacks = [];
    this._pinVecA = null;
    this._pinVecB = null;
    this._boundFrame = (time) => this.renderFrame(time);
    this._boundVisibility = () => (this.environment.document?.hidden ? this.pause() : this.resume());
    this._boundContextLost = (event) => { event.preventDefault?.(); this.pause(); this.setStaticFallback(true); };
    this._boundContextRestored = () => { this.setStaticFallback(false); this.resume(); };
    this._boundPointer = (event) => {
      if (!this.particles || !this.canvas?.getBoundingClientRect) return;
      const rect = this.canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const pointer = this.particles.uniforms.uPointer.value;
      pointer.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      pointer.y = -((event.clientY - rect.top) / rect.height - 0.5) * 2;
    };
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
    this.configureControls();
    this.particles = createParticleSystem(this.profile, { reducedMotion: this.reducedMotion });
    this.group = new Group();
    this.group.add(this.particles.points);
    this.scene.add(this.group);
    this._pinVecA = new Vector3();
    this._pinVecB = new Vector3();

    const dpr = Math.min(this.environment.devicePixelRatio || 1, this.profile.maxDpr);
    this.renderer.setPixelRatio?.(dpr);
    this.particles.uniforms.uPixelRatio.value = dpr;
    this.resize();
    this.installLifecycleListeners();
    // 大陆掩膜就绪后，若仍在世界视图则重新凝聚成大陆
    loadLandMask();
    onLandMaskReady(() => {
      if (WORLD_MODES.has(this.mode)) this.target('globe', this.lastPayload);
    });
    this.resume();
    return this;
  }

  configureControls() {
    if (!this.controls) return;
    this.controls.enabled = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.055;
    this.controls.enablePan = false;
    this.controls.enableZoom = true;
    this.controls.rotateSpeed = 0.42;
    this.controls.zoomSpeed = 0.5;
    this.controls.minDistance = 30;
    this.controls.maxDistance = 54;
    this.controls.addEventListener?.('start', () => { this.userInteracting = true; });
    this.controls.addEventListener?.('end', () => { this.userInteracting = false; });
  }

  /** 把 OrbitControls 重新绑定到页面内的交互区域（例如地球 stage）。 */
  bindControls(element) {
    if (!element || !this.camera) return;
    const wasEnabled = this.controls?.enabled ?? false;
    this.controls?.dispose?.();
    this.controls = this.controlsFactory?.(this.camera, element) || null;
    this.configureControls();
    if (this.controls) {
      this.controls.enabled = wasEnabled || WORLD_MODES.has(this.mode);
      this.controls.target?.set?.(WORLD_GROUP_OFFSET.x, WORLD_GROUP_OFFSET.y, WORLD_GROUP_OFFSET.z);
      // 允许纵向手势滚动页面，仅横向拖拽旋转地球
      if (element.style) element.style.touchAction = 'pan-y';
    }
  }

  installLifecycleListeners() {
    this.environment.document?.addEventListener?.('visibilitychange', this._boundVisibility);
    this.canvas.addEventListener?.('webglcontextlost', this._boundContextLost);
    this.canvas.addEventListener?.('webglcontextrestored', this._boundContextRestored);
    this.environment.document?.addEventListener?.('pointermove', this._boundPointer, { passive: true });
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

  /** 视口像素坐标 → z 平面上的世界坐标（用于 DOM 锚点驱动粒子目标）。 */
  worldFromViewport(px, py, z = 0) {
    const width = Math.max(1, this.canvas?.clientWidth || 1);
    const height = Math.max(1, this.canvas?.clientHeight || 1);
    const distance = DEFAULT_CAMERA_Z - z;
    const visibleHeight = 2 * distance * Math.tan((this.camera?.fov ?? 44) * Math.PI / 360);
    const visibleWidth = visibleHeight * (width / height);
    return {
      x: ((px / width) - 0.5) * visibleWidth,
      y: (0.5 - (py / height)) * visibleHeight,
      z,
    };
  }

  /** DOM 元素中心 → 世界坐标锚点数组。 */
  anchorsFromElements(elements, { z = -2, weights = [] } = {}) {
    if (!this.canvas?.getBoundingClientRect) return [];
    const canvasRect = this.canvas.getBoundingClientRect();
    return [...elements].map((element, index) => {
      const rect = element.getBoundingClientRect();
      const anchor = this.worldFromViewport(
        rect.left + rect.width / 2 - canvasRect.left,
        rect.top + rect.height / 2 - canvasRect.top,
        z,
      );
      if (weights[index] != null) anchor.weight = weights[index];
      return anchor;
    });
  }

  /** 把点云地球对齐到页面内的 stage 元素（位置 + 缩放），DOM 与粒子共享坐标系。 */
  alignWorldToElement(element, { fill = 0.98 } = {}) {
    if (!element?.getBoundingClientRect || !this.canvas?.getBoundingClientRect || !this.group) return;
    const canvasRect = this.canvas.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    if (!rect.width || !canvasRect.width) return;
    const center = this.worldFromViewport(
      rect.left + rect.width / 2 - canvasRect.left,
      rect.top + rect.height / 2 - canvasRect.top,
      0,
    );
    const height = Math.max(1, this.canvas.clientHeight || 1);
    const visibleHeight = 2 * DEFAULT_CAMERA_Z * Math.tan((this.camera?.fov ?? 44) * Math.PI / 360);
    const pxPerUnit = height / visibleHeight;
    const radiusPx = Math.min(rect.width * 0.5 * fill, rect.height * 0.62);
    const scale = (radiusPx / pxPerUnit) / GLOBE_RADIUS;
    this.group.position.set(center.x, center.y, 0);
    this.group.scale.setScalar(scale);
    this.controls?.target?.set?.(center.x, center.y, 0);
  }

  /**
   * 固定 Canvas 内的粒子必须跟随滚动 DOM。滚动只产生统一位移，直接移动 Three group；
   * 不重新播放 morph，因此不会在用户手势之后缓慢追赶。
   */
  trackElementAnchors(elements, { mode = null, payload = {}, z = -2, weights = [] } = {}) {
    const tracked = [...(elements || [])].filter((element) => element?.getBoundingClientRect);
    this.trackedWorldElement = null;
    if (!tracked.length || !this.group || !this.canvas?.getBoundingClientRect) {
      this.trackedAnchorLayout = null;
      return () => {};
    }
    const token = {};
    const rects = tracked.map((element) => element.getBoundingClientRect());
    const canvasRect = this.canvas.getBoundingClientRect();
    const first = rects[0];
    const basePoint = this.worldFromViewport(
      first.left + first.width / 2 - canvasRect.left,
      first.top + first.height / 2 - canvasRect.top,
      z,
    );
    this.trackedAnchorLayout = {
      token,
      elements: tracked,
      mode,
      payload,
      z,
      weights,
      baseRects: rects,
      basePoint,
      basePosition: this.group.position.clone(),
    };
    return () => {
      if (this.trackedAnchorLayout?.token === token) this.trackedAnchorLayout = null;
    };
  }

  /** 地球 stage 的位置和受限缩放在每次 DOM box 变化后立即重算。 */
  trackWorldElement(element, options = {}) {
    this.trackedAnchorLayout = null;
    if (!element?.getBoundingClientRect) {
      this.trackedWorldElement = null;
      return () => {};
    }
    const token = {};
    this.trackedWorldElement = { token, element, options, signature: '' };
    this.updateTrackedLayout();
    return () => {
      if (this.trackedWorldElement?.token === token) this.trackedWorldElement = null;
    };
  }

  updateTrackedLayout() {
    if (this.trackedWorldElement) {
      const { element, options } = this.trackedWorldElement;
      const rect = element.getBoundingClientRect();
      const signature = [rect.left, rect.top, rect.width, rect.height].map((value) => Math.round(value * 2) / 2).join(':');
      if (signature !== this.trackedWorldElement.signature) {
        this.trackedWorldElement.signature = signature;
        this.alignWorldToElement(element, options);
      }
      return;
    }

    const tracked = this.trackedAnchorLayout;
    if (!tracked || !this.group || !this.canvas?.getBoundingClientRect) return;
    const rects = tracked.elements.map((element) => element.getBoundingClientRect());
    const first = rects[0];
    const canvasRect = this.canvas.getBoundingClientRect();
    const point = this.worldFromViewport(
      first.left + first.width / 2 - canvasRect.left,
      first.top + first.height / 2 - canvasRect.top,
      tracked.z,
    );
    const baseFirst = tracked.baseRects[0];
    const uniformShift = rects.every((rect, index) => {
      const base = tracked.baseRects[index];
      return Math.abs((rect.left - base.left) - (first.left - baseFirst.left)) < 0.75
        && Math.abs((rect.top - base.top) - (first.top - baseFirst.top)) < 0.75
        && Math.abs(rect.width - base.width) < 0.75
        && Math.abs(rect.height - base.height) < 0.75;
    });

    if (uniformShift) {
      this.group.position.set(
        tracked.basePosition.x + point.x - tracked.basePoint.x,
        tracked.basePosition.y + point.y - tracked.basePoint.y,
        tracked.basePosition.z,
      );
      return;
    }

    if (tracked.mode) {
      const anchors = this.anchorsFromElements(tracked.elements, { z: tracked.z, weights: tracked.weights });
      this.target(tracked.mode, { ...tracked.payload, anchors });
    }
    tracked.baseRects = rects;
    tracked.basePoint = point;
    tracked.basePosition = this.group.position.clone();
  }

  /** 城市 pin：每帧把 lat/lng 投影到屏幕，驱动 DOM 标签跟随点云地球。 */
  trackCityPins(pins, container = null) {
    this.pinContainer = container;
    this.trackedPins = (pins || []).map((pin) => ({
      ...pin,
      dir: dirFromLatLng(pin.lat, pin.lng),
    }));
  }

  updateTrackedPins() {
    if (!this.trackedPins.length || !this.camera || !this.canvas || !this._pinVecA) return;
    const width = this.canvas.clientWidth || 1;
    const height = this.canvas.clientHeight || 1;
    // pin 元素相对自己的容器定位，投影坐标相对 canvas —— 每帧换算一次偏移
    let offsetX = 0;
    let offsetY = 0;
    if (this.pinContainer?.getBoundingClientRect && this.canvas.getBoundingClientRect) {
      const canvasRect = this.canvas.getBoundingClientRect();
      const containerRect = this.pinContainer.getBoundingClientRect();
      offsetX = containerRect.left - canvasRect.left;
      offsetY = containerRect.top - canvasRect.top;
    }
    this.trackedPins.forEach((pin) => {
      if (!pin.el?.style) return;
      this._pinVecA.set(pin.dir[0] * GLOBE_RADIUS, pin.dir[1] * GLOBE_RADIUS, pin.dir[2] * GLOBE_RADIUS);
      this.group.localToWorld(this._pinVecA);
      // 背面剔除：锚点法线与视线方向夹角
      this._pinVecB.copy(this._pinVecA).sub(this.group.position).normalize();
      const toCamera = this.camera.position.clone().sub(this.group.position).normalize();
      const facing = this._pinVecB.dot(toCamera);
      this._pinVecA.project(this.camera);
      const x = (this._pinVecA.x * 0.5 + 0.5) * width - offsetX;
      const y = (-this._pinVecA.y * 0.5 + 0.5) * height - offsetY;
      pin.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      pin.el.style.opacity = facing > 0.18 ? '1' : '0';
      pin.el.style.pointerEvents = facing > 0.18 ? 'auto' : 'none';
    });
  }

  target(mode, payload) {
    const array = createSemanticTarget(mode, this.particles.count, payload);
    this.particles.setTarget(array);
  }

  /** 页面渲染后用 DOM 锚点重新对齐粒子目标（保持当前 flow 语义，仅补一段短重组）。 */
  retarget(mode, payload = {}) {
    if (!this.particles) return this;
    this.target(mode, payload);
    this.flows.morph(this.particles, { duration: 0.9, reducedMotion: this.reducedMotion, focus: payload.focus ?? 0 });
    return this;
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

  applyGroupOffset(mode) {
    if (!this.group) return;
    const offset = WORLD_MODES.has(mode) ? WORLD_GROUP_OFFSET : { x: 0, y: 0, z: 0 };
    this.group.position.set(offset.x, offset.y, offset.z);
    if (!WORLD_MODES.has(mode)) {
      this.group.rotation.set(0, 0, 0);
      this.group.scale.setScalar(1);
    }
    this.controls?.target?.set?.(offset.x, offset.y, offset.z);
  }

  /** 统一转场入口（transitionTo 的语义别名保持向后兼容 setMode）。 */
  transitionTo(spec = {}) {
    return this.setMode(spec.mode, spec);
  }

  setMode(mode, payload = {}) {
    this.mode = mode;
    this.lastPayload = payload;
    if (!this.particles) return this;
    if (this.controls) this.controls.enabled = WORLD_MODES.has(mode);
    this.applyGroupOffset(mode);
    const options = { ...payload, reducedMotion: this.reducedMotion };
    const settle = () => { payload.onSettle?.(); this.notifyStable(); };

    if (mode === 'world-intro') {
      this.phases.push('deep-scatter', 'globe');
      this.target('deep-scatter', payload);
      this.flows.worldIntro(this.particles, {
        ...options,
        onGlobe: () => this.target('globe', payload),
        onCities: payload.onCities,
        onComplete: () => { payload.onComplete?.(); settle(); },
      });
      return this;
    }

    if (mode === 'city' && payload.transition === 'globeToCity') {
      this.phases.push('city-burst', 'city-field');
      this.target('city-burst', payload);
      this.flows.globeToCity(this.particles, { ...options, onField: () => this.target('city-field', payload), onComplete: settle });
      return this;
    }

    if (mode === 'discovery') {
      this.phases.push('time-nodes', 'relation-flow', 'shared-entity');
      this.target('discovery', payload);
      this.flows.discoveryReveal(this.particles, { ...options, onComplete: settle });
      return this;
    }

    if (mode === 'lens') {
      this.phases.push('lens-extract');
      this.flows.lensExtract(this.particles, { ...options, onComplete: settle });
      return this;
    }

    if (mode === 'else') {
      this.phases.push(`else-${payload.state || 'idle'}`);
      this.target('else', payload);
      this.flows.elseState(this.particles, { ...options, onComplete: settle });
      return this;
    }

    if (mode === 'inbox-decision') {
      this.phases.push(`inbox-${payload.result || 'open'}`);
      this.target('inboxDecision', payload);
      this.flows.inboxDecision(this.particles, { ...options, onComplete: settle });
      return this;
    }

    if (mode === 'fragment-field' && payload.searchFlow) {
      this.phases.push('field-search');
      this.target('multiCityField', payload);
      this.flows.fieldSearch(this.particles, { ...options, onComplete: settle });
      return this;
    }

    this.phases.push(mode);
    this.target(payload.target || mode, payload);
    this.flows.morph(this.particles, {
      ...options,
      duration: mode === 'quiet-tool' ? 0.8 : (payload.duration ?? (payload.fast ? 0.85 : 1.3)),
      onComplete: settle,
    });
    return this;
  }

  onStable(callback) {
    this.stableCallbacks.push(callback);
  }

  notifyStable() {
    this.stableCallbacks.splice(0).forEach((callback) => {
      try { callback(); } catch { /* noop */ }
    });
  }

  renderFrame(time = 0) {
    if (this.paused || !this.renderer) return;
    const frameInterval = 1000 / this.profile.fps;
    if (time - this.lastFrame < frameInterval) return;
    this.lastFrame = time;
    this.particles.uniforms.uTime.value = time * 0.001;
    this.updateTrackedLayout();
    // 世界视图极慢自转（用户交互或 reduced motion 时停止）
    if (WORLD_MODES.has(this.mode) && !this.userInteracting && !this.reducedMotion && this.group) {
      this.group.rotation.y += 0.00052;
    }
    if (this.controls?.enabled) this.controls.update?.();
    this.updateTrackedPins();
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
      mode: this.mode,
      phases: [...this.phases],
      profile: { name: this.profileName, reducedMotion: this.reducedMotion, ...this.profile },
      paused: this.paused,
      trackedTimelines: flowDebug.tracked,
      activeTimelines: flowDebug.active,
      trackedAnchorCount: this.trackedAnchorLayout?.elements.length || 0,
      tracksWorldElement: Boolean(this.trackedWorldElement),
      groupPosition: this.group
        ? { x: this.group.position.x, y: this.group.position.y, z: this.group.position.z }
        : null,
    };
  }

  dispose() {
    this.pause();
    this.flows.killAll();
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    this.environment.document?.removeEventListener?.('visibilitychange', this._boundVisibility);
    this.environment.document?.removeEventListener?.('pointermove', this._boundPointer);
    this.canvas?.removeEventListener?.('webglcontextlost', this._boundContextLost);
    this.canvas?.removeEventListener?.('webglcontextrestored', this._boundContextRestored);
    this.particles?.dispose();
    this.controls?.dispose?.();
    this.renderer?.dispose?.();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.group = null;
    this.particles = null;
    this.controls = null;
    this.canvas = null;
    this.trackedPins = [];
    this.trackedAnchorLayout = null;
    this.trackedWorldElement = null;
  }
}
