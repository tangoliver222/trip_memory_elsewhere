import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(here, '../../../..');
const manifestPath = path.join(repositoryRoot, 'demo-data/bangkok/manifest.json');

async function demoFiles() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  return Promise.all(Object.entries(manifest).map(async ([name, item]) => ({
    name,
    mimeType: item.declaredContentType,
    buffer: await readFile(path.join(repositoryRoot, item.demoSourcePath)),
  })));
}

test('real originals drive import, World, City, Field, Lens and Discovery', async ({ page }) => {
  test.setTimeout(180_000);
  const files = await demoFiles();
  await page.goto('/#/world/import');
  await expect(page.locator('[data-page-id="world-import"]')).toBeVisible();
  await page.locator('[data-live-files]').setInputFiles(files);
  await page.getByRole('button', { name: new RegExp(`开始整理 ${files.length} 个原件`) }).click();

  await expect(page.locator('[data-page-id="world-receipt"]')).toBeVisible({ timeout: 150_000 });
  await expect(page.locator('.receipt-core strong')).toHaveText(String(files.length));

  await page.goto('/#/world');
  await expect(page.locator('.world-stats')).toContainText(`${files.length} 个碎片`);
  await expect(page.getByRole('button', { name: '进入 Bangkok' })).toBeVisible();

  await page.getByRole('button', { name: '进入 Bangkok' }).click();
  await expect(page.locator('[data-page-id="world-city-home"]')).toBeVisible();
  expect(await page.locator('.city-tile').count()).toBeGreaterThanOrEqual(3);

  await page.goto('/#/world/fragments');
  await expect(page.locator('[data-field-node]')).toHaveCount(files.length);
  const firstVisualNode = page.locator('[data-field-node]:has(img)').first();
  const firstFragmentId = await firstVisualNode.getAttribute('data-fragment-id');
  expect(firstFragmentId).toMatch(/^frag_/);
  await firstVisualNode.click();
  await expect(page.locator('.fragment-lens')).toBeVisible();
  await expect(page.locator('.fragment-lens img')).toHaveAttribute('src', /127\.0\.0\.1:9199|localhost:9199/);
  await page.getByRole('button', { name: '关闭', exact: true }).click();

  await page.goto('/#/discover');
  await expect(page.locator('.discovery-feature')).toBeVisible();
  await page.locator('.featured-copy button').click();
  await expect(page.locator('[data-page-id="discover-detail"]')).toBeVisible();
  const evidenceIds = await page.locator('[data-discovery-evidence] [data-fragment-id]').evaluateAll(
    (nodes) => nodes.map((node) => node.dataset.fragmentId),
  );
  expect(evidenceIds).toHaveLength(3);
  expect(evidenceIds.every((id) => id.startsWith('frag_'))).toBe(true);

  await page.locator('[data-else-orb]').click();
  await page.locator('[data-store-action="else-query"]').fill('我反复去过哪里？');
  await page.locator('[data-action="submit-else"]').click();
  await expect(page.locator('.else-drawer--found, .else-drawer--uncertain')).toBeVisible({ timeout: 60_000 });
  const found = page.locator('.else-drawer--found');
  if (process.env.REQUIRE_GEMINI_DEMO === 'true' || await found.count() > 0) {
    await expect(page.locator('.else-drawer--found')).toBeVisible({ timeout: 60_000 });
    const sources = page.locator('.else-sources [data-fragment-id]');
    expect(await sources.count()).toBeGreaterThan(0);
    expect(await sources.first().getAttribute('data-fragment-id')).toMatch(/^frag_/);
  } else {
    await expect(page.locator('.else-drawer--uncertain .else-answer__text')).not.toBeEmpty();
    await expect(page.locator('.else-drawer--uncertain .else-uncertainty')).not.toBeEmpty();
    await expect(page.locator('.else-drawer--uncertain .else-sources [data-fragment-id]')).toHaveCount(0);
  }
});
