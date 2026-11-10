import { expect, test, type Page } from '@playwright/test';

// SPEC-pixel-kit AC 41–44, on the dev-only gallery (px-gallery.html), in both projects.

const GALLERY = '/px-gallery.html';

// What src/modules/pixel-kit/gallery.tsx puts on window (that file is not in this tsconfig).
declare global {
  interface Window {
    pxGallery?: {
      expected(name: string): { width: number; height: number; px: number; rgba: number[] };
      setTime(ms: number): void;
      audioState(): string;
    };
  }
}

/** Collects console errors and page errors for the whole test. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

/** RGBA bytes of a stage's .px-layer canvas. */
async function layerBytes(page: Page, scene: string): Promise<number[]> {
  return page
    .locator(`[data-scene="${scene}"] canvas.px-layer`)
    .evaluate((c: HTMLCanvasElement) => {
      const ctx = c.getContext('2d')!;
      return [...ctx.getImageData(0, 0, c.width, c.height).data];
    });
}

/** The chalk colour, #f7f3e8: on the motion stage only a puff draws it. */
const hasChalk = (rgba: number[]) => {
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i] === 0xf7 && rgba[i + 1] === 0xf3 && rgba[i + 2] === 0xe8 && rgba[i + 3] === 255)
      return true;
  }
  return false;
};

async function setTime(page: Page, ms: number) {
  await page.evaluate((t) => window.pxGallery!.setTime(t), ms);
  await expect(page.locator('[data-scene="motion"]')).toHaveAttribute('data-time', String(ms));
}

test('the hang-48 layer is blit(renderScene(…)) at this dpr, pixelated and click-through (AC 41)', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto(GALLERY);
  const canvas = page.locator('[data-scene="hang-48"] canvas.px-layer');
  await expect(canvas).toHaveAttribute('data-px', /\d+/);

  const result = await canvas.evaluate((c: HTMLCanvasElement) => {
    const want = window.pxGallery!.expected('hang-48');
    const got = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let mismatches = 0;
    let opaque = 0;
    for (let i = 0; i < got.length; i++) if (got[i] !== want.rgba[i]) mismatches++;
    for (let i = 3; i < got.length; i += 4) if (got[i] === 255) opaque++;
    const style = getComputedStyle(c);
    const parent = getComputedStyle(c.parentElement!);
    return {
      want: { width: want.width, height: want.height, px: want.px, bytes: want.rgba.length },
      size: { width: c.width, height: c.height, px: Number(c.dataset.px), bytes: got.length },
      mismatches,
      opaque,
      dpr: window.devicePixelRatio,
      cssWidth: c.getBoundingClientRect().width,
      cssHeight: c.getBoundingClientRect().height,
      imageRendering: style.imageRendering,
      pointerEvents: style.pointerEvents,
      ariaHidden: c.getAttribute('aria-hidden'),
      parentOverflow: [parent.overflowX, parent.overflowY],
      parentPosition: parent.position,
    };
  });

  expect(result.size).toEqual(result.want);
  expect(result.mismatches).toBe(0);
  expect(result.opaque).toBeGreaterThan(300); // the climber is really there
  expect(result.imageRendering).toBe('pixelated');
  expect(result.pointerEvents).toBe('none');
  expect(result.ariaHidden).toBe('true');
  const { width, height, px } = result.size;
  expect(Math.abs(result.cssWidth - (width * px) / result.dpr)).toBeLessThanOrEqual(0.01);
  expect(Math.abs(result.cssHeight - (height * px) / result.dpr)).toBeLessThanOrEqual(0.01);
  for (const o of result.parentOverflow) expect(['hidden', 'clip']).toContain(o);
  expect(result.parentPosition).toBe('relative');
  expect(errors).toEqual([]);
});

test('every pixel button and the sound toggle are ≥ 44 × 44, with no horizontal scroll (AC 42)', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto(GALLERY);
  const buttons = page.locator('.px-button');
  await expect(page.getByRole('button', { name: 'Sound' })).toBeVisible();
  const n = await buttons.count();
  expect(n).toBeGreaterThanOrEqual(10);
  for (let i = 0; i < n; i++) {
    const b = (await buttons.nth(i).boundingBox())!;
    expect(b.width, `button ${i}`).toBeGreaterThanOrEqual(44);
    expect(b.height, `button ${i}`).toBeGreaterThanOrEqual(44);
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  expect(errors).toEqual([]);
});

test('sound stays on across a reload and runs after the first tap (AC 43)', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(GALLERY);
  const toggle = page.getByRole('button', { name: 'Sound' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => window.pxGallery!.audioState())).toBe('none');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  // No AudioContext before a gesture; the first tap anywhere starts it.
  expect(await page.evaluate(() => window.pxGallery!.audioState())).toBe('none');
  await page.getByRole('heading', { level: 1 }).click();
  await expect.poll(() => page.evaluate(() => window.pxGallery!.audioState())).toBe('running');
  await page.getByRole('button', { name: 'Play grab' }).click();
  expect(errors).toEqual([]);
});

test('with localStorage throwing, sound starts off and still works (AC 43)', async ({
  browser,
}, testInfo) => {
  const { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent, baseURL } =
    testInfo.project.use;
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    userAgent,
    baseURL,
  });
  await context.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Storage is blocked', 'SecurityError');
      },
    });
  });
  const page = await context.newPage();
  const errors = watchErrors(page);
  await page.goto(GALLERY);
  expect(
    await page.evaluate(() => {
      try {
        return typeof window.localStorage;
      } catch {
        return 'throws';
      }
    }),
  ).toBe('throws');
  const toggle = page.getByRole('button', { name: 'Sound' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => window.pxGallery!.audioState())).toBe('running');
  await page.getByRole('button', { name: 'Play send' }).click();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(errors).toEqual([]);
  await context.close();
});

test.describe('reduced motion (AC 44)', () => {
  test('holds the target still and draws no puffs', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(GALLERY);
    await setTime(page, 0);
    const at0 = await layerBytes(page, 'motion');
    await setTime(page, 100);
    const at100 = await layerBytes(page, 'motion');
    await setTime(page, 400);
    const at400 = await layerBytes(page, 'motion');
    expect(at400).toEqual(at0);
    expect(at0.some((v) => v !== 0)).toBe(true); // the target is drawn
    for (const bytes of [at0, at100, at400]) expect(hasChalk(bytes)).toBe(false);
  });

  test('without it, the target breathes and the puff shows (the control)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(GALLERY);
    await setTime(page, 0);
    const at0 = await layerBytes(page, 'motion');
    await setTime(page, 100);
    expect(hasChalk(await layerBytes(page, 'motion'))).toBe(true);
    await setTime(page, 400);
    expect(await layerBytes(page, 'motion')).not.toEqual(at0);
  });
});
