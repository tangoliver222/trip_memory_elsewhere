import { test, expect } from '@playwright/test';

test('route churn keeps one renderer, one canvas and no active stale timeline', async ({ page }) => {
  const churnPaths = [
    '/#/world',
    '/#/world/city/bangkok',
    '/#/world/fragments',
    '/#/discover/disc-ari-mornings',
    '/#/world/city/bangkok/explore?view=connection',
    '/#/me/privacy',
  ];
  for (const path of churnPaths) {
    await page.goto(path);
    await expect(page.locator('[data-page-id]')).toBeVisible();
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(1500);
  await expect(page.locator('#memory-canvas')).toHaveCount(1);
  expect(await page.evaluate(() => window.__ELSEWHERE_DEBUG__.rendererCreations)).toBe(1);
  expect(await page.evaluate(() => window.__ELSEWHERE_DEBUG__.activeTimelines)).toBe(0);
  expect(await page.evaluate(() => window.__ELSEWHERE_DEBUG__.trackedTimelines)).toBeLessThanOrEqual(1);
});

test('context loss exposes a static memory fallback without losing the page action', async ({ page }) => {
  await page.goto('/#/world');
  await expect(page.locator('[data-primary-action]')).toBeEnabled();
  await page.evaluate(() => window.__ELSEWHERE_DEBUG__.loseContext());
  await expect(page.locator('[data-visual-fallback]')).toBeVisible();
  await expect(page.locator('[data-primary-action]')).toBeEnabled();
  expect(await page.evaluate(() => window.__ELSEWHERE_DEBUG__.paused)).toBe(true);
});
