let active = null;
let mountCount = 0;
let generation = 0;

const speedFor = Object.freeze({ idle: 0.72, reading: 1.35, found: 0.9, uncertain: 0.48, conflict: 1.65 });

export function destroyElseIp() {
  generation += 1;
  active?.animation?.destroy();
  active = null;
}

export async function syncElseIp(root, state = 'idle') {
  const player = root?.querySelector?.('[data-else-lottie-player]');
  if (!player) {
    destroyElseIp();
    return;
  }

  if (active?.player === player) {
    active.state = state;
    active.animation?.setSpeed(speedFor[state] || speedFor.idle);
    player.closest('[data-else-lottie]')?.setAttribute('data-animation-state', state);
    return;
  }

  destroyElseIp();
  const currentGeneration = generation;
  active = { player, animation: null, state };
  const { default: lottie } = await import('lottie-web/build/player/lottie_light.js');
  if (!active || active.player !== player || generation !== currentGeneration) return;
  const animation = lottie.loadAnimation({
    container: player,
    renderer: 'svg',
    loop: true,
    autoplay: !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    path: '/assets/else-quiet-float.json',
    assetsPath: '/assets/',
    rendererSettings: { preserveAspectRatio: 'xMidYMid meet', progressiveLoad: true },
  });
  active.animation = animation;
  animation.setSpeed(speedFor[active.state] || speedFor.idle);
  mountCount += 1;
  animation.addEventListener('DOMLoaded', () => player.closest('[data-else-lottie]')?.classList.add('is-lottie-ready'));
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) animation.goToAndStop(75, true);
}

export const debugElseIp = () => Object.freeze({ activeInstances: active ? 1 : 0, mountCount, state: active?.state || null });
