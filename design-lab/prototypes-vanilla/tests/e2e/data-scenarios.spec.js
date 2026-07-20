import { test, expect } from '@playwright/test';

async function waitForStable(page) {
  await page.waitForFunction(() => window.__ELSEWHERE_VISUAL_READY__ === true);
  await page.waitForFunction(() => Boolean(window.__ELSEWHERE_DEBUG__?.snapshot));
}

test('World Home is truthful and geometrically distinct for empty, current and dense data', async ({ page }, testInfo) => {
  await page.goto('/?__scenario=empty#/world');
  await waitForStable(page);
  await page.screenshot({ path: testInfo.outputPath('world-empty.png'), fullPage: false });
  const empty = await page.evaluate(() => ({
    hash: location.hash,
    state: document.querySelector('[data-page-id="world-home"]')?.dataset.worldState,
    anchors: document.querySelectorAll('[data-particle-anchor]').length,
    pins: document.querySelectorAll('[data-city-pin]').length,
    text: document.querySelector('[data-page-id="world-home"]')?.textContent,
    scene: window.__ELSEWHERE_DEBUG__.snapshot(),
  }));
  expect(empty.hash).toBe('#/world');
  expect(empty.state).toBe('empty');
  expect(empty.anchors).toBe(0);
  expect(empty.pins).toBe(0);
  expect(empty.text).toContain('放入第一批碎片');
  expect(empty.text).not.toMatch(/座城市|个碎片的私人数据库/);
  expect(empty.scene.particleState).toBe('initializing');

  await page.goto('/#/world');
  await waitForStable(page);
  await page.screenshot({ path: testInfo.outputPath('world-current.png'), fullPage: false });
  const current = await page.evaluate(() => ({
    state: document.querySelector('[data-page-id="world-home"]')?.dataset.worldState,
    anchors: document.querySelectorAll('[data-particle-anchor]').length,
    pins: document.querySelectorAll('[data-city-pin]').length,
    duplicateEarth: document.querySelectorAll('.globe-atmosphere').length,
    text: document.querySelector('[data-page-id="world-home"]')?.textContent,
    scene: window.__ELSEWHERE_DEBUG__.snapshot(),
  }));
  expect(current.state).toBe('populated');
  expect(current.anchors).toBe(1);
  expect(current.pins).toBe(3);
  expect(current.duplicateEarth).toBe(0);
  expect(current.text).toContain('172 个碎片');

  await page.goto('/?__scenario=dense#/world');
  await waitForStable(page);
  await page.screenshot({ path: testInfo.outputPath('world-dense.png'), fullPage: false });
  const dense = await page.evaluate(() => ({
    pins: document.querySelectorAll('[data-city-pin]').length,
    text: document.querySelector('[data-page-id="world-home"]')?.textContent,
    scene: window.__ELSEWHERE_DEBUG__.snapshot(),
  }));
  expect(dense.pins).toBe(4);
  expect(dense.text).toContain('72 个碎片');
  expect(dense.scene.dataSignature).not.toBe(current.scene.dataSignature);
  expect(dense.scene.activeParticleCount).not.toBe(empty.scene.activeParticleCount);
});

test('World Home stays inside both mobile viewports', async ({ page }) => {
  await page.goto('/#/world');
  await waitForStable(page);
  const layout = await page.evaluate(() => ({
    documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    layerOverflow: document.querySelector('#page-content-layer').scrollWidth - document.querySelector('#page-content-layer').clientWidth,
    elseCount: document.querySelectorAll('[data-else-orb]').length,
  }));
  expect(layout.documentOverflow).toBe(0);
  expect(layout.layerOverflow).toBe(0);
  expect(layout.elseCount).toBe(1);
});
