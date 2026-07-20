import { test, expect } from '@playwright/test';

const nextFrame = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

async function waitForParticles(page) {
  await page.waitForFunction(() => Boolean(window.__ELSEWHERE_DEBUG__?.snapshot));
  await page.waitForFunction(() => document.querySelectorAll('[data-particle-anchor]').length > 0);
  await nextFrame(page);
}

test('zero, small and large datasets compile distinct browser particle scenes', async ({ page }) => {
  await page.goto('/#/world/city/bangkok');
  const matrix = await page.evaluate(async () => {
    const { compileParticleScene } = await import('/src/visual/particle-scene-compiler.js');
    const anchor = { id: 'fragment-a', x: 0, y: 0, z: -2, role: 'fragment', weight: 1 };
    const summarize = (scene) => ({
      state: scene.state,
      activeCount: scene.activeCount,
      anchorCount: scene.anchorCount,
      signature: scene.dataSignature,
    });
    return {
      zero: summarize(compileParticleScene('cityCluster', 1_000, { itemCount: 0, items: [], anchors: [] })),
      small: summarize(compileParticleScene('cityCluster', 1_000, { itemCount: 3, items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], anchors: [anchor] })),
      large: summarize(compileParticleScene('cityCluster', 1_000, { itemCount: 180, items: [{ id: 'a' }], anchors: [anchor] })),
    };
  });

  expect(matrix.zero.state).toBe('initializing');
  expect(matrix.zero.anchorCount).toBe(0);
  expect(matrix.zero.activeCount).toBeLessThan(matrix.small.activeCount);
  expect(matrix.small.activeCount).toBeLessThan(matrix.large.activeCount);
  expect(new Set([matrix.zero.signature, matrix.small.signature, matrix.large.signature]).size).toBe(3);
});

test('vertical page scroll moves particle space immediately with its fragment anchors', async ({ page }) => {
  await page.goto('/#/world/city/bangkok');
  await waitForParticles(page);
  const before = await page.evaluate(() => ({
    snapshot: window.__ELSEWHERE_DEBUG__.snapshot(),
    anchorTop: document.querySelector('[data-particle-anchor]').getBoundingClientRect().top,
  }));

  await page.locator('#page-content-layer').evaluate((layer) => { layer.scrollTop = 180; });
  await nextFrame(page);
  const after = await page.evaluate(() => ({
    snapshot: window.__ELSEWHERE_DEBUG__.snapshot(),
    anchorTop: document.querySelector('[data-particle-anchor]').getBoundingClientRect().top,
  }));

  expect(after.anchorTop).toBeLessThan(before.anchorTop - 100);
  expect(after.snapshot.spatialTransform.pixelY).toBeLessThan(-100);
  expect(after.snapshot.dataSignature).toBe(before.snapshot.dataSignature);
  expect(after.snapshot.activeTimelines).toBeLessThanOrEqual(before.snapshot.activeTimelines);
});

test('Fragment Field pan and zoom apply the same camera transform to particles', async ({ page }) => {
  await page.goto('/#/world/fragments');
  await waitForParticles(page);
  const viewport = page.locator('[data-field-viewport]');
  const box = await viewport.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box.x + box.width * 0.52, box.y + box.height * 0.52);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.62, { steps: 4 });
  await page.mouse.up();
  await nextFrame(page);

  const afterPan = await page.evaluate(() => window.__ELSEWHERE_DEBUG__.snapshot().spatialTransform);
  expect(Math.abs(afterPan.pixelX) + Math.abs(afterPan.pixelY)).toBeGreaterThan(10);
  expect(['field-camera', 'composed']).toContain(afterPan.source);

  await viewport.dispatchEvent('wheel', { deltaY: -90, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 });
  await nextFrame(page);
  const afterZoom = await page.evaluate(() => window.__ELSEWHERE_DEBUG__.snapshot().spatialTransform);
  expect(afterZoom.scale).toBeGreaterThan(1);

  const beforeSearch = await page.evaluate(() => window.__ELSEWHERE_DEBUG__.snapshot());
  await page.locator('[data-field-search]').fill('Common Grounds');
  await nextFrame(page);
  const afterSearch = await page.evaluate(() => window.__ELSEWHERE_DEBUG__.snapshot());
  expect(afterSearch.dataSignature).not.toBe(beforeSearch.dataSignature);
  expect(afterSearch.anchorCount).toBe(await page.locator('[data-field-node]').count());
});

test('route changes reuse one pool while current data and anchors change scene signature', async ({ page }) => {
  await page.goto('/#/world');
  await waitForParticles(page);
  const world = await page.evaluate(() => window.__ELSEWHERE_DEBUG__.snapshot());

  await page.evaluate(() => { location.hash = '#/world/city/bangkok'; });
  await page.waitForSelector('[data-page-id="world-city-home"]');
  await waitForParticles(page);
  const city = await page.evaluate(() => window.__ELSEWHERE_DEBUG__.snapshot());

  await page.evaluate(() => { location.hash = '#/discover'; });
  await page.waitForSelector('[data-page-id="discover-home"]');
  await waitForParticles(page);
  const discovery = await page.evaluate(() => window.__ELSEWHERE_DEBUG__.snapshot());

  expect(city.particlePoolId).toBe(world.particlePoolId);
  expect(discovery.particlePoolId).toBe(world.particlePoolId);
  expect(city.dataSignature).not.toBe(world.dataSignature);
  expect(discovery.dataSignature).not.toBe(city.dataSignature);
  expect(world.anchorCount).toBeGreaterThan(0);
  expect(city.anchorCount).toBeGreaterThan(0);
  expect(discovery.anchorCount).toBeGreaterThan(0);
});
