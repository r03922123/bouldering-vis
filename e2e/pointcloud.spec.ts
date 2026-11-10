import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { tapFixture, layerSwitch } from './helpers';

const fixtures = join(import.meta.dirname, '..', 'tests', 'fixtures');
const holds = JSON.parse(readFileSync(join(fixtures, 'wall-landscape.holds.json'), 'utf8')) as {
  x: number;
  y: number;
}[];
const cloud = (page: Page) => page.getByRole('img', { name: '3D point cloud of the wall' });
const view = (page: Page, name: string) =>
  page.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name });

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => {
    throw e;
  });
  await page.goto('/#/studio');
  await page.getByLabel('Choose file').setInputFiles(join(fixtures, 'wall-landscape.jpg'));
  await expect(page.locator('.selection-status')).toHaveText('Tap a hold to add it to your route.');
  await tapFixture(page, holds[0]!.x, holds[0]!.y);
  await expect(page.getByRole('img', { name: 'Wall photo' })).toHaveAttribute(
    'data-hold-count',
    '1',
  );
  await view(page, '3D').check();
  await expect
    .poll(async () => Number(await cloud(page).getAttribute('data-point-count')))
    .toBeGreaterThan(0);
});

test('3D view renders a point cloud within the budget', async ({ page }) => {
  const n = Number(await cloud(page).getAttribute('data-point-count'));
  expect(n).toBeLessThanOrEqual(300_000);
});

test('orbiting moves the camera and Reset view brings it back to the photo viewpoint', async ({
  page,
}) => {
  await expect(cloud(page)).toHaveAttribute('data-camera', '0.000,0.000,0.000');
  const box = (await cloud(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 30, { steps: 8 });
  await page.mouse.up();
  await expect(cloud(page)).not.toHaveAttribute('data-camera', '0.000,0.000,0.000');
  await page.getByRole('button', { name: 'Reset view' }).click();
  await expect(cloud(page)).toHaveAttribute('data-camera', '0.000,0.000,0.000');
});

test('color mode and relief change appearance but not the point count', async ({ page }) => {
  const before = await cloud(page).getAttribute('data-point-count');
  await page.getByRole('radio', { name: 'Photo colors' }).check();
  await page.getByLabel('Relief').fill('0.8');
  await expect(page.getByRole('radio', { name: 'Photo colors' })).toBeChecked();
  expect(await cloud(page).getAttribute('data-point-count')).toBe(before);
});

test('the 3D controls fit a 375px screen', async ({ page }) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test('one force arrow per hold and numbered badges in 3D; the Arrows switch hides only the arrows', async ({
  page,
}) => {
  await view(page, 'Original').check();
  await tapFixture(page, holds[1]!.x, holds[1]!.y);
  await expect(page.getByRole('img', { name: 'Wall photo' })).toHaveAttribute(
    'data-hold-count',
    '2',
  );
  await page.getByRole('group', { name: 'Hold 1' }).getByRole('radio', { name: 'Start' }).check();
  await page.getByRole('group', { name: 'Hold 2' }).getByRole('radio', { name: 'Finish' }).check();
  // Both are incuts, so each gets exactly one direction: the force (no second, normal arrow).
  for (const n of [1, 2]) {
    await page
      .getByRole('group', { name: `Hold ${n}` })
      .getByRole('combobox', { name: 'Hold type' })
      .selectOption('jug');
  }
  await view(page, '3D').check();
  await expect(cloud(page)).toHaveAttribute('data-force-arrows', '2');
  await expect(cloud(page)).toHaveAttribute('data-badges', '1S,2F');
  await (await layerSwitch(page, 'Arrows')).uncheck();
  await expect(cloud(page)).toHaveAttribute('data-force-arrows', '0');
  await expect(cloud(page)).toHaveAttribute('data-badges', '1S,2F');
});

test('force arrows follow the hold type, including the user override', async ({ page }) => {
  const row = page.getByRole('group', { name: 'Hold 1' });
  const type = row.getByRole('combobox', { name: 'Hold type' });
  await expect(type).toBeVisible(); // 3D view triggered the analysis

  await type.selectOption('crimp');
  await expect(cloud(page)).toHaveAttribute('data-force-arrows', '1');
  await expect(row).toContainText('Pull down; keep your elbow under the edge');
  await expect(row.getByRole('img')).toHaveCount(0); // no generic pictures on the card

  await type.selectOption('pinch');
  await expect(cloud(page)).toHaveAttribute('data-force-arrows', '0');
  await expect(row).toContainText('Squeeze; no single pull direction');

  // The user corrects the direction: a pinch has none, so the arrow comes back only from the override.
  await row.getByRole('combobox', { name: 'Pull direction' }).selectOption('left');
  await expect(cloud(page)).toHaveAttribute('data-force-arrows', '1');
  await expect(row).toContainText('Pull left (set by you)');
  await row.getByRole('combobox', { name: 'Pull direction' }).selectOption('');
  await expect(cloud(page)).toHaveAttribute('data-force-arrows', '0');

  await type.selectOption('sloper');
  await expect(cloud(page)).toHaveAttribute('data-force-arrows', '1');
  await (await layerSwitch(page, 'Arrows')).uncheck();
  await expect(cloud(page)).toHaveAttribute('data-force-arrows', '0');
});

test('the Surface style shows the wall as a mesh, and Dots brings the points back', async ({
  page,
}) => {
  await page.getByRole('radio', { name: 'Surface' }).check();
  await expect(cloud(page)).toHaveAttribute('data-style', 'surface');
  await expect
    .poll(async () => Number(await cloud(page).getAttribute('data-triangles')))
    .toBeGreaterThan(1000);
  await page.getByRole('radio', { name: 'Dots' }).check();
  await expect(cloud(page)).toHaveAttribute('data-triangles', '0');
});

test('moving Relief in Surface style keeps the mesh (positions change, triangles stay)', async ({
  page,
}) => {
  await page.getByRole('radio', { name: 'Surface' }).check();
  await expect
    .poll(async () => Number(await cloud(page).getAttribute('data-triangles')))
    .toBeGreaterThan(1000);
  const before = await cloud(page).getAttribute('data-triangles');
  await page.getByRole('slider', { name: 'Relief' }).fill('0.8');
  await expect(cloud(page)).toHaveAttribute('data-triangles', before!);
});

/** The hold's grab handle in page coordinates (from the canvas's data-handles). */
async function handle(page: Page) {
  await expect(cloud(page)).toHaveAttribute('data-handles', /:/);
  const [, xy] = (await cloud(page).getAttribute('data-handles'))!.split(';')[0]!.split(':');
  const [x, y] = xy!.split(',').map(Number);
  const box = (await cloud(page).boundingBox())!;
  return { x: box.x + x!, y: box.y + y! };
}
const direction = (page: Page) =>
  page.getByRole('group', { name: 'Hold 1' }).locator('.direction-text');

test.describe('drawing a direction', () => {
  test.beforeEach(async ({ page }) => {
    await expect(direction(page)).toBeVisible();
  });

  test('dragging a handle aims that hold; the card says it was set by you', async ({ page }) => {
    const h = await handle(page);
    await page.mouse.move(h.x, h.y);
    await page.mouse.down();
    await page.mouse.move(h.x + 90, h.y - 10, { steps: 8 });
    await expect(cloud(page)).toHaveAttribute('data-aiming', /.+/);
    await page.mouse.up();
    await expect(cloud(page)).toHaveAttribute('data-aiming', '');
    await expect(direction(page)).toContainText('(set by you)');
    await expect(
      page.getByRole('group', { name: 'Hold 1' }).getByRole('combobox', { name: 'Pull direction' }),
    ).not.toHaveValue('');
  });

  test('Esc while aiming cancels; Pull: auto resets a drawn direction', async ({ page }) => {
    const before = await direction(page).textContent();
    let h = await handle(page);
    await page.mouse.move(h.x, h.y);
    await page.mouse.down();
    await page.mouse.move(h.x + 90, h.y - 10, { steps: 8 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(direction(page)).toHaveText(before!);

    h = await handle(page);
    await page.mouse.move(h.x, h.y);
    await page.mouse.down();
    await page.mouse.move(h.x + 90, h.y - 10, { steps: 8 });
    await page.mouse.up();
    await expect(direction(page)).toContainText('(set by you)');
    await page
      .getByRole('group', { name: 'Hold 1' })
      .getByRole('combobox', { name: 'Pull direction' })
      .selectOption('');
    await expect(direction(page)).toHaveText(before!);
  });

  test('a one-time coach mark shows on the first handle until the first drag, then stays away', async ({
    page,
  }) => {
    await expect(cloud(page)).toHaveAttribute('data-coach', 'aim');
    const h = await handle(page);
    await page.mouse.move(h.x, h.y);
    await page.mouse.down();
    await page.mouse.move(h.x + 60, h.y - 10, { steps: 6 });
    await page.mouse.up();
    await expect(cloud(page)).not.toHaveAttribute('data-coach', 'aim');

    // Remembered on this device: a new visit does not show it again.
    await page.reload();
    await page.getByLabel('Choose file').setInputFiles(join(fixtures, 'wall-landscape.jpg'));
    await expect(page.locator('.selection-status')).toHaveText(
      'Tap a hold to add it to your route.',
    );
    await tapFixture(page, holds[0]!.x, holds[0]!.y);
    await view(page, '3D').check();
    await expect(cloud(page)).toHaveAttribute('data-handles', /:/);
    await expect(cloud(page)).not.toHaveAttribute('data-coach', 'aim');
  });

  test('dragging away from a handle still orbits the camera', async ({ page }) => {
    const box = (await cloud(page).boundingBox())!;
    const start = await cloud(page).getAttribute('data-camera');
    await page.mouse.move(box.x + 30, box.y + box.height - 30);
    await page.mouse.down();
    await page.mouse.move(box.x + 130, box.y + box.height - 40, { steps: 8 });
    await page.mouse.up();
    await expect(cloud(page)).not.toHaveAttribute('data-camera', start!);
    await expect(cloud(page)).toHaveAttribute('data-aiming', '');
  });
});
