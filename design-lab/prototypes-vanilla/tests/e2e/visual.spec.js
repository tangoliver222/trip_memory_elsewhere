import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';

const captures = [
  // ── Onboarding (5) ──
  ['onboarding-intro', '#/onboarding', 600],
  ['onboarding-permissions', '#/onboarding/permissions', 600],
  ['onboarding-first-import', '#/onboarding/first-import', 600],
  ['onboarding-processing', '#/onboarding/processing', 600],
  ['onboarding-first-connection', '#/onboarding/first-connection', 800],

  // ── World (8) ──
  ['world', '#/world', 4500],
  ['world-cities', '#/world/cities', 1000],
  ['world-city-home', '#/world/city/bangkok', 2000],
  ['fragment-field', '#/world/fragments', 1800],
  ['world-import', '#/world/import', 1000],
  ['world-receipt', '#/world/inbox/receipt/batch-bangkok-backfill', 1000],
  ['world-inbox', '#/world/inbox', 1200],
  ['world-capsule', '#/world/city/bangkok/capsule', 1800],

  // ── Explore (3 views) ──
  ['world-explore-time', '#/world/city/bangkok/explore?view=time', 1400],
  ['world-explore-place', '#/world/city/bangkok/explore?view=place', 1400],
  ['world-explore-connection', '#/world/city/bangkok/explore?view=connection', 1400],

  // ── Detail (3) ──
  ['world-scene-detail', '#/world/scene/scene-common-grounds-morning', 1400],
  ['world-place-detail', '#/world/place/place-common-grounds', 1400],
  ['world-connection-detail', '#/world/connection/rel-river-ticket-photo', 1400],

  // ── Discover (2) ──
  ['discover-home', '#/discover', 1400],
  ['discover-detail', '#/discover/disc-ari-mornings', 3500],

  // ── Me (7) ──
  ['me-home', '#/me', 800],
  ['me-writing', '#/me/writing', 800],
  ['me-writing-detail', '#/me/writing/writing-city-reflection', 800],
  ['me-privacy', '#/me/privacy', 800],
  ['me-preferences', '#/me/preferences', 800],
  ['me-storage', '#/me/storage', 800],
  ['me-export', '#/me/export', 800],
];

test('capture comprehensive page screenshots', async ({ page }, testInfo) => {
  test.skip(!['mobile-390', 'mobile-430'].includes(testInfo.project.name), 'Screenshots are mobile-specific.');
  test.setTimeout(240_000);

  const visualPass = process.env.VISUAL_PASS || 'pass-1';
  const output = resolve(process.cwd(), `artifacts/screenshots/${visualPass}`, testInfo.project.name);
  await mkdir(output, { recursive: true });

  for (const [name, path, wait] of captures) {
    await page.goto(path);
    await expect(page.locator('[data-page-id]')).toBeVisible();
    await page.waitForTimeout(wait);
    await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: true });
  }
});
