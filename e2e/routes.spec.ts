import { expect, test } from '@playwright/test';

// SPEC-game › Amendment (b) › The Studio inside the world: hash routes, with the gym at #/gym and
// the Studio as the Setting Room at #/studio. SPEC-launch-wall-2 R3: #/ opens Wall 2.

const studio = (page: import('@playwright/test').Page) =>
  page.getByRole('heading', { level: 1, name: 'Bouldering Vis' });
const gymStrip = (page: import('@playwright/test').Page) =>
  page.getByRole('navigation', { name: 'Gym' });
const wall2 = (page: import('@playwright/test').Page) =>
  page.getByRole('heading', { level: 1, name: 'Wall 2' });

test.beforeEach(async ({ page }) => {
  // Every test starts in the gym (no level question since SPEC-gym-hub Amendment 2026-11-02 W3).
  await page.goto('/#/gym');
});

test('the app opens on Wall 2, with no way to the gym and no model worker (R3, R5)', async ({
  page,
}) => {
  const workers: string[] = [];
  page.on('worker', (w) => workers.push(w.url()));
  await page.goto('/');
  await expect(wall2(page)).toBeVisible();
  // R5: a baked level needs no model, so opening the app starts no ML worker and no download.
  await expect(page.getByRole('region', { name: 'Wall' })).toHaveAttribute('data-verdict', 'hold');
  expect(workers).toEqual([]);
  await expect(page.getByRole('link', { name: 'Gym' })).toHaveCount(0);
  await expect(gymStrip(page)).toHaveCount(0);
});

test('the Setting Room opens at #/studio and links back to the gym', async ({ page }) => {
  await page.goto('/#/studio');
  await expect(studio(page)).toBeVisible();
  const gym = page.getByRole('link', { name: 'Gym' });
  await gym.click();
  await expect(page).toHaveURL(/#\/gym$/);
  await expect(gym).toBeHidden();
  await expect(studio(page)).toBeHidden();
  await expect(gymStrip(page)).toBeVisible();
});

test('back and forward move between the gym and the Setting Room', async ({ page }) => {
  await gymStrip(page).getByRole('button', { name: 'Setting Room' }).click();
  await expect(studio(page)).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/#\/gym$/);
  await expect(gymStrip(page)).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(/#\/studio$/);
  await expect(studio(page)).toBeVisible();
});

test('an unknown hash opens Wall 2, written back as its hash (C1, R3)', async ({ page }) => {
  await page.goto('/#/nowhere');
  await expect(wall2(page)).toBeVisible();
  await expect(studio(page)).toBeHidden();
  await expect(page).toHaveURL(/#\/wall\/wall-b$/);
});

test('an unknown wall opens Wall 2, never "Opening the wall…" forever (review finding 5, R3)', async ({
  page,
}) => {
  await page.goto('/#/wall/foo');
  await expect(wall2(page)).toBeVisible();
  await expect(page).toHaveURL(/#\/wall\/wall-b$/);
  await expect(page.getByText('Opening the wall…')).toHaveCount(0);
});
