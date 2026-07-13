import { gsap } from 'gsap';

export function createFlowController({ timelineFactory = (options) => gsap.timeline(options) } = {}) {
  const timelines = new Map();

  const create = (id) => {
    timelines.forEach((timeline) => timeline.kill?.());
    timelines.clear();
    const timeline = timelineFactory({ id, defaults: { ease: 'power3.inOut' } });
    timelines.set(id, timeline);
    return timeline;
  };

  const transition = (id, system, payload, steps) => {
    const timeline = create(id);
    steps(timeline, system?.uniforms || {}, payload || {});
    return timeline;
  };

  return {
    worldIntro(system, payload) {
      return transition('world-intro', system, payload, (timeline, uniforms, options) => {
        const duration = options.reducedMotion ? 0.01 : 1.55;
        timeline.to(uniforms.uProgress || {}, { value: 1, duration })
          .add(() => options.onGlobe?.())
          .to(uniforms.uProgress || {}, { value: 1, duration: options.reducedMotion ? 0.01 : 1.45 })
          .add(() => options.onCities?.())
          .to(uniforms.uPulse || {}, { value: 0.75, duration: 0.22, yoyo: true, repeat: 1 })
          .add(() => options.onComplete?.());
      });
    },
    globeToCity(system, payload) {
      return transition('globe-to-city', system, payload, (timeline, uniforms, options) => {
        timeline.to(uniforms.uPulse || {}, { value: 1, duration: options.reducedMotion ? 0.01 : 0.35 })
          .to(uniforms.uProgress || {}, { value: 1, duration: options.reducedMotion ? 0.01 : 1.1 })
          .add(() => options.onField?.())
          .to(uniforms.uProgress || {}, { value: 1, duration: options.reducedMotion ? 0.01 : 1.25 })
          .to(uniforms.uPulse || {}, { value: 0, duration: 0.35 });
      });
    },
    discoveryReveal(system, payload) {
      return transition('discovery-reveal', system, payload, (timeline, uniforms, options) => {
        timeline.fromTo(uniforms.uOpacity || {}, { value: 0.28 }, { value: 1, duration: options.reducedMotion ? 0.01 : 0.8 })
          .to(uniforms.uProgress || {}, { value: 1, duration: options.reducedMotion ? 0.01 : 1.8 })
          .to(uniforms.uPulse || {}, { value: 1, duration: 0.24, yoyo: true, repeat: 1 });
      });
    },
    lensExtract(system, payload) {
      return transition('lens-extract', system, payload, (timeline, uniforms, options) => {
        timeline.to(uniforms.uDepth || {}, { value: 1.45, duration: options.reducedMotion ? 0.01 : 0.65 })
          .to(uniforms.uNoiseStrength || {}, { value: 0.15, duration: 0.5 }, 0);
      });
    },
    elseState(system, payload) {
      return transition(`else-${payload.state || 'idle'}`, system, payload, (timeline, uniforms, options) => {
        const found = options.state === 'found';
        timeline.to(uniforms.uPulse || {}, { value: found ? 1 : 0.35, duration: options.reducedMotion ? 0.01 : 0.5, yoyo: found, repeat: found ? 1 : 0 })
          .to(uniforms.uNoiseStrength || {}, { value: options.state === 'reading' ? 1.15 : 0.65, duration: 0.45 }, 0);
      });
    },
    morph(system, payload) {
      return transition('morph', system, payload, (timeline, uniforms, options) => {
        timeline.to(uniforms.uProgress || {}, { value: 1, duration: options.reducedMotion ? 0.01 : (options.duration || 1.25) })
          .to(uniforms.uDepth || {}, { value: options.depth || 1, duration: 0.7 }, 0)
          .to(uniforms.uNoiseStrength || {}, { value: options.noiseStrength ?? 0.7, duration: 0.7 }, 0)
          .to(uniforms.uOpacity || {}, { value: options.opacity ?? 0.9, duration: 0.6 }, 0);
      });
    },
    debug() {
      const values = [...timelines.values()];
      return {
        tracked: values.length,
        active: values.filter((timeline) => timeline.isActive?.() ?? true).length,
      };
    },
    killAll() {
      timelines.forEach((timeline) => timeline.kill?.());
      timelines.clear();
    },
  };
}
