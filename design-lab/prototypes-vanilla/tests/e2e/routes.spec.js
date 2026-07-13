import { test, expect } from '@playwright/test';
import { ROUTE_CASES, collectPageErrors, expectHealthyPage } from './helpers.js';

for (const route of ROUTE_CASES) {
  test(`${route.name} has no runtime or viewport failures`, async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto(route.path);
    await expectHealthyPage(page, route);
    expect(errors).toEqual([]);
  });
}
