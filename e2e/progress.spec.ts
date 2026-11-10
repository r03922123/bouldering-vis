import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { tapFixture } from './helpers';

// The route progress strip (Cairn review I3): the player always sees which step they are on.

const fixtures = join(import.meta.dirname, '..', 'tests', 'fixtures');
const holds = JSON.parse(readFileSync(join(fixtures, 'wall-landscape.holds.json'), 'utf8')) as {
  x: number;
  y: number;
}[];
const steps = (page: Page) => page.getByRole('navigation', { name: 'Route progress' });
const step = (page: Page, n: number) =>
  steps(page)
    .getByRole('listitem')
    .nth(n - 1);
const row = (page: Page, n: number) => page.getByRole('group', { name: `Hold ${n}`, exact: true });

test.beforeEach(async ({ page }) => {
  await page.goto('/#/studio');
  await page.getByLabel('Choose file').setInputFiles(join(fixtures, 'wall-landscape.jpg'));
  await expect(page.locator('.selection-status')).toHaveText('Tap a hold to add it to your route.');
});

test('the strip walks the player from picking holds to showing the route', async ({ page }) => {
  await expect(step(page, 1)).toHaveAttribute('aria-current', 'step');
  await expect(step(page, 1)).toContainText('Tap holds on the wall');

  for (const [i, h] of holds.slice(0, 3).entries()) {
    await tapFixture(page, h.x, h.y);
    await expect(page.getByRole('img', { name: 'Wall photo' })).toHaveAttribute(
      'data-hold-count',
      String(i + 1),
    );
  }
  await expect(step(page, 2)).toHaveAttribute('aria-current', 'step');
  await expect(step(page, 2)).toContainText('start 0 of 1–2 · finish 0 of 1');

  await row(page, 1).getByRole('radio', { name: 'Start' }).check();
  await row(page, 3).getByRole('radio', { name: 'Finish' }).check();
  // The moment: announced once, and the badges on the wall pulse.
  await expect(steps(page).locator('.route-moment')).toHaveText('Route set: 3 holds');
  await expect(page.getByRole('img', { name: 'Wall photo' })).toHaveAttribute('data-pulse', /.+/);
  await expect(step(page, 2)).toContainText('Route ready');
  await expect(step(page, 3)).toHaveAttribute('aria-current', 'step');

  await page.getByRole('button', { name: 'Show route' }).click();
  await expect(step(page, 3)).toHaveAttribute('data-state', 'done');
  await expect(step(page, 3)).toContainText('Shown');
});

test('the strip fits a 375px screen without horizontal scroll', async ({ page }) => {
  await expect(steps(page)).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});
