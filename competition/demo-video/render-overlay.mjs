import playwright from '../../design-lab/prototypes-vanilla/node_modules/@playwright/test/index.js';
import { pathToFileURL } from 'node:url';

const { chromium } = playwright;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(pathToFileURL(new URL('localization-overlay.svg', import.meta.url).pathname).href);
await page.screenshot({
  path: new URL('localization-overlay.png', import.meta.url).pathname,
  omitBackground: true,
});
await browser.close();
