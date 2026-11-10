import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { tapFixture, toScreen } from './helpers';

const fixtures = join(import.meta.dirname, '..', 'tests', 'fixtures');
const holds = JSON.parse(readFileSync(join(fixtures, 'wall-landscape.holds.json'), 'utf8')) as {
  x: number;
  y: number;
}[];
const WORKING_SCALE = 1536 / 1600; // the fixture is 1600 px wide; the working image is 1536
/**
 * Longest main-thread task allowed while adding holds (SPEC-hold-segmentation › Amendment
 * 2026-10-30: Taps Finish in the Worker, AC 11).
 * The SPEC names no device, so the phone project keeps it too. Measured on CI, 22 runs (Nov 3–5):
 * desktop none, phone none except one 60 ms task.
 */
const LONG_TASK_BUDGET_MS = 150;

const canvas = (page: Page) => page.getByRole('img', { name: 'Wall photo' });
const holdCount = async (page: Page) => Number(await canvas(page).getAttribute('data-hold-count'));

test.beforeEach(async ({ page }) => {
  await page.goto('/#/studio');
  await page.getByLabel('Choose file').setInputFiles(join(fixtures, 'wall-landscape.jpg'));
  await expect(page.getByRole('status')).toHaveText('Tap a hold to add it to your route.');
});

test('tapping holds adds them; tapping a selected hold removes it', async ({ page }) => {
  for (const [i, h] of holds.slice(0, 4).entries()) {
    await tapFixture(page, h.x, h.y);
    await expect.poll(() => holdCount(page)).toBe(i + 1);
  }
  await tapFixture(page, holds[1]!.x + 2, holds[1]!.y);
  await expect.poll(() => holdCount(page)).toBe(3);
});

test('a press is acknowledged before the model answers', async ({ page }) => {
  const h = holds[0]!;
  const box = (await canvas(page).boundingBox())!;
  const at = await toScreen(page, h.x, h.y);
  await page.mouse.move(box.x + at.x, box.y + at.y);
  await page.mouse.down();
  await expect(canvas(page)).toHaveAttribute('data-pressed', 'true');
  expect(await holdCount(page)).toBe(0); // nothing has been decoded yet
  await page.mouse.up();
  await expect(canvas(page)).not.toHaveAttribute('data-pressed', 'true');
  await expect.poll(() => holdCount(page)).toBe(1);
});

test('two quick taps both land: input is never blocked while a tap is pending', async ({
  page,
}) => {
  const [a, b] = holds as [{ x: number; y: number }, { x: number; y: number }];
  const box = (await canvas(page).boundingBox())!;
  const pa = await toScreen(page, a.x, a.y);
  const pb = await toScreen(page, b.x, b.y);
  await page.mouse.click(box.x + pa.x, box.y + pa.y);
  await page.mouse.click(box.x + pb.x, box.y + pb.y); // no wait in between
  await expect.poll(() => holdCount(page)).toBe(2);
});

test('adding holds never stalls the main thread for long (C1 budget)', async ({ page }) => {
  // The pixel work (candidate picking, flood fills, stats) runs in the worker; what is left on the
  // main thread per tap is the overlay redraw. Long tasks are 50 ms+ by definition; the budget
  // leaves room for a slow CI runner but catches a flood fill (hundreds of ms) coming back.
  await page.evaluate(() => {
    const w = window as unknown as { __longTasks: number[] };
    w.__longTasks = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.__longTasks.push(Math.round(e.duration));
    }).observe({ type: 'longtask' });
  });
  for (const [i, h] of holds.slice(0, 4).entries()) {
    await tapFixture(page, h.x, h.y);
    await expect.poll(() => holdCount(page)).toBe(i + 1);
  }
  await page.waitForTimeout(300); // let the last tap's follow-up work (chalk, outline) finish
  const longTasks = await page.evaluate(
    () => (window as unknown as { __longTasks: number[] }).__longTasks,
  );
  console.log(`long tasks while adding 4 holds (ms): ${longTasks.join(', ') || 'none'}`);
  expect(Math.max(0, ...longTasks)).toBeLessThan(LONG_TASK_BUDGET_MS);
});

test('tapping bare wall adds nothing and shows a hint', async ({ page }) => {
  // Hold centers are ≥ 80 px from the edges with radii ≤ 50, so y = 15 is always wall.
  // (Not a corner: the canvas box has rounded corners that clip clicks.)
  await tapFixture(page, 800, 15);
  await expect(page.getByRole('status')).toHaveText(/Try tapping its center/);
  expect(await holdCount(page)).toBe(0);
});

test('taps still hit the right hold after zooming in', async ({ page }) => {
  const c = canvas(page);
  const before = Number(await c.getAttribute('data-scale'));
  const box = (await c.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -500);
  await expect.poll(async () => Number(await c.getAttribute('data-scale'))).toBeGreaterThan(before);

  // Pick a hold that is still on screen after zooming.
  const [scale, tx, ty] = await Promise.all(
    ['data-scale', 'data-tx', 'data-ty'].map(async (a) => Number(await c.getAttribute(a))),
  );
  const visible = holds.find((h) => {
    const sx = h.x * WORKING_SCALE * scale! + tx!;
    const sy = h.y * WORKING_SCALE * scale! + ty!;
    return sx > 20 && sy > 20 && sx < box.width - 20 && sy < box.height - 20;
  })!;
  await tapFixture(page, visible.x, visible.y);
  await expect.poll(() => holdCount(page)).toBe(1);
});

test('tagging S, S, F completes the route and draws S1/S2/F badges', async ({ page }) => {
  for (const [i, h] of holds.slice(0, 4).entries()) {
    await tapFixture(page, h.x, h.y);
    await expect.poll(() => holdCount(page)).toBe(i + 1);
  }
  const row = (n: number) => page.getByRole('group', { name: `Hold ${n}` });
  await row(1).getByRole('radio', { name: 'Start' }).check();
  await row(2).getByRole('radio', { name: 'Start' }).check();
  await expect(page.getByText('Route ready')).toHaveCount(0);
  await row(4).getByRole('radio', { name: 'Finish' }).check();
  await expect(page.getByText('Route ready')).toBeVisible();
  await expect(canvas(page)).toHaveAttribute('data-badges', '1S,2S,3,4F');

  // A third start is rejected and the hold stays a route hold.
  await row(3).getByRole('radio', { name: 'Start' }).click();
  await expect(page.getByRole('alert')).toHaveText('Max 2 start holds');
  await expect(row(3).getByRole('radio', { name: 'Route' })).toBeChecked();

  // Removing the finish hold makes the route incomplete again.
  await page.getByRole('button', { name: 'Remove hold 4' }).click();
  await expect(page.getByText('Route ready')).toHaveCount(0);
  await expect(canvas(page)).toHaveAttribute('data-badges', '1S,2S,3');
});

test('the hold list fits a 375px screen without horizontal scroll', async ({ page }) => {
  for (const [i, h] of holds.slice(0, 3).entries()) {
    await tapFixture(page, h.x, h.y);
    await expect.poll(() => holdCount(page)).toBe(i + 1);
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});
