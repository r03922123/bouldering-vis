import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { budgetMs, toScreen, layerSwitch } from './helpers';

const fixtures = join(import.meta.dirname, '..', 'tests', 'fixtures');
const holds = JSON.parse(readFileSync(join(fixtures, 'wall-landscape.holds.json'), 'utf8')) as {
  x: number;
  y: number;
  color: string;
}[];
const canvas = (page: Page) => page.getByRole('img', { name: 'Wall photo' });

/** Reads the rendered canvas pixel under a fixture coordinate. */
async function pixelAt(page: Page, x: number, y: number) {
  const p = await toScreen(page, x, y);
  return canvas(page).evaluate((el: HTMLCanvasElement, p) => {
    const dpr = window.devicePixelRatio || 1;
    const d = el
      .getContext('2d')!
      .getImageData(Math.round(p.x * dpr), Math.round(p.y * dpr), 1, 1).data;
    return [d[0]!, d[1]!, d[2]!];
  }, p);
}

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const close = (a: number[], b: number[], tol: number) =>
  a.every((v, i) => Math.abs(v - b[i]!) <= tol);

test.beforeEach(async ({ page }) => {
  await page.goto('/#/studio');
  await page.getByLabel('Choose file').setInputFiles(join(fixtures, 'wall-landscape.jpg'));
  await expect(page.getByRole('status')).toHaveText('Tap a hold to add it to your route.');
  for (const [i, h] of holds.slice(0, 3).entries()) {
    await canvas(page).click({ position: await toScreen(page, h.x, h.y) });
    await expect(canvas(page)).toHaveAttribute('data-hold-count', String(i + 1));
  }
  await page.getByRole('group', { name: 'Hold 1' }).getByRole('radio', { name: 'Start' }).check();
  await page.getByRole('group', { name: 'Hold 2' }).getByRole('radio', { name: 'Finish' }).check();
});

test('Show route turns the wall #2B2B2B and keeps the selected holds in color', async ({
  page,
}) => {
  await expect(page.getByRole('button', { name: 'Show route' })).toHaveClass(/primary/);
  await page.getByRole('button', { name: 'Show route' }).click();
  await expect(
    page.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name: 'Route' }),
  ).toBeChecked();
  await expect.poll(() => pixelAt(page, 800, 15)).toEqual([0x2b, 0x2b, 0x2b]);
  // Hold 3 is untagged, so no badge covers its center.
  const h = holds[2]!;
  const got = await pixelAt(page, h.x, h.y);
  expect(close(got, hex(h.color), 30), `${got} vs ${h.color}`).toBe(true);
  // An unselected hold is gray #8A8A8A, or wall-colored when other holds are hidden.
  const other = holds[5]!;
  await expect.poll(() => pixelAt(page, other.x, other.y)).toEqual([0x8a, 0x8a, 0x8a]);
  await (await layerSwitch(page, 'Show other holds')).uncheck();
  await expect.poll(() => pixelAt(page, other.x, other.y)).toEqual([0x2b, 0x2b, 0x2b]);
});

test('in Route view a tap on the wall adds nothing; a tap on a selected hold removes it', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Show route' }).click();
  await canvas(page).click({ position: await toScreen(page, holds[6]!.x, holds[6]!.y) });
  await expect(page.locator('.selection-status')).toHaveText('Switch to Original to add holds.');
  await expect(canvas(page)).toHaveAttribute('data-hold-count', '3');
  await canvas(page).click({ position: await toScreen(page, holds[0]!.x, holds[0]!.y) });
  await expect(canvas(page)).toHaveAttribute('data-hold-count', '2');
});

test('the app never switches views by itself', async ({ page }) => {
  // The route is complete, but the view stays Original until the user asks.
  await expect(
    page.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name: 'Original' }),
  ).toBeChecked();
});

// SPEC-route-compositor AC 3 sets 100 ms on a laptop: desktop and phone keep it; iPhone gets 300 ms.
// Measured on CI, 22 runs (Nov 3–5): desktop 19–36 ms, phone 19–41 ms, iPhone 21–102 ms (124 ms once).
test('compositeRoute composites a 1536×1152 image within budget', async ({ page }, testInfo) => {
  const ms = await page.evaluate(async () => {
    const url = '/src/modules/route-compositor/index.ts';
    const { compositeRoute } = (await import(/* @vite-ignore */ url)) as {
      compositeRoute: (
        s: ImageData,
        sel: { mask: Uint8Array }[],
        o: Uint8Array,
        opts: object,
      ) => ImageData;
    };
    const src = new ImageData(1536, 1152);
    const n = 1536 * 1152;
    const sel = Array.from({ length: 10 }, () => ({ mask: new Uint8Array(n) }));
    compositeRoute(src, sel, new Uint8Array(n), { showOtherHolds: true }); // warm up the JIT
    const t0 = performance.now();
    compositeRoute(src, sel, new Uint8Array(n), { showOtherHolds: true });
    return performance.now() - t0;
  });
  console.log(`compositeRoute 1536×1152, 10 holds: ${Math.round(ms)} ms`);
  expect(ms).toBeLessThan(budgetMs(testInfo.project.name, 100));
});

// SPEC-route-compositor AC 4 sets 1 s with no device named, so every project keeps it. Measured on CI,
// 22 runs (Nov 3–5): desktop 323–583 ms, phone 349–575 ms, iPhone 273–587 ms.
test('segmentWall finds the synthetic holds (recall ≥ 0.80, IoU ≥ 0.60) in ≤ 1 s', async ({
  page,
}) => {
  const r = await page.evaluate(async () => {
    type Load = (b: Blob) => Promise<{ pixels: ImageData }>;
    const inputUrl = '/src/modules/image-input/index.ts';
    const wallUrl = '/src/modules/route-compositor/worker.ts';
    const { loadImage } = (await import(/* @vite-ignore */ inputUrl)) as {
      loadImage: Load;
    };
    const { segmentWall } = (await import(/* @vite-ignore */ wallUrl)) as {
      segmentWall: (p: ImageData) => Uint8Array;
    };
    const get = async (f: string) => (await fetch(`/tests/fixtures/${f}`)).blob();
    const img = await loadImage(await get('wall-landscape.jpg'));
    const gold = await loadImage(await get('wall-landscape.all-holds.png'));
    const t0 = performance.now();
    const m = segmentWall(img.pixels);
    const ms = performance.now() - t0;
    let tp = 0;
    let truth = 0;
    let union = 0;
    for (let i = 0; i < m.length; i++) {
      const g = gold.pixels.data[i * 4]! > 127 ? 1 : 0;
      tp += m[i]! & g;
      truth += g;
      union += m[i]! | g;
    }
    return { ms, recall: tp / truth, iou: tp / union };
  });
  console.log(
    `segmentWall: ${Math.round(r.ms)} ms, recall ${r.recall.toFixed(3)}, IoU ${r.iou.toFixed(3)}`,
  );
  expect(r.recall).toBeGreaterThanOrEqual(0.8);
  expect(r.iou).toBeGreaterThanOrEqual(0.6);
  expect(r.ms).toBeLessThan(1000);
});

test('each hold row shows its chalk level; Show chalk can be turned off', async ({ page }) => {
  await expect(page.getByRole('group', { name: 'Hold 1' })).toContainText('Chalk: none');
  const chalk = await layerSwitch(page, 'Show chalk');
  await expect(chalk).toBeChecked();
  await chalk.uncheck();
  await expect(chalk).not.toBeChecked();
});
