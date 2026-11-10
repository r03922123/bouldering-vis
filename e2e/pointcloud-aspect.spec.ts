import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { tapFixture } from './helpers';

// Regression: on a short laptop window the 3D box was capped by max-height, became wider than
// the photo, and the camera (fixed to the photo aspect) stretched the cloud horizontally.
test.use({ viewport: { width: 1280, height: 720 } });

test('the 3D view keeps the photo aspect on a short laptop window', async ({ page }) => {
  await page.goto('/#/studio');
  await page
    .getByLabel('Choose file')
    .setInputFiles(join(import.meta.dirname, '..', 'tests', 'fixtures', 'wall-landscape.jpg'));
  await expect(page.locator('.selection-status')).toHaveText('Tap a hold to add it to your route.');
  await tapFixture(page, 300, 300);
  await page.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name: '3D' }).check();
  const cloud = page.getByRole('img', { name: '3D point cloud of the wall' });
  await expect
    .poll(async () => Number(await cloud.getAttribute('data-point-count')))
    .toBeGreaterThan(0);
  const [w, h] = await cloud.evaluate((el) => [el.clientWidth, el.clientHeight]);
  expect(Math.abs(w! / h! - 1536 / 1152)).toBeLessThan(0.02);
  expect(Number(await cloud.getAttribute('data-camera-aspect'))).toBeCloseTo(w! / h!, 2);
});
