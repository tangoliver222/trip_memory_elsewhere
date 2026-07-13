import { readdir, readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from '@playwright/test';

test('compose the all-route visual audit sheet', async ({ page }) => {
  test.skip(process.env.GENERATE_CONTACT_SHEET !== '1', 'Contact sheets are generated explicitly after route captures.');
  const source = resolve(process.cwd(), 'artifacts/screenshots/all-pages/mobile-390');
  const files = (await readdir(source)).filter((file) => file.endsWith('.png')).sort();
  const cards = await Promise.all(files.map(async (file) => {
    const data = await readFile(resolve(source, file), 'base64');
    return `<figure><figcaption>${file.replace('.png', '')}</figcaption><img src="data:image/png;base64,${data}" alt=""></figure>`;
  }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setContent(`<style>
    *{box-sizing:border-box}body{margin:0;padding:24px;background:#050607;color:#e8e8e3;font:14px -apple-system,sans-serif}
    h1{margin:0 0 20px;font:38px Georgia,serif}main{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;align-items:start}
    figure{margin:0;padding:10px;border:1px solid #303536;border-radius:12px;background:#0b0e0f}figcaption{height:28px;color:#c9a864;font-size:12px}
    img{display:block;width:100%;height:auto;border-radius:6px;background:#000}
  </style><h1>Elsewhere · 全路由视觉验收</h1><main>${cards.join('')}</main>`);
  const output = resolve(process.cwd(), 'artifacts/contact-sheets');
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: resolve(output, 'all-pages-mobile-390.png'), fullPage: true });
});
