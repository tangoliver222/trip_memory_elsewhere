import { gsap } from 'gsap';

/**
 * 记忆心流时间线库。
 * 所有沉浸转场共用同一个粒子池的 uniforms；同一时刻只允许一条主时间线，
 * 新流开始时杀掉全部旧流（防止路由切换后的时间线泄漏）。
 */
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
    if (payload?.onComplete) timeline.add?.(() => payload.onComplete());
    return timeline;
  };

  return {
    /** 首次进入：深空散布 → 2.6–3.0s 回流成大陆点云 → 城市锚点脉冲。 */
    worldIntro(system, payload) {
      return transition('world-intro', system, payload, (timeline, uniforms, options) => {
        const first = options.firstVisit !== false;
        const gather = options.reducedMotion ? 0.01 : (first ? 1.7 : 0.6);
        const settle = options.reducedMotion ? 0.01 : (first ? 1.1 : 0.35);
        timeline
          .fromTo(uniforms.uPositionRandom || {}, { value: first ? 1.4 : 0.4 }, { value: 0.16, duration: gather }, 0)
          .fromTo(uniforms.uNoiseStrength || {}, { value: first ? 2.2 : 0.9 }, { value: 0.55, duration: gather }, 0)
          .to(uniforms.uPointSize || {}, { value: 1.7, duration: gather }, 0)
          .to(uniforms.uOpacity || {}, { value: 0.95, duration: gather }, 0)
          .to(uniforms.uProgress || {}, { value: 1, duration: gather }, 0)
          .add(() => options.onGlobe?.())
          .to(uniforms.uProgress || {}, { value: 1, duration: settle })
          .add(() => options.onCities?.())
          .to(uniforms.uPulse || {}, { value: 0.75, duration: 0.22, yoyo: true, repeat: 1 })
          .to(uniforms.uFocus || {}, { value: 1, duration: 0.5 }, '<');
      });
    },
    /** 地球 → 城市：锚点脉冲、爆散、重组为城市聚类。 */
    globeToCity(system, payload) {
      return transition('globe-to-city', system, payload, (timeline, uniforms, options) => {
        timeline.to(uniforms.uPulse || {}, { value: 1, duration: options.reducedMotion ? 0.01 : 0.35 })
          .to(uniforms.uProgress || {}, { value: 1, duration: options.reducedMotion ? 0.01 : 1.05 })
          .add(() => options.onField?.())
          .to(uniforms.uProgress || {}, { value: 1, duration: options.reducedMotion ? 0.01 : 1.2 })
          .to(uniforms.uPulse || {}, { value: 0, duration: 0.35 });
      });
    },
    /** 发现显影：证据 → 流线 → 中心核收束 → 微脉冲。 */
    discoveryReveal(system, payload) {
      return transition('discovery-reveal', system, payload, (timeline, uniforms, options) => {
        timeline.fromTo(uniforms.uOpacity || {}, { value: 0.3 }, { value: 1, duration: options.reducedMotion ? 0.01 : 0.7 })
          .to(uniforms.uProgress || {}, { value: 1, duration: options.reducedMotion ? 0.01 : 1.7 }, 0)
          .to(uniforms.uFocus || {}, { value: 1, duration: options.reducedMotion ? 0.01 : 0.8 }, '-=0.4')
          .to(uniforms.uPulse || {}, { value: 1, duration: 0.24, yoyo: true, repeat: 1 });
      });
    },
    /** Lens 打开：空间让位，噪声安静，深度轻推。 */
    lensExtract(system, payload) {
      return transition('lens-extract', system, payload, (timeline, uniforms, options) => {
        timeline.to(uniforms.uDepth || {}, { value: 1.45, duration: options.reducedMotion ? 0.01 : 0.6 })
          .to(uniforms.uNoiseStrength || {}, { value: 0.12, duration: 0.5 }, 0)
          .to(uniforms.uOpacity || {}, { value: 0.55, duration: 0.5 }, 0);
      });
    },
    /** Else 状态：idle / reading / found / uncertain / conflict。 */
    elseState(system, payload) {
      return transition(`else-${payload.state || 'idle'}`, system, payload, (timeline, uniforms, options) => {
        const found = options.state === 'found';
        timeline.to(uniforms.uProgress || {}, { value: 1, duration: options.reducedMotion ? 0.01 : 0.8 }, 0)
          .to(uniforms.uPulse || {}, { value: found ? 1 : 0.35, duration: options.reducedMotion ? 0.01 : 0.5, yoyo: found, repeat: found ? 1 : 0 }, 0)
          .to(uniforms.uNoiseStrength || {}, { value: options.state === 'reading' ? 1.1 : 0.55, duration: 0.45 }, 0);
      });
    },
    /** 收件箱判断：确认 = 线闭合脉冲；拒绝 = 断开退散；稍后 = 退入未决。 */
    inboxDecision(system, payload) {
      return transition(`inbox-${payload.result || 'open'}`, system, payload, (timeline, uniforms, options) => {
        const confirmed = options.result === 'confirmed';
        timeline.to(uniforms.uProgress || {}, { value: 1, duration: options.reducedMotion ? 0.01 : 0.9 }, 0)
          .to(uniforms.uPulse || {}, { value: confirmed ? 0.9 : 0.2, duration: options.reducedMotion ? 0.01 : 0.4, yoyo: true, repeat: 1 }, 0)
          .to(uniforms.uFocus || {}, { value: confirmed ? 1 : 0.2, duration: 0.5 }, 0);
      });
    },
    /** 碎片场搜索：相关聚类入场、其余退远。 */
    fieldSearch(system, payload) {
      return transition('field-search', system, payload, (timeline, uniforms, options) => {
        timeline.to(uniforms.uNoiseStrength || {}, { value: 1.4, duration: options.reducedMotion ? 0.01 : 0.3 }, 0)
          .to(uniforms.uProgress || {}, { value: 1, duration: options.reducedMotion ? 0.01 : 1.15 }, 0)
          .to(uniforms.uNoiseStrength || {}, { value: 0.55, duration: 0.5 }, '-=0.4')
          .to(uniforms.uFocus || {}, { value: 1, duration: 0.4 }, '<');
      });
    },
    /** 通用重组。 */
    morph(system, payload) {
      return transition('morph', system, payload, (timeline, uniforms, options) => {
        timeline.to(uniforms.uProgress || {}, { value: 1, duration: options.reducedMotion ? 0.01 : (options.duration || 1.25) })
          .to(uniforms.uDepth || {}, { value: options.depth || 1, duration: 0.7 }, 0)
          .to(uniforms.uNoiseStrength || {}, { value: options.noiseStrength ?? 0.55, duration: 0.7 }, 0)
          .to(uniforms.uOpacity || {}, { value: options.opacity ?? 0.88, duration: 0.6 }, 0)
          .to(uniforms.uPointSize || {}, { value: options.pointSize ?? 1.35, duration: 0.6 }, 0)
          .to(uniforms.uFocus || {}, { value: options.focus ?? 0, duration: 0.6 }, 0);
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
