import { expect } from '@playwright/test';
import { ROUTES } from '../../src/page-manifest.js';

export const ROUTE_CASES = [
  ...ROUTES.map((route) => ({
    name: route.pageId,
    path: `/${route.samplePath}`,
    pageId: route.pageId,
    hidesElse: route.elseScope === 'none',
  })),
  { name: 'explore-place', path: '/#/world/city/bangkok/explore?view=place', pageId: 'world-explore', hidesElse: false },
  { name: 'explore-connection', path: '/#/world/city/bangkok/explore?view=connection', pageId: 'world-explore', hidesElse: false },
];

export const collectPageErrors = (page) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()} @ ${message.location().url || 'unknown'}`);
  });
  return errors;
};

export async function waitForVisualReady(page) {
  await page.waitForFunction(() => window.__ELSEWHERE_VISUAL_READY__ === true);
  await page.waitForTimeout(150);
}

export async function expectHealthyPage(page, route) {
  await waitForVisualReady(page);
  await expect(page.locator('[data-page-id]')).toHaveAttribute('data-page-id', route.pageId);
  await expect(page.locator('#memory-canvas')).toHaveCount(1);
  await expect(page.locator('[data-else-orb]')).toHaveCount(route.hidesElse ? 0 : 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth)).toBe(true);
  const brokenImages = await page.locator('img').evaluateAll((images) => images.filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.getAttribute('src')));
  expect(brokenImages).toEqual([]);
  const visibleText = await page.locator('body').innerText();
  expect(visibleText).not.toMatch(/\b(?:frag|rel|scene|disc)-[a-z0-9-]+\b/i);
}
