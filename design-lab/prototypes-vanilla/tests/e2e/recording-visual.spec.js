import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(here, '../../../..');
const manifestPath = path.join(repositoryRoot, 'demo-data/bangkok/manifest.json');
const artifactRoot = path.resolve(process.cwd(), 'artifacts/recording-visual/current');
const badCopy = /\uFFFD|Ã.|Â.|â.|undefined|null|\[object Object\]/i;

async function demoFiles() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  return Promise.all(Object.entries(manifest).map(async ([name, item]) => ({
    name,
    mimeType: item.declaredContentType,
    buffer: await readFile(path.join(repositoryRoot, item.demoSourcePath)),
  })));
}

async function waitUntilStable(page) {
  await page.waitForFunction(() => window.__ELSEWHERE_VISUAL_READY__ === true, null, { timeout: 20_000 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function assertHealthy(page, pageId) {
  await expect(page.locator(`[data-page-id="${pageId}"]`)).toBeVisible();
  await waitUntilStable(page);
  const health = await page.evaluate(() => {
    const app = document.querySelector('.app-viewport');
    const layer = document.querySelector('#page-content-layer');
    const pageRoot = layer?.querySelector('[data-page-id]');
    const appRect = app?.getBoundingClientRect();
    const rootRect = pageRoot?.getBoundingClientRect();
    const overlays = [...document.querySelectorAll('#overlay-root > *, #else-drawer-host > *')]
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);
    return {
      text: pageRoot?.innerText || '',
      horizontalOverflow: layer ? layer.scrollWidth - layer.clientWidth : 999,
      pageInsideViewport: Boolean(appRect && rootRect
        && rootRect.left >= appRect.left - 1
        && rootRect.right <= appRect.right + 1),
      overlaysInsideViewport: overlays.every((rect) => (
        rect.left >= appRect.left - 1 && rect.right <= appRect.right + 1
        && rect.top >= appRect.top - 1 && rect.bottom <= appRect.bottom + 1
      )),
      elseCount: document.querySelectorAll('[data-else-orb]').length,
      overflowSources: [...document.querySelectorAll('*')]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            element: `${element.tagName.toLowerCase()}.${[...element.classList].join('.')}`,
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
          };
        })
        .filter((item) => item.clientWidth > 0 && item.scrollWidth - item.clientWidth > 1)
        .slice(0, 12),
    };
  });
  expect(health.text).not.toMatch(badCopy);
  expect(health.horizontalOverflow, JSON.stringify(health.overflowSources)).toBeLessThanOrEqual(1);
  expect(health.pageInsideViewport).toBe(true);
  expect(health.overlaysInsideViewport).toBe(true);
  expect(health.elseCount).toBeLessThanOrEqual(1);
}

async function capture(page, viewport, name) {
  const directory = path.join(artifactRoot, `${viewport.width}x${viewport.height}`);
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: path.join(directory, `${name}.png`), animations: 'allow' });
}

async function assertScrollTracking(page, selector, debugFlag) {
  const before = await page.evaluate((elementSelector) => {
    const element = document.querySelector(elementSelector);
    return {
      top: element.getBoundingClientRect().top,
      group: window.__ELSEWHERE_DEBUG__.snapshot().groupPosition,
    };
  }, selector);
  await page.locator('#page-content-layer').evaluate((layer) => layer.scrollTo({ top: 140, behavior: 'instant' }));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const after = await page.evaluate((elementSelector) => {
    const element = document.querySelector(elementSelector);
    return {
      top: element.getBoundingClientRect().top,
      debug: window.__ELSEWHERE_DEBUG__.snapshot(),
    };
  }, selector);
  const domDelta = after.top - before.top;
  const particleDelta = after.debug.groupPosition.y - before.group.y;
  expect(Math.abs(domDelta)).toBeGreaterThan(80);
  expect(Math.abs(particleDelta)).toBeGreaterThan(0.5);
  expect(domDelta * particleDelta).toBeLessThan(0);
  expect(after.debug[debugFlag]).toBeTruthy();
}

test('recording-critical live pages remain readable, bounded and spatially anchored', async ({ page }) => {
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });

  const files = await demoFiles();
  await page.goto('/#/world/import');
  await expect(page.locator('[data-page-id="world-import"]')).toBeVisible();
  await page.locator('[data-live-files]').setInputFiles(files);
  await page.getByRole('button', { name: new RegExp(`开始整理 ${files.length} 个原件`) }).click();
  await expect(page.locator('[data-page-id="world-receipt"]')).toBeVisible({ timeout: 150_000 });
  await expect(page.locator('.receipt-core strong')).toHaveText(String(files.length));

  for (const viewport of [{ width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport);

    await page.goto('/#/world');
    await assertHealthy(page, 'world-home');
    await capture(page, viewport, '01-world-top');
    await assertScrollTracking(page, '[data-globe-stage]', 'tracksWorldElement');
    await capture(page, viewport, '02-world-scrolled');

    await page.goto('/#/world/city/bangkok');
    await assertHealthy(page, 'world-city-home');
    expect(await page.locator('.city-tile').count()).toBeGreaterThanOrEqual(3);
    await capture(page, viewport, '03-city-top');
    await assertScrollTracking(page, '[data-cluster-anchor]', 'trackedAnchorCount');
    await capture(page, viewport, '04-city-scrolled');

    await page.goto('/#/world/fragments');
    await assertHealthy(page, 'world-fragments');
    await expect(page.locator('[data-field-node]')).toHaveCount(files.length);
    await capture(page, viewport, '05-fragment-field');
    await page.locator('[data-field-search]').fill('Common Grounds');
    await expect(page.locator('[data-field-node][data-relevance="focused"]')).not.toHaveCount(0);
    await page.locator('[data-field-node][data-relevance="focused"]').first().click();
    await expect(page.locator('.fragment-lens')).toBeVisible();
    await assertHealthy(page, 'world-fragments');
    await capture(page, viewport, '06-fragment-lens');
    await page.getByRole('button', { name: '关闭', exact: true }).click();

    await page.goto('/#/discover');
    await assertHealthy(page, 'discover-home');
    await expect(page.locator('[data-page-id="discover-home"] [data-primary-action]')).toHaveCount(1);
    await expect(page.locator('.featured-copy button')).toBeInViewport();
    await capture(page, viewport, '07-discover-home');
    await page.locator('.featured-copy button').click();
    await assertHealthy(page, 'discover-detail');
    await expect(page.locator('[data-discovery-evidence] [data-fragment-id]')).toHaveCount(3);
    await expect(page.locator('.discovery-title-reveal')).toBeVisible();
    await expect(page.locator('.discovery-title-reveal')).toBeInViewport();
    const titleEvidenceGap = await page.evaluate(() => {
      const title = document.querySelector('.discovery-title-reveal').getBoundingClientRect();
      const firstEvidence = document.querySelector('.discovery-time-node').getBoundingClientRect();
      return firstEvidence.top - title.bottom;
    });
    expect(titleEvidenceGap).toBeGreaterThanOrEqual(8);
    await capture(page, viewport, '08-discover-detail');

    await page.locator('[data-else-orb]').click();
    await expect(page.locator('.else-drawer')).toBeVisible();
    await page.locator('[data-store-action="else-query"]').fill('我反复去过哪里？');
    await page.locator('[data-action="submit-else"]').click();
    await expect(page.locator('.else-drawer--found, .else-drawer--uncertain')).toBeVisible({ timeout: 60_000 });
    await assertHealthy(page, 'discover-detail');
    await capture(page, viewport, '09-else-answer');
    await page.locator('[data-else-orb]').click();
  }

  expect(runtimeErrors).toEqual([]);
});
