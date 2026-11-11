import { join } from 'node:path';
import { expect, test as base, type Page } from '@playwright/test';

export { expect } from '@playwright/test';

/**
 * The Play suite's test level, the synthetic route (ADR-0003 (e); beta-moves'
 * synthetic-route.test.ts). Each page here is served it in place of Wall 2's shipped level
 * (SPEC-launch-wall-2 R1), so the specs keep fixed moves and verdicts. The site never serves it;
 * e2e/wall2-top.spec.ts plays the shipped level itself.
 */
export const TEST_LEVEL = join(
  import.meta.dirname,
  '..',
  'tests',
  'fixtures',
  'synthetic-route.level.json',
);

/**
 * The synthetic wall the route is on: the level's points are in its 1536 × 1152 working frame, so
 * the pages here get it in place of Wall 2's photo.
 */
export const TEST_PHOTO = join(
  import.meta.dirname,
  '..',
  'tests',
  'fixtures',
  'wall-landscape.jpg',
);

/** Playwright's `test`, with Wall 2's level and photo answered from TEST_LEVEL and TEST_PHOTO. */
export const test = base.extend({
  // Named `provide`, not Playwright's usual `use`: the React hooks lint rule reads `use()` as a hook.
  page: async ({ page }, provide) => {
    await page.route('**/levels/wall-b.json', (route) => route.fulfill({ path: TEST_LEVEL }));
    await page.route('**/samples/wall-b.jpg', (route) => route.fulfill({ path: TEST_PHOTO }));
    await provide(page);
  },
});

const stage = (page: Page) => page.getByRole('region', { name: 'Wall' });

/** Wall 2 (the test level) from `/`: a baked level opens on the tray (SPEC-launch-wall-2 R7). */
export async function openTestWall(page: Page) {
  await page.goto('/');
  await expect(stage(page)).toHaveAttribute('data-verdict', /hold|fall/);
  await expect(stage(page)).toHaveAttribute('data-map', 'closed');
}

/** Then its direction map (E1), as a player opens it: "Check directions" (in ☰ on a phone). */
export async function openTestWallMap(page: Page) {
  await openTestWall(page);
  const drawer = page.getByRole('button', { name: 'Hints and tools' });
  if ((await drawer.count()) && (await drawer.getAttribute('aria-expanded')) !== 'true')
    await drawer.click();
  await page.getByRole('button', { name: 'Check directions' }).click();
  await expect(stage(page)).toHaveAttribute('data-map', 'check');
}
