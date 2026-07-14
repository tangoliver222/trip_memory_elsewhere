import { chromium } from '@playwright/test';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await page.goto('http://127.0.0.1:5199/#/world/city/bangkok', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ELSEWHERE_VISUAL_READY__ === true, undefined, { timeout: 15000 });
const data = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('.city-cluster').forEach((cluster) => {
    const cr = cluster.getBoundingClientRect();
    out.push({ cluster: cluster.className, rect: [cr.left, cr.top, cr.width, cr.height].map(Math.round) });
    cluster.querySelectorAll('.city-tile, .city-cluster__name').forEach((el) => {
      const r = el.getBoundingClientRect();
      out.push({ el: el.className.split(' ').slice(0,3).join(' '), rect: [r.left, r.top, r.width, r.height].map(Math.round), label: el.getAttribute('aria-label') || el.textContent.slice(0, 18) });
    });
  });
  return out;
});
console.log(JSON.stringify(data, null, 1));
await browser.close();
