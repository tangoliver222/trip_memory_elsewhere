const PROFILES = Object.freeze({
  low: Object.freeze({ particleCount: 3000, maxDpr: 1, antialias: false, fps: 30 }),
  balanced: Object.freeze({ particleCount: 7200, maxDpr: 1.25, antialias: true, fps: 45 }),
  high: Object.freeze({ particleCount: 9800, maxDpr: 1.5, antialias: true, fps: 60 }),
});

export function getPerformanceProfile(name = 'balanced', { reducedMotion = false } = {}) {
  const selected = reducedMotion ? PROFILES.low : (PROFILES[name] || PROFILES.balanced);
  return { ...selected };
}

export function detectPerformanceProfile(environment = globalThis) {
  const reducedMotion = Boolean(environment.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  if (reducedMotion) return { name: 'low', reducedMotion: true, ...getPerformanceProfile('low') };

  const memory = environment.navigator?.deviceMemory || 4;
  const cores = environment.navigator?.hardwareConcurrency || 4;
  const name = memory >= 8 && cores >= 8 ? 'high' : (memory <= 2 || cores <= 4 ? 'low' : 'balanced');
  return { name, reducedMotion: false, ...getPerformanceProfile(name) };
}
