import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = resolve(repoRoot, 'design-lab/prototypes-vanilla');
const requireFromApp = createRequire(resolve(appDir, 'package.json'));
const { chromium } = requireFromApp('@playwright/test');
const baseUrl = 'http://127.0.0.1:4322';
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const server = spawn(resolve(appDir, 'node_modules/.bin/vite'), ['--host', '127.0.0.1', '--port', '4322'], {
  cwd: appDir,
  stdio: 'ignore',
});

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error('Timed out waiting for the local Elsewhere performance server.');
}

const cases = [
  { name: 'low-mobile-390', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, memory: 2, cores: 4 },
  { name: 'high-desktop-1440', viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, memory: 8, cores: 8 },
  { name: 'reduced-motion-390', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, memory: 8, cores: 8, reducedMotion: 'reduce' },
];

async function measure(browser, definition) {
  const context = await browser.newContext({
    viewport: definition.viewport,
    deviceScaleFactor: definition.deviceScaleFactor,
    reducedMotion: definition.reducedMotion || 'no-preference',
  });
  await context.addInitScript(({ memory, cores }) => {
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, get: () => memory });
    Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, get: () => cores });
  }, { memory: definition.memory, cores: definition.cores });
  const page = await context.newPage();
  const started = performance.now();
  await page.goto(`${baseUrl}/#/world`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-page-id="world-home"]').waitFor({ state: 'visible' });
  const firstMeaningfulRenderMs = performance.now() - started;
  await page.waitForTimeout(4300);

  const fps = await page.evaluate(() => new Promise((resolveFps) => {
    const intervals = [];
    let previous = performance.now();
    const start = previous;
    const frame = (now) => {
      intervals.push(now - previous);
      previous = now;
      if (now - start >= 1400) {
        const average = intervals.length / ((now - start) / 1000);
        const min = 1000 / Math.max(...intervals);
        resolveFps({ average, min, samples: intervals.length });
        return;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }));

  const metrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0];
    const debug = window.__ELSEWHERE_DEBUG__.snapshot();
    return {
      loadTimeMs: navigation ? navigation.loadEventEnd - navigation.startTime : null,
      jsHeapBytes: performance.memory?.usedJSHeapSize ?? null,
      particleCount: debug.particleCount,
      profile: debug.profile,
      rendererCreations: debug.rendererCount,
      canvasCount: document.querySelectorAll('#memory-canvas').length,
      activeTimelines: debug.activeTimelines,
      trackedTimelines: debug.trackedTimelines,
      devicePixelRatio: window.devicePixelRatio,
    };
  });
  await page.evaluate(() => window.__ELSEWHERE_DEBUG__.loseContext());
  const contextLossFallback = await page.locator('[data-visual-fallback]').isVisible();
  const primaryActionEnabled = await page.locator('[data-primary-action]').isEnabled();
  await context.close();

  const result = {
    name: definition.name,
    viewport: definition.viewport,
    firstMeaningfulRenderMs: Math.round(firstMeaningfulRenderMs),
    averageFps: Number(fps.average.toFixed(1)),
    minFps: Number(fps.min.toFixed(1)),
    fpsSamples: fps.samples,
    ...metrics,
    effectiveDpr: Math.min(metrics.devicePixelRatio, metrics.profile.maxDpr),
    contextLoss: { fallbackVisible: contextLossFallback, primaryActionEnabled },
  };
  result.budgets = {
    firstMeaningfulRender: result.firstMeaningfulRenderMs < 2500,
    fps: result.averageFps >= result.profile.fps * 0.55,
    particleCeiling: result.particleCount <= 9800,
    dprCeiling: result.effectiveDpr <= 1.5,
    singletonResources: result.canvasCount === 1 && result.rendererCreations === 1,
    noActiveStaleTimeline: result.activeTimelines === 0,
    contextFallback: contextLossFallback && primaryActionEnabled,
  };
  result.pass = Object.values(result.budgets).every(Boolean);
  return result;
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true, executablePath: chromePath });
  const profiles = [];
  for (const definition of cases) profiles.push(await measure(browser, definition));
  const report = {
    generatedAt: new Date().toISOString(),
    source: 'scripts/profile-performance.mjs',
    profiles,
    pass: profiles.every((profile) => profile.pass),
  };
  await writeFile(resolve(repoRoot, 'performance-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.pass) process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
