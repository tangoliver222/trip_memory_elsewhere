#!/usr/bin/env node
/**
 * 视觉 pass 截图工具。
 * 用法：node scripts/shoot.mjs <pass 目录> [route 名过滤...] [--scroll]
 * 等待 window.__ELSEWHERE_VISUAL_READY__ 后截图，输出到
 * artifacts/screenshots/<pass>/mobile-390/<name>.png
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.SHOOT_BASE || 'http://127.0.0.1:5199';

const ROUTES = [
  ['world-home', '/#/world'],
  ['world-cities', '/#/world/cities'],
  ['world-city-home', '/#/world/city/bangkok'],
  ['world-fragments', '/#/world/fragments'],
  ['world-import', '/#/world/import'],
  ['world-receipt', '/#/world/inbox/receipt/batch-bangkok-backfill'],
  ['world-inbox', '/#/world/inbox'],
  ['world-capsule', '/#/world/city/bangkok/capsule'],
  ['explore-time', '/#/world/city/bangkok/explore?view=time'],
  ['explore-place', '/#/world/city/bangkok/explore?view=place'],
  ['explore-connection', '/#/world/city/bangkok/explore?view=connection'],
  ['scene-detail', '/#/world/scene/scene-common-grounds-1016'],
  ['place-detail', '/#/world/place/place-common-grounds'],
  ['connection-detail', '/#/world/connection/rel-river-ticket-photo'],
  ['discover-home', '/#/discover'],
  ['discover-detail', '/#/discover/disc-ari-mornings'],
  ['onboarding-intro', '/#/onboarding'],
  ['onboarding-permissions', '/#/onboarding/permissions'],
  ['onboarding-first-import', '/#/onboarding/first-import'],
  ['onboarding-processing', '/#/onboarding/processing'],
  ['onboarding-first-connection', '/#/onboarding/first-connection'],
  ['me-home', '/#/me'],
  ['me-writing', '/#/me/writing'],
  ['me-privacy', '/#/me/privacy'],
  ['me-storage', '/#/me/storage'],
  ['me-export', '/#/me/export'],
  ['me-preferences', '/#/me/preferences'],
];

const args = process.argv.slice(2);
const pass = args[0] || 'pass-0';
const wantScroll = args.includes('--scroll');
const filters = args.slice(1).filter((value) => value !== '--scroll');
const selected = filters.length ? ROUTES.filter(([name]) => filters.includes(name)) : ROUTES;

const outDir = `artifacts/screenshots/${pass}/mobile-390`;
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});

for (const [name, path] of selected) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForFunction(() => window.__ELSEWHERE_VISUAL_READY__ === true, undefined, { timeout: 15000 });
  } catch {
    errors.push(`visual-ready timeout: ${name}`);
  }
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  if (wantScroll) {
    const scrollable = await page.evaluate(() => {
      const layer = document.querySelector('#page-content-layer');
      if (!layer || layer.scrollHeight <= layer.clientHeight + 40) return false;
      layer.scrollTo({ top: layer.scrollHeight, behavior: 'instant' });
      return true;
    });
    if (scrollable) {
      await page.waitForTimeout(450);
      await page.screenshot({ path: `${outDir}/${name}--end.png` });
    }
  }
  console.log(`shot ${name}`);
}

if (errors.length) {
  console.log('\n--- 页面错误 ---');
  errors.forEach((error) => console.log(error));
}
await browser.close();
process.exit(errors.some((e) => e.startsWith('pageerror')) ? 1 : 0);
