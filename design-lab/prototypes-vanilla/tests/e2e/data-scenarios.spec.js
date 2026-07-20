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
  const layout = await page.evaluate(() => {
    const lede = document.querySelector('.globe-lede')?.getBoundingClientRect();
    const visual = document.querySelector('[data-globe-visual]')?.getBoundingClientRect();
    const firstEntry = document.querySelector('.world-entry')?.getBoundingClientRect();
    return {
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      layerOverflow: document.querySelector('#page-content-layer').scrollWidth - document.querySelector('#page-content-layer').clientWidth,
      elseCount: document.querySelectorAll('[data-else-orb]').length,
      visualStartsAfterLede: Boolean(lede && visual && visual.top >= lede.bottom + 8),
      visualEndsBeforeEntry: Boolean(visual && firstEntry && visual.bottom <= firstEntry.top),
    };
  });
  expect(layout.documentOverflow).toBe(0);
  expect(layout.layerOverflow).toBe(0);
  expect(layout.elseCount).toBe(1);
  expect(layout.visualStartsAfterLede).toBe(true);
  expect(layout.visualEndsBeforeEntry).toBe(true);
});

test('City Home and Capsule derive visible anchors and density from each dataset', async ({ page }, testInfo) => {
  await page.goto('/?__scenario=empty#/world/city/bangkok');
  await waitForStable(page);
  const empty = await page.evaluate(() => ({
    title: document.querySelector('[data-page-id="world-city-home"]')?.textContent,
    anchors: document.querySelectorAll('[data-particle-anchor]').length,
    scene: window.__ELSEWHERE_DEBUG__.snapshot(),
  }));
  expect(empty.title).toContain('还没有形成城市记忆群');
  expect(empty.anchors).toBe(0);
  expect(empty.scene.activeParticleCount).toBeLessThan(200);

  await page.goto('/?__scenario=small#/world/city/bangkok');
  await waitForStable(page);
  await page.screenshot({ path: testInfo.outputPath('city-small.png'), fullPage: true });
  const small = await page.evaluate(() => ({
    text: document.querySelector('[data-page-id="world-city-home"]')?.textContent,
    anchors: document.querySelectorAll('.city-tile[data-particle-anchor]').length,
    scene: window.__ELSEWHERE_DEBUG__.snapshot(),
  }));
  expect(small.text).toContain('3 个碎片');
  expect(small.anchors).toBe(3);

  await page.goto('/?__scenario=dense#/world/city/bangkok');
  await waitForStable(page);
  await page.screenshot({ path: testInfo.outputPath('city-dense.png'), fullPage: true });
  const dense = await page.evaluate(() => ({
    text: document.querySelector('[data-page-id="world-city-home"]')?.textContent,
    anchors: document.querySelectorAll('.city-tile[data-particle-anchor]').length,
    scene: window.__ELSEWHERE_DEBUG__.snapshot(),
  }));
  expect(dense.text).toContain('18 个碎片');
  expect(dense.anchors).toBe(12);
  expect(dense.scene.dataSignature).not.toBe(small.scene.dataSignature);
  expect(dense.scene.activeParticleCount).toBeGreaterThan(small.scene.activeParticleCount);

  await page.goto('/?__scenario=small#/world/city/bangkok/capsule');
  await waitForStable(page);
  const capsuleSmall = await page.evaluate(() => ({
    originals: document.querySelectorAll('.capsule-spread [data-particle-anchor]').length,
    scene: window.__ELSEWHERE_DEBUG__.snapshot(),
  }));
  expect(capsuleSmall.originals).toBe(3);

  await page.goto('/?__scenario=dense#/world/city/bangkok/capsule');
  await waitForStable(page);
  const capsuleDense = await page.evaluate(() => ({
    originals: document.querySelectorAll('.capsule-spread [data-particle-anchor]').length,
    scene: window.__ELSEWHERE_DEBUG__.snapshot(),
  }));
  expect(capsuleDense.originals).toBe(12);
  expect(capsuleDense.scene.dataSignature).not.toBe(capsuleSmall.scene.dataSignature);
});

test('a city without evidence never renders another city data', async ({ page }) => {
  await page.goto('/#/world/city/tokyo/explore?view=time');
  await waitForStable(page);
  const result = await page.evaluate(() => ({
    text: document.querySelector('[data-page-id="world-explore"]')?.textContent,
    anchors: document.querySelectorAll('[data-particle-anchor]').length,
  }));
  expect(result.text).toContain('Tokyo 还没有可探索的时间结构');
  expect(result.text).not.toContain('河岸候船');
  expect(result.anchors).toBe(0);
});
