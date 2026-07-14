import { test, expect } from '@playwright/test';
import { waitForVisualReady } from './helpers.js';

test('official route state waits for assets, scene and the main timeline', async ({ page }) => {
  await page.goto('/#/world');
  await waitForVisualReady(page);

  await expect(page.locator('html')).toHaveAttribute('data-visual-ready', 'true');
  expect(await page.evaluate(() => window.__ELSEWHERE_DEBUG__.activeTimelines)).toBe(0);
  expect(await page.locator('[data-page-id="world-home"] h1').evaluate((heading) => getComputedStyle(heading).filter)).toBe('none');
});

test('a superseded route cannot publish a stale ready state', async ({ page }) => {
  await page.goto('/#/world');
  await page.evaluate(() => { window.location.hash = '#/world/fragments'; });
  await expect(page.locator('[data-page-id="world-fragments"]')).toBeVisible();
  await waitForVisualReady(page);

  expect(await page.evaluate(() => window.location.hash)).toBe('#/world/fragments');
  await expect(page.locator('html')).toHaveAttribute('data-visual-ready', 'true');
});
