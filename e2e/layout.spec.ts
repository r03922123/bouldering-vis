import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { tapFixture } from './helpers';

const fixtures = join(import.meta.dirname, '..', 'tests', 'fixtures');
const holds = JSON.parse(readFileSync(join(fixtures, 'wall-landscape.holds.json'), 'utf8')) as {
  x: number;
  y: number;
}[];
const wall = (page: Page) => page.getByRole('img', { name: 'Wall photo' });

async function pickSix(page: Page) {
  await page.goto('/#/studio');
  await page.getByLabel('Choose file').setInputFiles(join(fixtures, 'wall-landscape.jpg'));
  await expect(page.locator('.selection-status')).toHaveText('Tap a hold to add it to your route.');
  for (const [i, h] of holds.slice(0, 6).entries()) {
    await tapFixture(page, h.x, h.y);
    await expect(wall(page)).toHaveAttribute('data-hold-count', String(i + 1));
  }
  // Editing the last row would scroll a single-column page away from the wall.
  await page
    .getByRole('group', { name: 'Hold 6', exact: true })
    .getByRole('radio', { name: 'Finish' })
    .check();
}

/** The wall canvas is fully inside the viewport. */
async function wallInView(page: Page) {
  const b = (await wall(page).boundingBox())!;
  const vh = page.viewportSize()!.height;
  return b.y >= -1 && b.y + b.height <= vh + 1;
}

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test('the hold list is an inspector beside the wall, and the wall stays in view', async ({
    page,
  }) => {
    await pickSix(page);
    const w = (await wall(page).boundingBox())!;
    const list = (await page.getByRole('complementary', { name: 'Route' }).boundingBox())!;
    expect(list.x).toBeGreaterThanOrEqual(w.x + w.width - 1);
    expect(await wallInView(page)).toBe(true);
  });
});

test.describe('phone', () => {
  test.use({ viewport: { width: 375, height: 740 }, hasTouch: true });
  test('the wall stays pinned on top while the hold list scrolls', async ({ page }) => {
    await pickSix(page);
    expect(await wallInView(page)).toBe(true);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});

test.describe('phone controls', () => {
  test.use({ viewport: { width: 375, height: 740 }, hasTouch: true });
  test('the wall starts in the top third once a photo is loaded', async ({ page }) => {
    await page.goto('/#/studio');
    await page.getByLabel('Choose file').setInputFiles(join(fixtures, 'wall-landscape.jpg'));
    await expect(page.locator('.selection-status')).toHaveText(
      'Tap a hold to add it to your route.',
    );
    const top = (await wall(page).boundingBox())!.y;
    console.log(`wall top on a 375×740 phone: ${Math.round(top)} px`);
    expect(top).toBeLessThan(740 / 3);
  });
});
