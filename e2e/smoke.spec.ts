import { expect, test } from '@playwright/test';

test('app shell renders without horizontal scroll', async ({ page }) => {
  await page.goto('/#/studio');
  await expect(page.getByRole('heading', { level: 1, name: 'Bouldering Vis' })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test('page is cross-origin isolated (needed for multithreaded WASM)', async ({ page }) => {
  await page.goto('/#/studio');
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
});
