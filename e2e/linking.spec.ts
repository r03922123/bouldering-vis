import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { tapFixture, toScreen } from './helpers';

const fixtures = join(import.meta.dirname, '..', 'tests', 'fixtures');
const holds = JSON.parse(readFileSync(join(fixtures, 'wall-landscape.holds.json'), 'utf8')) as {
  x: number;
  y: number;
}[];

test.use({ viewport: { width: 1280, height: 800 } });

test('hovering a list row highlights its hold on the wall, and hovering the hold highlights the row', async ({
  page,
}) => {
  await page.goto('/#/studio');
  await page.getByLabel('Choose file').setInputFiles(join(fixtures, 'wall-landscape.jpg'));
  await expect(page.locator('.selection-status')).toHaveText('Tap a hold to add it to your route.');
  const wall = page.getByRole('img', { name: 'Wall photo' });
  for (const [i, h] of holds.slice(0, 3).entries()) {
    await tapFixture(page, h.x, h.y);
    await expect(wall).toHaveAttribute('data-hold-count', String(i + 1));
  }
  const row2 = page.getByRole('group', { name: 'Hold 2', exact: true });
  await row2.hover();
  const id = await wall.getAttribute('data-focused-hold');
  expect(id).toBeTruthy();
  await expect(page.locator('li[data-focused="true"]')).toHaveCount(1);

  // Hover the third hold on the wall: its row becomes the focused one.
  const p = await toScreen(page, holds[2]!.x, holds[2]!.y);
  const box = (await wall.boundingBox())!;
  await page.mouse.move(box.x + p.x, box.y + p.y);
  await expect(page.locator('li[data-focused="true"]')).toContainText('3');
  expect(await wall.getAttribute('data-focused-hold')).not.toBe(id);
});

test.describe('narrow window with a mouse', () => {
  test.use({ viewport: { width: 700, height: 800 } });
  test('hovering a hold on the wall never scrolls the page', async ({ page }) => {
    await page.goto('/#/studio');
    await page.getByLabel('Choose file').setInputFiles(join(fixtures, 'wall-landscape.jpg'));
    await expect(page.locator('.selection-status')).toHaveText(
      'Tap a hold to add it to your route.',
    );
    const wall = page.getByRole('img', { name: 'Wall photo' });
    for (const [i, h] of holds.slice(0, 6).entries()) {
      await tapFixture(page, h.x, h.y);
      await expect(wall).toHaveAttribute('data-hold-count', String(i + 1));
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    const p = await toScreen(page, holds[5]!.x, holds[5]!.y);
    const box = (await wall.boundingBox())!;
    await page.mouse.move(box.x + p.x, box.y + p.y);
    await expect(page.locator('li[data-focused="true"]')).toHaveCount(1);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
});
