import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(here, '../../../..');
const manifestPath = path.join(repositoryRoot, 'demo-data/bangkok/manifest.json');
const enabled = process.env.RUN_REAL_GOOGLE_PROVIDER_TESTS === 'true';
test.skip(!enabled, 'Set RUN_REAL_GOOGLE_PROVIDER_TESTS=true to permit real provider calls.');

async function demoFiles() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  return Promise.all(Object.entries(manifest).map(async ([name, item]) => ({
    name,
    mimeType: item.declaredContentType,
    buffer: await readFile(path.join(repositoryRoot, item.demoSourcePath)),
  })));
}

async function liveClient(page) {
  return page.evaluate(async () => {
    const { runtimeState } = await import('/src/data/runtime.js');
    if (!runtimeState.client) throw new Error('Live client is unavailable');
    return true;
  });
}

test('real Google providers process one receipt and keep every answer reviewable', async ({ page }) => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const receipt = manifest['COMMON-GROUNDS-receipt-2024-10-19.png'];
  expect(receipt).toBeTruthy();
  expect(JSON.stringify(receipt)).not.toMatch(/merchant|amount|ocr|textExcerpt/i);

  const files = await demoFiles();
  await page.goto('/#/world/import');
  await expect(page.locator('[data-page-id="world-import"]')).toBeVisible();
  await liveClient(page);

  try {
    await page.locator('[data-live-files]').setInputFiles(files);
    await page.getByRole('button', { name: new RegExp(`开始整理 ${files.length} 个原件`) }).click();

    await expect(page.locator('[data-page-id="world-receipt"]')).toBeVisible({ timeout: 240_000 });
    await expect(page.locator('.receipt-core strong')).toHaveText(String(files.length));
    await expect(page.locator('.processing-provenance')).toContainText('Google Document AI');

    const persisted = await page.evaluate(async () => {
      const { runtimeState } = await import('/src/data/runtime.js');
      const snapshot = await runtimeState.client.getSnapshot();
      const ocrFragments = snapshot.fragments.filter((fragment) => fragment.ocr);
      return {
        fragments: snapshot.fragments.length,
        batches: snapshot.importBatches.length,
        ocrFragments: ocrFragments.map((fragment) => ({
          type: fragment.type,
          provider: fragment.ocr.provider,
          textExcerpt: fragment.ocr.textExcerpt,
          trace: fragment.processingTrace,
        })),
      };
    });
    expect(persisted.fragments).toBe(files.length);
    expect(persisted.batches).toBe(1);
    expect(persisted.ocrFragments).toHaveLength(1);
    expect(persisted.ocrFragments[0].type).toBe('receipt');
    expect(persisted.ocrFragments[0].provider).toBe('Google Document AI');
    expect(persisted.ocrFragments[0].textExcerpt).toMatch(/COMMON\s+GROUNDS/i);
    expect(persisted.ocrFragments[0].trace).toContainEqual(expect.objectContaining({
      stage: 'ocr', status: 'completed', provider: 'Google Document AI',
    }));

    await page.goto('/#/world');
    await expect(page.locator('.world-stats')).toContainText(`${files.length} 个碎片`);
    await page.getByRole('button', { name: '进入 Bangkok' }).click();
    await expect(page.locator('[data-page-id="world-city-home"]')).toBeVisible();

    await page.goto('/#/world/fragments');
    await expect(page.locator('[data-field-node]')).toHaveCount(files.length);
    const ocrNode = page.locator('[data-field-node] .field-node__provenance').first();
    await expect(ocrNode).toContainText('Document AI');
    await ocrNode.locator('..').click();
    await expect(page.locator('.fragment-lens .fragment-ocr')).toContainText('COMMON GROUNDS');
    await page.getByRole('button', { name: '关闭', exact: true }).click();

    await page.goto('/#/discover');
    await expect(page.locator('.discovery-feature')).toBeVisible();
    await page.locator('.featured-copy button').click();
    await expect(page.locator('[data-page-id="discover-detail"]')).toBeVisible();
    await page.locator('[data-else-orb]').click();
    await page.locator('[data-store-action="else-query"]').fill('我反复去过哪里？');
    await page.locator('[data-action="submit-else"]').click();
    await expect(page.locator('.else-drawer--found')).toBeVisible({ timeout: 90_000 });
    const source = page.locator('.else-sources [data-fragment-id]').first();
    await expect(source).toBeVisible();
    await source.click();
    await expect(page.locator('.fragment-lens')).toBeVisible();
  } finally {
    const remaining = await page.evaluate(async () => {
      const { runtimeState } = await import('/src/data/runtime.js');
      if (!runtimeState.client) return null;
      await runtimeState.client.reset();
      return runtimeState.client.getSnapshot();
    }).catch(() => null);
    expect(remaining?.fragments).toHaveLength(0);
    expect(remaining?.importBatches).toHaveLength(0);
  }
});
