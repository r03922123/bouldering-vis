import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { tapFixture } from './helpers';

const fixtures = join(import.meta.dirname, '..', 'tests', 'fixtures');
const holds = JSON.parse(readFileSync(join(fixtures, 'wall-landscape.holds.json'), 'utf8')) as {
  x: number;
  y: number;
}[];
const view = (page: Page, name: string) =>
  page.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name });
const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('the whole journey runs without console errors or horizontal scroll', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/#/studio');
  await page.getByLabel('Choose file').setInputFiles(join(fixtures, 'wall-landscape.jpg'));
  await expect(page.locator('.selection-status')).toHaveText('Tap a hold to add it to your route.');
  for (const [i, h] of holds.slice(0, 3).entries()) {
    await tapFixture(page, h.x, h.y);
    await expect(page.getByRole('img', { name: 'Wall photo' })).toHaveAttribute(
      'data-hold-count',
      String(i + 1),
    );
  }
  await page.getByRole('group', { name: 'Hold 1' }).getByRole('radio', { name: 'Start' }).check();
  await page.getByRole('group', { name: 'Hold 3' }).getByRole('radio', { name: 'Finish' }).check();
  await expect(page.getByText('Route ready')).toBeVisible();
  expect(await overflow(page)).toBe(0);

  await page.getByRole('button', { name: 'Show route' }).click();
  await expect(
    page.getByRole('group', { name: 'Hold 1' }).getByRole('combobox', { name: 'Hold type' }),
  ).toBeVisible();
  expect(await overflow(page)).toBe(0);

  await view(page, 'Depth').check();
  await expect(page.getByText('Depth is relative, not to scale.')).toBeVisible();
  expect(await overflow(page)).toBe(0);

  await view(page, '3D').check();
  await expect
    .poll(async () =>
      Number(
        await page
          .getByRole('img', { name: '3D point cloud of the wall' })
          .getAttribute('data-point-count'),
      ),
    )
    .toBeGreaterThan(0);
  expect(await overflow(page)).toBe(0);

  await view(page, 'Original').check();
  await expect(page.getByRole('img', { name: 'Wall photo' })).toHaveAttribute(
    'data-hold-count',
    '3',
  );
  expect(errors).toEqual([]);
});
