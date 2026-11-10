import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { layerSwitch } from './helpers';

const fixtures = join(import.meta.dirname, '..', 'tests', 'fixtures');
const canvas = (page: Page) => page.getByRole('img', { name: 'Wall photo' });
const view = (page: Page, name: string) =>
  page.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name });

/** Rendered canvas pixel at a fraction of the image (0–1). */
async function pixelAtFraction(page: Page, fx: number, fy: number) {
  const c = canvas(page);
  const [scale, tx, ty, iw, ih] = await Promise.all(
    ['data-scale', 'data-tx', 'data-ty', 'data-image-width', 'data-image-height'].map(async (a) =>
      Number(await c.getAttribute(a)),
    ),
  );
  const p = { x: fx * iw! * scale! + tx!, y: fy * ih! * scale! + ty! };
  return c.evaluate((el: HTMLCanvasElement, p) => {
    const dpr = window.devicePixelRatio || 1;
    const d = el
      .getContext('2d')!
      .getImageData(Math.round(p.x * dpr), Math.round(p.y * dpr), 1, 1).data;
    return [d[0]!, d[1]!, d[2]!];
  }, p);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/#/studio');
  await page.getByLabel('Choose file').setInputFiles(join(fixtures, 'wall-landscape.jpg'));
  await expect(page.getByRole('status')).toHaveText('Tap a hold to add it to your route.');
});

test('Depth view shows the viridis heatmap with a legend (far = purple, near = yellow)', async ({
  page,
}) => {
  await view(page, 'Depth').check();
  await expect(page.getByText('Depth is relative, not to scale.')).toBeVisible();
  // The fake depth is a left→right ramp: left edge far, right edge near.
  await expect
    .poll(
      async () =>
        (await pixelAtFraction(page, 0.02, 0.02))[2]! >
        (await pixelAtFraction(page, 0.02, 0.02))[1]!,
    )
    .toBe(true); // purple: more blue than green
  const right = await pixelAtFraction(page, 0.98, 0.02);
  expect(right[0]).toBeGreaterThan(200); // yellow
  expect(right[1]).toBeGreaterThan(200);
});

test('taps in Depth view add nothing and point back to Original', async ({ page }) => {
  await view(page, 'Depth').check();
  const box = (await canvas(page).boundingBox())!;
  await canvas(page).click({ position: { x: box.width / 2, y: 10 } });
  await expect(page.locator('.selection-status')).toHaveText('Switch to Original to add holds.');
  await expect(canvas(page)).toHaveAttribute('data-hold-count', '0');
});

test('after the trigger, each hold row shows its force cue (no facing text) and the Arrows switch works', async ({
  page,
}) => {
  const box = (await canvas(page).boundingBox())!;
  const holds = (
    await import('../tests/fixtures/wall-landscape.holds.json', { with: { type: 'json' } })
  ).default as {
    x: number;
    y: number;
  }[];
  const [scale, tx, ty] = await Promise.all(
    ['data-scale', 'data-tx', 'data-ty'].map(async (a) =>
      Number(await canvas(page).getAttribute(a)),
    ),
  );
  const h = holds[0]!;
  await canvas(page).click({
    position: { x: h.x * (1536 / 1600) * scale! + tx!, y: h.y * (1536 / 1600) * scale! + ty! },
  });
  await expect(canvas(page)).toHaveAttribute('data-hold-count', '1');
  expect(box.width).toBeGreaterThan(0);
  await view(page, 'Route').check();
  // The fake depth ramp tilts the hold and the wall alike, so the hold type decides the force.
  const row = page.getByRole('group', { name: 'Hold 1' });
  await row.getByRole('combobox', { name: 'Hold type' }).selectOption('crimp');
  await expect(row).toContainText('Pull down; keep your elbow under the edge');
  await expect(row).not.toContainText('Faces');
  const arrows = await layerSwitch(page, 'Arrows');
  await expect(arrows).toBeChecked();
  await arrows.uncheck();
  await expect(arrows).not.toBeChecked();
});
