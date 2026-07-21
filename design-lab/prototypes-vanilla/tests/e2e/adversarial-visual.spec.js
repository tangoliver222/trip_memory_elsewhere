import { test, expect } from '@playwright/test';

test.setTimeout(90_000);

async function waitUntilStable(page) {
  await page.waitForFunction(() => window.__ELSEWHERE_VISUAL_READY__ === true, null, { timeout: 20_000 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

test('Inbox keeps both originals and all three decisions in the initial mobile comparison', async ({ page }) => {
  await page.goto('/#/world/inbox');
  await waitUntilStable(page);

  const layout = await page.evaluate(() => {
    const navigation = document.querySelector('.app-navigation').getBoundingClientRect();
    const title = document.querySelector('.inbox-header h1');
    const sources = [...document.querySelectorAll('.review-source')].map((source) => source.getBoundingClientRect());
    const choices = [...document.querySelectorAll('[data-review-choice]')].map((choice) => choice.getBoundingClientRect());
    const pending = document.querySelector('.review-source--pending');
    return {
      titleFontSize: Number.parseFloat(getComputedStyle(title).fontSize),
      sourceCount: sources.length,
      sourcesShareRow: sources.length === 2 && Math.abs(sources[0].top - sources[1].top) <= 2,
      sourcesVisible: sources.every((rect) => rect.top >= 0 && rect.bottom <= navigation.top - 8),
      choiceCount: choices.length,
      choicesVisible: choices.every((rect) => rect.top >= 0 && rect.bottom <= navigation.top - 8),
      placeholderContent: pending ? getComputedStyle(pending, '::before').content : 'none',
    };
  });

  expect(layout.titleFontSize).toBeLessThanOrEqual(32);
  expect(layout.sourceCount).toBe(2);
  expect(layout.sourcesShareRow).toBe(true);
  expect(layout.sourcesVisible).toBe(true);
  expect(layout.choiceCount).toBe(3);
  expect(layout.choicesVisible).toBe(true);
  expect(layout.placeholderContent).toBe('none');
});

test('Discover Detail keeps the evidence field before the final conclusion in settled layout', async ({ page }) => {
  await page.goto('/#/discover/disc-ari-mornings');
  await waitUntilStable(page);

  const sequence = await page.evaluate(() => {
    const evidence = document.querySelector('[data-discovery-evidence]').getBoundingClientRect();
    const title = document.querySelector('.discovery-title-reveal').getBoundingClientRect();
    const firstOriginal = document.querySelector('.discovery-time-node').getBoundingClientRect();
    return {
      firstOriginalBeforeTitle: firstOriginal.top < title.top,
      evidenceBeforeTitle: evidence.bottom + 16 <= title.top,
    };
  });

  expect(sequence.firstOriginalBeforeTitle).toBe(true);
  expect(sequence.evidenceBeforeTitle).toBe(true);
});

test('Fragment Field keeps every initial mobile node bounded and renders artifact copy once', async ({ page }) => {
  await page.goto('/#/world/fragments');
  await waitUntilStable(page);

  const field = await page.evaluate(() => {
    const viewport = document.querySelector('[data-field-viewport]').getBoundingClientRect();
    const nodes = [...document.querySelectorAll('[data-field-node]')].map((node) => node.getBoundingClientRect());
    return {
      duplicateArtifactCaptions: document.querySelectorAll('.field-node:not(.field-node--photo) .field-node__label, .field-node:not(.field-node--photo) .field-node__type, .field-node:not(.field-node--photo) .field-node__provenance').length,
      clippedNodes: nodes.filter((rect) => rect.left < viewport.left + 6 || rect.right > viewport.right - 6).length,
    };
  });

  expect(field.duplicateArtifactCaptions).toBe(0);
  expect(field.clippedNodes).toBe(0);
});

test('Import receipt keeps its distribution geometry inside the mobile app viewport', async ({ page }) => {
  await page.goto('/#/world/inbox/receipt/batch-bangkok-backfill');
  await waitUntilStable(page);

  const receipt = await page.evaluate(() => {
    const app = document.querySelector('.app-viewport').getBoundingClientRect();
    const streams = [...document.querySelectorAll('.receipt-stream')].map((stream) => stream.getBoundingClientRect());
    const layer = document.querySelector('#page-content-layer');
    return {
      horizontalOverflow: layer.scrollWidth - layer.clientWidth,
      clippedStreams: streams.filter((rect) => rect.left < app.left || rect.right > app.right).length,
      overflowSources: [...document.querySelectorAll('[data-page-id="world-receipt"] *')]
        .map((element) => ({
          className: element.className,
          right: Math.round(element.getBoundingClientRect().right),
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
        }))
        .filter((item) => item.right > app.right + 1 || item.scrollWidth > item.clientWidth + 1)
        .slice(0, 12),
    };
  });

  expect(receipt.horizontalOverflow, JSON.stringify(receipt.overflowSources)).toBeLessThanOrEqual(1);
  expect(receipt.clippedStreams).toBe(0);
});
