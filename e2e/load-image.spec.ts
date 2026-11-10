import { expect, test } from '@playwright/test';
import { budgetMs } from './helpers';

// SPEC-image-input AC 8 sets the 1 s budget "on a mid-range laptop": desktop and phone (Chromium at
// desktop speed) keep it. iPhone gets 3 s, which still catches a lost downscale. Measured on CI,
// 22 runs (Nov 3–5): desktop 119–262 ms, phone 130–325 ms, iPhone 572–1073 ms.

test('loadImage decodes and downscales a 12 MP JPEG within budget', async ({ page }, testInfo) => {
  await page.goto('/#/studio');
  const r = await page.evaluate(async () => {
    type Loaded = { width: number; height: number; scale: number; id: string; pixels: ImageData };
    const url = '/src/modules/image-input/index.ts';
    const { loadImage } = (await import(/* @vite-ignore */ url)) as {
      loadImage: (b: Blob, name?: string) => Promise<Loaded>;
    };
    const c = new OffscreenCanvas(4032, 3024);
    const g = c.getContext('2d')!;
    g.fillStyle = '#c33';
    g.fillRect(0, 0, 4032, 3024);
    const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
    const t0 = performance.now();
    const img = await loadImage(blob, 'wall.jpg');
    const ms = performance.now() - t0;
    return { w: img.width, h: img.height, pw: img.pixels.width, scale: img.scale, ms, id: img.id };
  });
  expect([r.w, r.h, r.pw]).toEqual([1536, 1152, 1536]);
  expect(r.scale).toBeCloseTo(1536 / 4032, 6);
  expect(r.id).toMatch(/^[0-9a-f-]{36}$/);
  console.log(`12 MP decode+downscale: ${Math.round(r.ms)} ms`);
  expect(r.ms).toBeLessThan(budgetMs(testInfo.project.name, 1000));
});
