import { test, expect } from '@playwright/test';
import { collectPageErrors } from './helpers.js';

test('World enters Bangkok without replacing the memory canvas', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto('/#/world');
  const canvas = page.locator('#memory-canvas');
  const handle = await canvas.elementHandle();
  await page.getByRole('button', { name: '进入 Bangkok' }).click();
  await expect(page.locator('[data-page-id="world-city-home"]')).toBeVisible();
  expect(await canvas.evaluate((node, before) => node === before, handle)).toBe(true);
  expect(errors).toEqual([]);
});

test('Fragment Field search, Lens, Original Viewer and return stay coherent', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto('/#/world/fragments');
  await page.locator('[data-field-search]').fill('Common Grounds');
  await expect(page.locator('[data-field-node][data-relevance="focused"]')).toHaveCount(4);
  await page.locator('[data-field-node][data-relevance="focused"]').first().click();
  await expect(page.locator('.fragment-lens')).toBeVisible();
  await page.getByRole('button', { name: '查看原件' }).click();
  await expect(page.locator('.original-viewer')).toBeVisible();
  await page.getByRole('button', { name: '返回碎片镜头' }).click();
  await expect(page.locator('.fragment-lens')).toBeVisible();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.locator('[data-field-search]')).toHaveValue('Common Grounds');
  expect(errors).toEqual([]);
});

test('Else moves one Orb, forms a sourced answer and offers one next action', async ({ page }) => {
  await page.goto('/#/world/place/place-chao-phraya-ferry');
  await page.locator('[data-else-orb]').click();
  await expect(page.locator('[data-else-orb-slot] [data-else-orb]')).toHaveCount(1);
  await page.getByRole('button', { name: '哪些到访已确认？' }).click();
  await expect(page.locator('.else-drawer--found')).toBeVisible();
  await expect(page.locator('.else-sources button')).toHaveCount(3);
  await expect(page.locator('[data-else-next-action]')).toHaveCount(1);
  await expect(page.locator('[data-else-orb]')).toHaveCount(1);
});

test('Explore reforms between time, place and relation structures', async ({ page }) => {
  await page.goto('/#/world/city/bangkok/explore?view=time');
  await expect(page.locator('.time-explore')).toBeVisible();
  await page.getByRole('button', { name: '地点', exact: true }).click();
  await expect(page.locator('.place-explore')).toBeVisible();
  await page.getByRole('button', { name: '连接', exact: true }).click();
  await expect(page.locator('.connection-explore')).toBeVisible();
  await expect(page.locator('#memory-canvas')).toHaveCount(1);
});

test('share and delete tools expose privacy and impact before action', async ({ page }) => {
  await page.goto('/#/me/export');
  await page.getByRole('button', { name: '预览分享' }).click();
  await expect(page.locator('.share-preview')).toBeVisible();
  await expect(page.locator('.share-privacy input:checked')).toHaveCount(3);
  await page.getByRole('button', { name: '关闭分享预览', exact: true }).click();
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(page.locator('.delete-confirmation')).toBeVisible();
  await expect(page.locator('.delete-confirmation dl div')).toHaveCount(4);
});

test('route changes reset the persistent reading layer to the beginning of the new page', async ({ page }) => {
  await page.goto('/#/me/export');
  await page.locator('#page-content-layer').evaluate((layer) => layer.scrollTo(0, layer.scrollHeight));
  await page.getByRole('button', { name: '我', exact: true }).click();
  await expect(page.locator('[data-page-id="me-home"]')).toBeVisible();
  expect(await page.locator('#page-content-layer').evaluate((layer) => layer.scrollTop)).toBe(0);
});
