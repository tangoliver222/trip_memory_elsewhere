import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';

test.use({ video: 'on' });
test.skip(process.env.CAPTURE_FINAL_VIDEOS !== '1', 'Signature videos are recorded explicitly for the final audit.');

async function saveVideo(page, name) {
  const video = page.video();
  const output = resolve(process.cwd(), 'artifacts/videos');
  await mkdir(output, { recursive: true });
  await page.close();
  await video?.saveAs(resolve(output, `${name}.webm`));
}

test('globe interaction and World to City reformation', async ({ page }) => {
  await page.goto('/#/world');
  await page.waitForTimeout(4300);
  const box = await page.locator('#memory-canvas').boundingBox();
  await page.mouse.move(box.x + box.width * .5, box.y + box.height * .52);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .68, box.y + box.height * .45, { steps: 18 });
  await page.mouse.up();
  await page.getByRole('button', { name: '进入 Bangkok' }).click();
  await expect(page.locator('[data-page-id="world-city-home"]')).toBeVisible();
  await page.waitForTimeout(2700);
  await saveVideo(page, '01-globe-to-city');
});

test('Fragment Field search focus Lens and spatial return', async ({ page }) => {
  await page.goto('/#/world/fragments');
  await page.waitForTimeout(1400);
  await page.locator('[data-field-search]').fill('Common Grounds');
  await page.waitForTimeout(1500);
  await page.locator('[data-field-node][data-relevance="focused"]').first().click();
  await expect(page.locator('.fragment-lens')).toBeVisible();
  await page.waitForTimeout(1100);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.waitForTimeout(900);
  await saveVideo(page, '02-field-search-lens-return');
});

test('Discovery evidence grows into a shared entity and title', async ({ page }) => {
  await page.goto('/#/discover/disc-ari-mornings');
  await page.waitForTimeout(4400);
  await saveVideo(page, '03-discovery-growth');
});

test('Else reads sources and forms a found answer', async ({ page }) => {
  await page.goto('/#/world/place/place-chao-phraya-ferry');
  await page.waitForTimeout(900);
  await page.locator('[data-else-orb]').click();
  await page.getByRole('button', { name: '哪些到访已确认？' }).click();
  await expect(page.locator('.else-drawer--found')).toBeVisible();
  await page.waitForTimeout(1400);
  await saveVideo(page, '04-else-found');
});

test('Explore reforms the same memory world across three structures', async ({ page }) => {
  await page.goto('/#/world/city/bangkok/explore?view=time');
  await page.waitForTimeout(1300);
  await page.getByRole('button', { name: '地点', exact: true }).click();
  await page.waitForTimeout(1600);
  await page.getByRole('button', { name: '连接', exact: true }).click();
  await page.waitForTimeout(1700);
  await saveVideo(page, '05-explore-reformation');
});
