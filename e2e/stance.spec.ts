import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { tapFixture } from './helpers';

// SPEC-climber-stance AC 13–16: the climber on the start position, on desktop and on a phone.

const fixtures = join(import.meta.dirname, '..', 'tests', 'fixtures');
const holds = JSON.parse(readFileSync(join(fixtures, 'wall-landscape.holds.json'), 'utf8')) as {
  x: number;
  y: number;
}[];
const row = (page: Page, n: number) => page.getByRole('group', { name: `Hold ${n}`, exact: true });
const panel = (page: Page) => page.getByRole('region', { name: 'Climber' });
const stage = (page: Page) => page.getByRole('region', { name: 'Wall' });

/** Hold 1 = start (a green hold mid-wall), hold 2 = a foothold below it, hold 3 = finish. */
async function routeWithAFoot(page: Page) {
  for (const [i, h] of [holds[3]!, holds[0]!, holds[2]!].entries()) {
    await tapFixture(page, h.x, h.y);
    await expect(page.getByRole('img', { name: 'Wall photo' })).toHaveAttribute(
      'data-hold-count',
      String(i + 1),
    );
  }
  await row(page, 1).getByRole('radio', { name: 'Start' }).check();
  await row(page, 3).getByRole('radio', { name: 'Finish' }).check();
}

const shares = async (page: Page) =>
  (await panel(page).locator('.stance-pct').allTextContents()).map((t) => parseInt(t));

test.beforeEach(async ({ page }) => {
  await page.goto('/#/studio');
  await page.getByLabel('Choose file').setInputFiles(join(fixtures, 'wall-landscape.jpg'));
  await expect(page.locator('.selection-status')).toHaveText('Tap a hold to add it to your route.');
});

test('Try the start position draws a climber whose weight shares add up to 100 %', async ({
  page,
}) => {
  await routeWithAFoot(page);
  await panel(page).getByRole('button', { name: 'Try the start position' }).click();
  await expect(stage(page)).toHaveAttribute('data-climber', 'shown');
  await expect(panel(page).locator('.stance-status')).not.toHaveText(/Working/);
  await expect(panel(page).getByRole('combobox', { name: 'Left hand hold' })).toHaveValue(/.+/);
  await expect(panel(page).getByRole('combobox', { name: 'Left foot hold' })).not.toHaveValue('');
  const s = await shares(page);
  expect(s.length).toBeGreaterThan(0);
  expect(s.reduce((a, b) => a + b, 0)).toBe(100);
});

test('changing a limb or the wall updates the climber, and the switch hides it', async ({
  page,
}) => {
  await routeWithAFoot(page);
  await panel(page).getByRole('button', { name: 'Try the start position' }).click();
  await expect(panel(page).locator('.stance-status')).not.toHaveText(/Working/);
  const status = panel(page).locator('.stance-status');
  const readout = async () => `${await status.textContent()} ${(await shares(page)).join(',')}`;

  // Smearing the left foot instead of standing on hold 2 changes the shares.
  const before = await readout();
  await panel(page).getByRole('combobox', { name: 'Left foot hold' }).selectOption('wall');
  await expect.poll(readout).not.toBe(before);

  // A steeper wall changes the verdict or the shares.
  const vertical = await readout();
  await panel(page).getByRole('combobox', { name: 'Wall' }).selectOption('45');
  await expect.poll(readout).not.toBe(vertical);

  // Taking a foot off the wall: no share for it.
  await panel(page).getByRole('combobox', { name: 'Right foot hold' }).selectOption('');
  await expect(panel(page).locator('tr[data-limb="rf"] .stance-share')).toHaveText('—');

  await page.locator('.layers summary').click();
  await page.getByRole('switch', { name: 'Climber' }).uncheck();
  await expect(stage(page)).not.toHaveAttribute('data-climber', 'shown');
});

test('removing a hold takes its limb off it', async ({ page }) => {
  await routeWithAFoot(page);
  await panel(page).getByRole('button', { name: 'Try the start position' }).click();
  const leftFoot = panel(page).getByRole('combobox', { name: 'Left foot hold' });
  await expect(leftFoot.locator('option:checked')).toHaveText('Hold 2');
  await page.getByRole('button', { name: 'Remove hold 2' }).click();
  await expect(leftFoot.locator('option:checked')).not.toHaveText(/^Hold/);
});

test('a new photo resets the climber', async ({ page }) => {
  await routeWithAFoot(page);
  await panel(page).getByRole('button', { name: 'Try the start position' }).click();
  await expect(stage(page)).toHaveAttribute('data-climber', 'shown');
  await page.getByRole('button', { name: 'Change photo' }).click();
  await page.getByLabel('Choose file').setInputFiles(join(fixtures, 'wall-landscape.jpg'));
  await page.getByRole('button', { name: 'Replace photo' }).click();
  await expect(stage(page)).not.toHaveAttribute('data-climber', 'shown');
  await expect(panel(page).getByRole('button', { name: 'Try the start position' })).toBeDisabled();
});

test('the climber panel fits the screen without horizontal scroll', async ({ page }) => {
  await routeWithAFoot(page);
  await panel(page).getByRole('button', { name: 'Try the start position' }).click();
  await expect(panel(page).locator('.stance-status')).not.toHaveText(/Working/);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test('the climber also stands in front of the wall in 3D', async ({ page }) => {
  await routeWithAFoot(page);
  await panel(page).getByRole('button', { name: 'Try the start position' }).click();
  await expect(stage(page)).toHaveAttribute('data-climber', 'shown');
  await page.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name: '3D' }).check();
  const cloud = page.getByRole('img', { name: '3D point cloud of the wall' });
  await expect(cloud).toHaveAttribute('data-climber', 'shown');
  await page.locator('.layers summary').click();
  await page.getByRole('switch', { name: 'Climber' }).uncheck();
  await expect(cloud).not.toHaveAttribute('data-climber', 'shown');
});

// SPEC-climber-stance Amendment 2026-11-04 (R1), AC 52: feet cut rest the hips on the wall, and a
// foot on a route hold can hook it.
test('feet cut show the body on the wall; a foot on a route hold can heel-hook it', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await routeWithAFoot(page);
  await panel(page).getByRole('button', { name: 'Try the start position' }).click();
  const status = panel(page).locator('.stance-status');
  await expect(status).not.toHaveText(/Working/);
  // The user's type wins over the classifier, whenever it answers: a jug start can be hung from.
  const start = row(page, 1).getByRole('combobox', { name: 'Hold type' });
  await start.selectOption('jug');
  await expect(row(page, 1).locator('strong.hold-type')).toHaveText('Jug');

  for (const foot of ['Left foot', 'Right foot']) {
    await panel(page)
      .getByRole('combobox', { name: `${foot} hold` })
      .selectOption('');
  }
  await expect(status).toHaveText('Balanced: this position can be held');
  await expect(panel(page).locator('tr[data-limb="body"]')).toContainText('Body on the wall');
  expect((await shares(page)).reduce((a, b) => a + b, 0)).toBe(100);

  // Hold 2 is a picked route hold below the start.
  await panel(page)
    .getByRole('combobox', { name: 'Left foot hold' })
    .selectOption({ label: 'Hold 2' });
  await expect(panel(page).locator('tr[data-limb="body"]')).toHaveCount(0);
  // On a steep wall a heel hook changes how the weight is shared (on Vertical it may not).
  await panel(page).getByRole('combobox', { name: 'Wall' }).selectOption('35');
  await expect(status).toHaveText('Balanced: this position can be held');
  const standing = (await shares(page)).join(',');
  const hook = panel(page).getByRole('combobox', { name: 'Left foot hook' });
  await hook.selectOption('heel');
  await expect(hook).toHaveValue('heel');
  await expect.poll(async () => (await shares(page)).join(',')).not.toBe(standing);
  await expect(status).not.toHaveText(/Working/);
  await expect(panel(page).getByRole('combobox', { name: 'Right foot hook' })).toHaveCount(0);
  expect(errors).toEqual([]);
});
