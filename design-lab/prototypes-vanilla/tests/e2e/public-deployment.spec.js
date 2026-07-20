import { test, expect } from '@playwright/test';

const routes = [
  ['/#/world', 'world-home'],
  ['/#/world/city/bangkok', 'world-city-home'],
  ['/#/world/fragments', 'world-fragments'],
  ['/#/discover', 'discover-home'],
];

const badCopy = /\uFFFD|Ã.|Â.|â.|undefined|null|\[object Object\]/i;

test('public entry reaches the world and exposes the import flow', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '进入世界首页' }).click();
  await expect(page).toHaveURL(/#\/world$/);
  await expect(page.locator('[data-page-id="world-home"]')).toBeVisible();

  await page.getByRole('button', { name: '放入新的碎片' }).click();
  await expect(page).toHaveURL(/#\/world\/import$/);
  await expect(page.locator('[data-page-id="world-import"]')).toBeVisible();
});

test('public judge build serves stable recording-critical routes', async ({ page }) => {
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });

  for (const [route, pageId] of routes) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await expect(page.locator(`[data-page-id="${pageId}"]`)).toBeVisible();
    await page.waitForFunction(() => window.__ELSEWHERE_VISUAL_READY__ === true);
    const state = await page.evaluate(() => {
      const layer = document.querySelector('#page-content-layer');
      const root = layer?.querySelector('[data-page-id]');
      return {
        text: root?.innerText || '',
        overflow: layer ? layer.scrollWidth - layer.clientWidth : 999,
        canvases: document.querySelectorAll('#memory-canvas').length,
        navigation: document.querySelectorAll('.app-navigation').length,
      };
    });
    expect(state.text).not.toMatch(badCopy);
    expect(state.overflow).toBeLessThanOrEqual(1);
    expect(state.canvases).toBe(1);
    expect(state.navigation).toBe(1);
  }

  expect(runtimeErrors).toEqual([]);
});

test('public competition video exposes valid review metadata', async ({ page }) => {
  await page.goto('/#/world', { waitUntil: 'domcontentloaded' });
  const metadata = await page.evaluate(async () => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = '/demo/elsewhere-competition-demo.mp4';
    document.body.append(video);
    await new Promise((resolve, reject) => {
      video.addEventListener('loadedmetadata', resolve, { once: true });
      video.addEventListener('error', () => reject(new Error('competition video metadata failed to load')), { once: true });
    });
    return { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
  });

  expect(metadata.duration).toBeGreaterThan(70);
  expect(metadata.duration).toBeLessThan(72);
  expect(metadata.width).toBe(368);
  expect(metadata.height).toBe(800);
});
