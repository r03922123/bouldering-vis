import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { tapFixture } from './helpers';

// Pro review: status lines appearing above the photo pushed it down mid-tap, so a tap landed on
// the ceiling. The wall photo must stay put while models download and depth runs.
const fixtures = join(import.meta.dirname, '..', 'tests', 'fixtures');
const holds = JSON.parse(readFileSync(join(fixtures, 'wall-landscape.holds.json'), 'utf8')) as {
  x: number;
  y: number;
}[];

test('the wall photo does not move while holds are picked and the route is shown', async ({
  page,
}) => {
  await page.goto('/#/studio');
  await page.getByLabel('Choose file').setInputFiles(join(fixtures, 'wall-landscape.jpg'));
  await expect(page.locator('.selection-status')).toHaveText('Tap a hold to add it to your route.');
  const photo = page.getByRole('img', { name: 'Wall photo' });
  const top = async () => (await photo.boundingBox())!.y;
  const start = await top();
  for (const [i, h] of holds.slice(0, 3).entries()) {
    await tapFixture(page, h.x, h.y);
    await expect(photo).toHaveAttribute('data-hold-count', String(i + 1));
    expect(await top()).toBeCloseTo(start, 0);
  }
  await page.getByRole('button', { name: 'Show route' }).click();
  await page.waitForTimeout(500);
  expect(await top()).toBeCloseTo(start, 0);
});

test('status lines float over the photo and let taps through', async ({ page }) => {
  await page.goto('/#/studio');
  await page.getByLabel('Choose file').setInputFiles(join(fixtures, 'wall-landscape.jpg'));
  await expect(page.locator('.selection-status')).toHaveText('Tap a hold to add it to your route.');
  const overlay = page.locator('.stage-status');
  await expect(overlay).toHaveCSS('position', 'absolute');
  await expect(overlay).toHaveCSS('pointer-events', 'none');
});
