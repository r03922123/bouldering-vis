import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { tapFixture } from './helpers';

const fixtures = join(import.meta.dirname, '..', 'tests', 'fixtures');
const holds = JSON.parse(readFileSync(join(fixtures, 'wall-landscape.holds.json'), 'utf8')) as {
  x: number;
  y: number;
}[];
const canvas = (page: Page) => page.getByRole('img', { name: 'Wall photo' });
const view = (page: Page, name: string) =>
  page.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name });

test.beforeEach(async ({ page }) => {
  await page.goto('/#/studio');
  await page.getByLabel('Choose file').setInputFiles(join(fixtures, 'wall-landscape.jpg'));
  await expect(page.locator('.selection-status')).toHaveText('Tap a hold to add it to your route.');
  for (const [i, h] of holds.slice(0, 2).entries()) {
    await tapFixture(page, h.x, h.y);
    await expect(canvas(page)).toHaveAttribute('data-hold-count', String(i + 1));
  }
});

test('hold cards appear only after the analysis starts, with a type and an explanation', async ({
  page,
}) => {
  const row = page.getByRole('group', { name: 'Hold 1' });
  await expect(row.getByRole('combobox', { name: 'Hold type' })).toHaveCount(0);
  await view(page, 'Route').check();
  await expect(row.getByRole('combobox', { name: 'Hold type' })).toBeVisible();
  await expect(row.locator('.hold-explain')).not.toBeEmpty();
  await expect(row.getByRole('img')).toHaveCount(0);
});

test('an override sticks across view switches', async ({ page }) => {
  await view(page, 'Route').check();
  const row = page.getByRole('group', { name: 'Hold 1' });
  await row.getByRole('combobox', { name: 'Hold type' }).selectOption('pocket');
  await expect(row.locator('strong.hold-type')).toHaveText('Pocket');
  await view(page, 'Depth').check();
  await view(page, 'Original').check();
  await expect(row.getByRole('combobox', { name: 'Hold type' })).toHaveValue('pocket');
  await expect(row.locator('.hold-explain')).toContainText('Fit one to three fingers in the hole');
});

test('the page still fits a 375px screen with hold cards open', async ({ page }) => {
  await view(page, 'Route').check();
  await expect(
    page.getByRole('group', { name: 'Hold 2' }).getByRole('combobox', { name: 'Hold type' }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test('Learn opens a card for the hold type; Esc closes it and focus returns', async ({ page }) => {
  await view(page, 'Route').check();
  const row = page.getByRole('group', { name: 'Hold 1' });
  const type = (await row.locator('strong.hold-type').textContent())!.replace('?', '');
  const learn = row.getByRole('button', { name: `Learn about ${type}` });
  await learn.click();
  const card = page.getByRole('dialog', { name: type });
  await expect(card).toContainText('Common mistake');
  await expect(card).toContainText('As a foothold');
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  await expect(learn).toBeFocused();
  // Still no sideways scroll at 375 px with the card open.
  await learn.click();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});
