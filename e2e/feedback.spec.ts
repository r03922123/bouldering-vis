import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { tapFixture, toScreen } from './helpers';

const fixtures = join(import.meta.dirname, '..', 'tests', 'fixtures');
const holds = JSON.parse(readFileSync(join(fixtures, 'wall-landscape.holds.json'), 'utf8')) as {
  x: number;
  y: number;
}[];

test.beforeEach(async ({ page }) => {
  await page.goto('/#/studio');
  await page.getByLabel('Choose file').setInputFiles(join(fixtures, 'wall-landscape.jpg'));
  await expect(page.locator('.selection-status')).toHaveText('Tap a hold to add it to your route.');
});

test('a new hold pulses once, then the pulse ends', async ({ page }) => {
  const wall = page.getByRole('img', { name: 'Wall photo' });
  // The pulse lasts PULSE_MS (450 ms), but after ~270 ms an expect with the default 5 s timeout
  // polls only every 500 ms (timeouts under 2.5 s keep polling every 100 ms), so a poll can miss
  // the whole pulse (CI, Nov 4–5). The page records each change instead; the record is a lasting
  // state, which a poll can't miss. One entry per callback is enough: the pulse is set and cleared
  // at least a frame apart, never in the same task.
  await wall.evaluate((c: HTMLCanvasElement) => {
    const seen: string[] = [];
    new MutationObserver(() => {
      seen.push(c.getAttribute('data-pulse') ? 'on' : 'off');
      c.dataset.pulseLog = seen.join(',');
    }).observe(c, { attributes: true, attributeFilter: ['data-pulse'] });
  });
  await tapFixture(page, holds[0]!.x, holds[0]!.y);
  await expect(wall).toHaveAttribute('data-hold-count', '1');
  // One pulse, then it ends, within the old 2 s cap (no SPEC number).
  await expect(wall).toHaveAttribute('data-pulse-log', 'on,off', { timeout: 2000 });
});

test('a missed tap shows its message right at the tap point, then fades', async ({ page }) => {
  await tapFixture(page, 800, 15);
  const toast = page.locator('.tap-toast');
  await expect(toast).toHaveText('Couldn’t isolate a hold here. Try tapping its center.');
  const wall = (await page.getByRole('img', { name: 'Wall photo' }).boundingBox())!;
  const tap = await toScreen(page, 800, 15);
  const t = (await toast.boundingBox())!;
  expect(Math.abs(t.x + t.width / 2 - (wall.x + tap.x))).toBeLessThan(4); // centered on the tap
  // Near the top edge the bubble flips below the tap instead of being clipped by the wall box.
  expect(t.y).toBeGreaterThanOrEqual(wall.y);
  expect(t.y + t.height).toBeLessThanOrEqual(wall.y + wall.height);
  // A wait, not a SPEC budget: the toast's timer is 2 s (SelectionCanvas). Polling is safe here,
  // unlike for the pulse: the toast lasts 4× the longest poll gap (500 ms, default timeout), and
  // "gone" is a lasting state.
  await expect(toast).toHaveCount(0, { timeout: 3000 });
});
