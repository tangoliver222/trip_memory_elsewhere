import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';
import { ROUTE_CASES } from './helpers.js';

test('capture every routed surface at the shared reference bar', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-390', 'The exhaustive visual audit is captured once at the strictest phone width.');
  test.setTimeout(180_000);
  const output = resolve(process.cwd(), 'artifacts/screenshots/all-pages', testInfo.project.name);
  await mkdir(output, { recursive: true });

  for (const [index, route] of ROUTE_CASES.entries()) {
    await page.goto(route.path);
    await expect(page.locator(`[data-page-id="${route.pageId}"]`)).toBeVisible();
    await expect(page.locator('#overlay-root > *')).toHaveCount(0);
    await page.waitForFunction(() => window.__ELSEWHERE_VISUAL_READY__ === true, null, { timeout: 20_000 });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const prefix = `${String(index + 1).padStart(2, '0')}-${route.name}`;
    await page.screenshot({ path: resolve(output, `${prefix}--top.png`) });

    const scrollable = await page.locator('#page-content-layer').evaluate((layer) => {
      const distance = layer.scrollHeight - layer.clientHeight;
      if (distance < 120) return false;
      layer.scrollTo({ top: Math.round(distance * 0.58), behavior: 'instant' });
      return true;
    });
    if (scrollable) {
      await page.waitForTimeout(220);
      await page.screenshot({ path: resolve(output, `${prefix}--mid.png`) });
    }
  }
});
