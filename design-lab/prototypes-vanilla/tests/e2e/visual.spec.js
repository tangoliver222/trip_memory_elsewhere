import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';
import { waitForVisualReady } from './helpers.js';

const captures = [
  ['world', '/#/world', 4300],
  ['city-world', '/#/world/city/bangkok', 1800],
  ['fragment-field', '/#/world/fragments', 1400],
  ['timeline', '/#/world/city/bangkok/explore?view=time', 1400],
  ['places', '/#/world/city/bangkok/explore?view=place', 1400],
  ['discovery-detail', '/#/discover/disc-ari-mornings', 3400],
  ['fragment-lens', '/#/world/fragments', 1400],
  ['import', '/#/world/import', 1000],
  ['settings', '/#/me', 800],
];

test('capture pass-one visual contact sheet sources', async ({ page }, testInfo) => {
  test.skip(!['mobile-390', 'mobile-430'].includes(testInfo.project.name), 'Reference contact sheets are phone-specific; route health covers larger projects.');
  const visualPass = process.env.VISUAL_PASS || 'pass-1';
  const output = resolve(process.cwd(), `artifacts/screenshots/${visualPass}`, testInfo.project.name);
  await mkdir(output, { recursive: true });

  for (const [name, path, wait] of captures) {
    await page.goto(path);
    await expect(page.locator('[data-page-id]')).toBeVisible();
    await expect(page.locator('#overlay-root > *')).toHaveCount(0);
    await waitForVisualReady(page);
    if (name === 'fragment-lens') {
      await page.locator('[data-field-node]').first().click();
      await expect(page.locator('.fragment-lens__panel')).toBeVisible();
      await waitForVisualReady(page);
    }
    await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: true });
  }
});
