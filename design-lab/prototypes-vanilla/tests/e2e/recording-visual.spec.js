import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

test.setTimeout(180_000);

const here = path.dirname(fileURLToPath(import.meta.url));
const artifactRoot = path.resolve(process.cwd(), 'artifacts/recording-visual/current');
const badCopy = /\uFFFD|Ã.|Â.|â.|undefined|null|\[object Object\]/i;

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

async function assertRecordingComposition(page, pageId) {
  if (pageId === 'world-city-home') {
    const gap = await page.evaluate(async () => {
      const layer = document.querySelector('#page-content-layer');
      layer.scrollTop = layer.scrollHeight;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const navigation = document.querySelector('.app-navigation').getBoundingClientRect();
      const supportingActions = document.querySelector('.city-foot__aux').getBoundingClientRect();
      return navigation.top - supportingActions.bottom;
    });
    expect(gap).toBeGreaterThanOrEqual(24);
    return;
  }

  if (pageId === 'world-fragments') {
    const { duplicateCaptions, misplacedClusterLabels } = await page.evaluate(() => ({
      duplicateCaptions: [...document.querySelectorAll('.field-node:not(.field-node--photo) .field-node__label, .field-node:not(.field-node--photo) .field-node__type, .field-node:not(.field-node--photo) .field-node__provenance')]
        .filter((label) => getComputedStyle(label).display !== 'none').length,
      misplacedClusterLabels: [...document.querySelectorAll('.field-cluster-label')]
        .filter((label) => label.getBoundingClientRect().top < 12).length,
    }));
    expect(duplicateCaptions).toBe(0);
    expect(misplacedClusterLabels).toBe(0);
    return;
  }

  if (pageId === 'discover-home') {
    const { gap, duplicateArtifactCaptions } = await page.evaluate(() => {
      const sources = [...document.querySelectorAll('.feature-source')].map((source) => source.getBoundingClientRect());
      const copy = document.querySelector('.featured-copy').getBoundingClientRect();
      return {
        gap: copy.top - Math.max(...sources.map((source) => source.bottom)),
        duplicateArtifactCaptions: [...document.querySelectorAll('.feature-source:has(.artifact) > span')]
          .filter((caption) => getComputedStyle(caption).display !== 'none').length,
      };
    });
    expect(gap).toBeGreaterThanOrEqual(16);
    expect(duplicateArtifactCaptions).toBe(0);
    return;
  }

  if (pageId === 'discover-detail') {
    const duplicateArtifactCaptions = await page.locator('.discovery-time-node button:has(.artifact) > span').evaluateAll((captions) => (
      captions.filter((caption) => getComputedStyle(caption).display !== 'none').length
    ));
    expect(duplicateArtifactCaptions).toBe(0);
  }
}

test('recording fixture remains readable, bounded and visually stable', async ({ page }) => {
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });

  await page.goto('/');
  await page.getByRole('button', { name: '进入世界首页' }).click();
  await expect(page.locator('[data-page-id="world-home"]')).toBeVisible();
  await page.getByRole('button', { name: '放入新的碎片' }).click();
  await expect(page.locator('[data-page-id="world-import"]')).toBeVisible();

  for (const viewport of [{ width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport);

    await page.goto('/#/world');
    await assertHealthy(page, 'world-home');
    await capture(page, viewport, '01-world-top');

    await page.goto('/#/world/city/bangkok');
    await assertHealthy(page, 'world-city-home');
    expect(await page.locator('.city-tile').count()).toBeGreaterThanOrEqual(3);
    await assertRecordingComposition(page, 'world-city-home');
    await page.locator('#page-content-layer').evaluate((layer) => layer.scrollTo({ top: 0, behavior: 'instant' }));
    await capture(page, viewport, '02-city-top');

    await page.goto('/#/world/fragments');
    await assertHealthy(page, 'world-fragments');
    expect(await page.locator('[data-field-node]').count()).toBeGreaterThanOrEqual(6);
    await assertRecordingComposition(page, 'world-fragments');
    await capture(page, viewport, '03-fragment-field');
    await page.locator('[data-field-search]').fill('Common Grounds');
    const focused = page.locator('[data-field-node][data-relevance="focused"]');
    const focusedCount = await focused.count();
    expect(focusedCount).toBeGreaterThan(0);
    await focused.nth(0).click();
    await expect(page.locator('.fragment-lens')).toBeVisible();
    await assertHealthy(page, 'world-fragments');
    await capture(page, viewport, '04-fragment-lens');
    await page.getByRole('button', { name: '关闭', exact: true }).click();

    await page.goto('/#/discover');
    await assertHealthy(page, 'discover-home');
    await expect(page.locator('[data-page-id="discover-home"] [data-primary-action]')).toHaveCount(1);
    await expect(page.locator('.featured-copy button')).toBeInViewport();
    await assertRecordingComposition(page, 'discover-home');
    await capture(page, viewport, '05-discover-home');
    await page.locator('.featured-copy button').click();
    await assertHealthy(page, 'discover-detail');
    expect(await page.locator('[data-discovery-evidence] [data-fragment-id]').count()).toBeGreaterThanOrEqual(3);
    await expect(page.locator('.discovery-title-reveal')).toBeVisible();
    await expect(page.locator('.discovery-title-reveal')).toBeInViewport();
    await assertRecordingComposition(page, 'discover-detail');
    const titleEvidenceGap = await page.evaluate(() => {
      const title = document.querySelector('.discovery-title-reveal').getBoundingClientRect();
      const firstEvidence = document.querySelector('.discovery-time-node').getBoundingClientRect();
      return firstEvidence.top - title.bottom;
    });
    expect(titleEvidenceGap).toBeGreaterThanOrEqual(8);
    await capture(page, viewport, '06-discover-detail');

    await page.locator('[data-else-orb]').click();
    await expect(page.locator('.else-drawer')).toBeVisible();
    await page.locator('[data-store-action="else-query"]').fill('我反复去过哪里？');
    await page.locator('[data-action="submit-else"]').click();
    await expect(page.locator('.else-drawer--found, .else-drawer--uncertain')).toBeVisible({ timeout: 60_000 });
    await assertHealthy(page, 'discover-detail');
    await capture(page, viewport, '07-else-answer');
    await page.locator('[data-else-orb]').click();
  }

  expect(runtimeErrors).toEqual([]);
});
