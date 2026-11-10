import { expect, test } from '@playwright/test';

// Exercises the real Worker path (module worker, structured clone, transferred buffers)
// against the fake ML worker that VITE_FAKE_ML=1 selects.
test('fake ML worker answers embed, decode and depth in the browser', async ({ page }) => {
  await page.goto('/#/studio');
  const result = await page.evaluate(async () => {
    // Served by the Vite dev server; resolved in the browser, not by tsc.
    type Res = {
      hold: { mask: Uint8Array; area: number } | null;
      width: number;
      height: number;
      depth: Float32Array;
    };
    type Client = { request: (req: object) => Promise<Res> };
    const clientUrl = '/src/workers/client.ts';
    const { createMlClient } = (await import(/* @vite-ignore */ clientUrl)) as {
      createMlClient: () => Client;
    };
    const client = createMlClient();
    const pixels = new ImageData(64, 48);
    await client.request({ type: 'sam:embed', imageId: 'img-1', pixels });
    const decoded = await client.request({
      type: 'sam:decode',
      imageId: 'img-1',
      point: { x: 20, y: 10 },
      selected: [],
      seen: 0,
    });
    const depth = await client.request({ type: 'depth:run', imageId: 'img-1', pixels });
    return {
      maskLength: decoded.hold?.mask.length,
      tapInMask: decoded.hold?.mask[10 * 64 + 20],
      holdIsSmall: (decoded.hold?.area ?? Infinity) < 0.08 * 64 * 48,
      depthSize: [depth.width, depth.height, depth.depth.length],
    };
  });
  expect(result).toEqual({
    maskLength: 64 * 48,
    tapInMask: 1,
    holdIsSmall: true,
    depthSize: [64, 48, 3072],
  });
});
