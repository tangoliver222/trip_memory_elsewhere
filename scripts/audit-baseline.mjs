import { chromium } from '/Users/tangyixuan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const outputDir = new URL('../artifacts/baseline/', import.meta.url);
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});

const targets = [
  ['canonical', 'http://127.0.0.1:4173/design-lab/prototypes-vanilla/index.html#/world'],
  ['legacy', 'http://127.0.0.1:4173/design-lab/elsewhere-frontend-v1/index.html#/world'],
];

const report = {};

for (const [name, url] of targets) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const messages = [];

  page.on('console', (message) => messages.push({ type: `console:${message.type()}`, text: message.text() }));
  page.on('pageerror', (error) => messages.push({ type: 'pageerror', text: error.message }));
  page.on('requestfailed', (request) => messages.push({
    type: 'requestfailed',
    text: `${request.url()} — ${request.failure()?.errorText ?? 'unknown'}`,
  }));

  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 }).catch((error) => {
    messages.push({ type: 'navigation', text: error.message });
  });
  await page.screenshot({ path: fileURLToPath(new URL(`${name}-390x844.png`, outputDir)), fullPage: true });

  report[name] = {
    url: page.url(),
    title: await page.title(),
    appRootChildren: await page.locator('#app-root').count()
      ? await page.locator('#app-root').evaluate((node) => node.childElementCount)
      : null,
    metrics: await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
    })),
    messages,
  };

  await context.close();
}

await writeFile(new URL('report.json', outputDir), `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(report, null, 2));
