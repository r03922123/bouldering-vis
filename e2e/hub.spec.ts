import type { Page } from '@playwright/test';
import { expect, test } from './testLevel';

// SPEC-gym-hub v0: the gym at #/gym (SPEC-launch-wall-2 R3), its pixel canvas and the DOM path (strip, prompt). Since
// Amendment 2026-11-02 W3 nothing asks the level: everyone is a gym climber (DEFAULT_PROFILE).

const strip = (page: Page) => page.getByRole('navigation', { name: 'Gym' });
const studio = (page: Page) => page.getByRole('heading', { level: 1, name: 'Bouldering Vis' });
const hubCanvas = (page: Page) => page.locator('canvas.hub-canvas');
const floor = (page: Page) => page.getByRole('application', { name: 'Gym floor' });
const prompt = (page: Page) => page.locator('.hub-prompt');

/** The gym canvas's loop state, which HubScreen writes on every frame it draws. */
async function climber(page: Page) {
  const d = await hubCanvas(page).evaluate((c: HTMLCanvasElement) => ({ ...c.dataset }));
  return { x: Number(d.x), facing: Number(d.facing), frames: Number(d.frames), cam: Number(d.cam) };
}

/** Clicks the canvas over art x `artX` (whatever the camera and pixel size). */
async function tapArt(page: Page, artX: number) {
  // The camera is known once the first frame is drawn (no level question waits for it any more).
  await expect(hubCanvas(page)).toHaveAttribute('data-painted-at', /\d+/);
  const { cam } = await climber(page);
  const box = (await hubCanvas(page).boundingBox())!;
  const width = await hubCanvas(page).evaluate((c: HTMLCanvasElement) => c.width);
  await hubCanvas(page).click({
    position: { x: ((artX - cam + 0.5) * box.width) / width, y: box.height * 0.8 },
  });
}

/** Lets go of → (from inside the page) on the frame the climber reaches art x `x`. */
async function releaseRightAt(page: Page, x: number) {
  await hubCanvas(page).evaluate((c: HTMLCanvasElement, at: number) => {
    new MutationObserver((_, obs) => {
      if (Number(c.dataset.x) < at) return;
      obs.disconnect();
      c.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }));
    }).observe(c, { attributes: true, attributeFilter: ['data-x'] });
  }, x);
}

test('/ opens into the gym, with no dialog (AC 1; W3)', async ({ page }) => {
  await page.goto('/#/gym');
  await expect(page.getByRole('heading', { level: 1, name: 'Bloc Hall' })).toBeVisible();
  await expect(strip(page)).toBeVisible();
  await expect(hubCanvas(page)).toBeVisible();
  await expect(hubCanvas(page)).toHaveAttribute('aria-hidden', 'true');
  await expect(prompt(page)).toHaveText('Front desk'); // where you start (W4: its name only)
  await expect(prompt(page).getByRole('button')).toHaveCount(0);
  await expect(studio(page)).toBeHidden();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('the Setting Room is one tap from the gym (AC 6)', async ({ page }) => {
  await page.goto('/#/gym');
  await strip(page).getByRole('button', { name: 'Setting Room' }).click(); // the only tap
  await expect(studio(page)).toBeVisible();
  await expect(page).toHaveURL(/#\/studio$/);
});

test('everyone gets the gym climber’s strip, Setting Room door included (W3, W5)', async ({
  page,
}) => {
  await page.goto('/#/gym');
  const labels = await strip(page).getByRole('button').allTextContents();
  // No pro order (Setting Room first) and no beginner gym (no door) without a level answer; no
  // Front desk or Lockers button (W4).
  expect(labels).toEqual(['Wall 2', 'New wall', 'Setting Room']);
  await page.goto('/#/studio');
  await expect(studio(page)).toBeVisible();
});

test('Wall 2 opens its Play screen, and Back comes back (AC 5, G12, SPEC-play-shell C5)', async ({
  page,
}) => {
  await page.goto('/#/gym');
  await strip(page).getByRole('button', { name: 'Wall 2' }).click();
  await expect(page).toHaveURL(/#\/wall\/wall-b$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Wall 2' })).toBeVisible();
  await expect(page.locator('.play-verdict')).toHaveText(/^Start: /);
  await page.goBack(); // Wall 2 has no "◀ Gym" (SPEC-launch-wall-2 R3)
  await expect(strip(page)).toBeVisible();
});

test('the front desk and lockers are scenery: a name, no button, Enter does nothing (W3, W4)', async ({
  page,
}) => {
  await page.goto('/#/gym');
  await floor(page).focus();
  await page.keyboard.press('Enter'); // at the front desk
  // Let go of → the frame the climber reaches the lockers (art x 84 ± 8), from inside the page.
  await releaseRightAt(page, 80);
  await page.keyboard.down('ArrowRight');
  await expect(prompt(page)).toHaveText('Lockers');
  await page.keyboard.up('ArrowRight');
  await expect(prompt(page).getByRole('button')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/gym$/);
});

test('the gym fits a 375 px phone: no sideways scroll, 44 px buttons (AC 13)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await page.goto('/#/gym');
  for (const b of await strip(page).getByRole('button').all()) {
    const box = (await b.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  // Walk to Wall 2, a place with a prompt button (it is off screen at 375 px, so not a tap).
  await floor(page).focus();
  await releaseRightAt(page, 136);
  await page.keyboard.down('ArrowRight');
  await expect(page.getByRole('button', { name: 'Climb Wall 2' })).toBeVisible();
  await page.keyboard.up('ArrowRight');
  const climb = (await page.getByRole('button', { name: 'Climb Wall 2' }).boundingBox())!;
  expect(climb.height).toBeGreaterThanOrEqual(44);
  const canvasH = (await hubCanvas(page).boundingBox())!.height;
  expect(canvasH).toBeGreaterThan(0);
  expect(canvasH).toBeLessThanOrEqual(0.6 * (await page.evaluate(() => window.innerHeight)));
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test('the gym paints within 2 s at 4× CPU throttle, without the Studio bundle (AC 2)', async ({
  page,
  context,
}) => {
  await page.goto('/#/gym'); // warm the dev server's module transforms; the budget is the client's
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const requested: string[] = [];
  page.on('request', (r) => requested.push(new URL(r.url()).pathname));
  // Off the page first: a goto that changes only the hash wouldn't reload it.
  await page.goto('about:blank');
  await page.goto('/#/gym');
  await expect(hubCanvas(page)).toHaveAttribute('data-painted-at', /\d+/);
  const paintedAt = Number(await hubCanvas(page).getAttribute('data-painted-at'));
  // SPEC-gym-hub AC 2 sets 2 s on the Pixel 7 profile, so 2 s is already the phone number: no
  // budgetMs here.
  expect(paintedAt).toBeLessThanOrEqual(2000);
  await expect(strip(page).getByRole('button', { name: 'Wall 2' })).toBeEnabled();
  expect(requested.filter((p) => p.endsWith('/src/app/App.tsx'))).toEqual([]);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  // The check can see the Studio's bundle: the Setting Room door requests it.
  await strip(page).getByRole('button', { name: 'Setting Room' }).click();
  await expect(studio(page)).toBeVisible();
  expect(requested.some((p) => p.endsWith('/src/app/App.tsx'))).toBe(true);
});

test('tapping a bay on the canvas walks there; its prompt opens the wall (AC 5, G5, G6)', async ({
  page,
}) => {
  await page.goto('/#/gym');
  await tapArt(page, 138); // Wall 2, the only bay, stands at art x 140
  const prompt = page.getByRole('button', { name: 'Climb Wall 2' });
  await expect(prompt).toBeVisible();
  expect(await climber(page)).toMatchObject({ x: 140, facing: 1 });
  await expect(page).not.toHaveURL(/#\/wall/); // arriving only opens the prompt
  await prompt.click();
  await expect(page).toHaveURL(/#\/wall\/wall-b$/);
});

test('back in the gym, the climber is at the same spot, facing the same way (AC 7)', async ({
  page,
}) => {
  await page.goto('/#/gym');
  await strip(page).getByRole('button', { name: 'Wall 2' }).click();
  await expect(page).toHaveURL(/#\/wall\/wall-b$/);
  // Wall 2 has no "◀ Gym" (SPEC-launch-wall-2 R3); the browser's Back returns to the gym.
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Climb Wall 2' })).toBeVisible();
  expect(await climber(page)).toMatchObject({ x: 140, facing: 1 });
});

test('the floor walks with ←/→ and Enter uses the place you are at (AC 10)', async ({ page }) => {
  await page.goto('/#/gym');
  await floor(page).focus();
  // Let go of → the frame the climber reaches Wall 2 (art x 140 ± 8), from inside the page.
  await releaseRightAt(page, 136);
  await page.keyboard.down('ArrowRight');
  await expect(page.getByRole('button', { name: 'Climb Wall 2' })).toBeVisible();
  await page.keyboard.up('ArrowRight');
  expect((await climber(page)).facing).toBe(1);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/wall\/wall-b$/);
  await page.goBack();
  await floor(page).focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await climber(page)).facing).toBe(-1);
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('a strip button moves the climber in one frame, and the idle gym draws nothing (AC 11, 14)', async ({
    page,
  }) => {
    await page.goto('/#/gym');
    await expect(hubCanvas(page)).toHaveAttribute('data-frames', /\d+/);
    await page.waitForTimeout(300);
    const before = await climber(page);
    // New wall keeps the gym on screen (its photo picker is left unanswered).
    const chooser = page.waitForEvent('filechooser');
    await strip(page).getByRole('button', { name: 'New wall' }).click();
    await chooser;
    await expect.poll(async () => (await climber(page)).x).toBe(196);
    expect((await climber(page)).frames).toBe(before.frames + 1);
    await page.waitForTimeout(1500); // no idle bob, no camera easing: no frames
    expect((await climber(page)).frames).toBe(before.frames + 1);
  });
});

test('after a tap-walk the climber stands idle, not frozen mid-stride (review finding 3)', async ({
  page,
}) => {
  await page.goto('/#/gym');
  await tapArt(page, 138);
  await expect(page.getByRole('button', { name: 'Climb Wall 2' })).toBeVisible();
  await expect(hubCanvas(page)).toHaveAttribute('data-pose', 'idle');
});

test('after a key release the climber stands idle (review finding 3)', async ({ page }) => {
  await page.goto('/#/gym');
  await floor(page).focus();
  await page.keyboard.down('ArrowRight');
  await expect(hubCanvas(page)).toHaveAttribute('data-pose', 'walk');
  await page.keyboard.up('ArrowRight');
  const x = await hubCanvas(page).getAttribute('data-x');
  await expect(hubCanvas(page)).toHaveAttribute('data-pose', 'idle');
  expect(await hubCanvas(page).getAttribute('data-x')).toBe(x);
});

test('the New wall door opens the photo picker inside the tap itself (iOS; review finding 6)', async ({
  page,
}) => {
  // Records whether input.click() runs in the same task as the player's click, as WebKit needs.
  await page.addInitScript(() => {
    const w = window as unknown as { __inTap: boolean; __pickerInTap: boolean[] };
    w.__inTap = false;
    w.__pickerInTap = [];
    window.addEventListener(
      'click',
      () => {
        w.__inTap = true;
        setTimeout(() => (w.__inTap = false), 0);
      },
      true,
    );
    const click = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function (this: HTMLInputElement) {
      if (this.type === 'file') w.__pickerInTap.push(w.__inTap);
      return click.call(this);
    };
  });
  await page.goto('/#/gym');
  const chooser = page.waitForEvent('filechooser');
  await strip(page).getByRole('button', { name: 'New wall' }).click();
  await chooser;
  expect(
    await page.evaluate(() => (window as unknown as { __pickerInTap: boolean[] }).__pickerInTap),
  ).toEqual([true]);
});

test('a walk cut short by leaving the gym never uses its place later (review suggestion)', async ({
  page,
}) => {
  await page.goto('/#/gym');
  // Start a strip walk to Wall 2, and leave for the Setting Room before the climber gets there.
  await strip(page)
    .getByRole('button', { name: 'Wall 2' })
    .evaluate((b: HTMLButtonElement) => {
      b.click();
      window.location.hash = '#/studio';
    });
  await expect(page).toHaveURL(/#\/studio$/);
  await expect(studio(page)).toBeVisible(); // the gym has been hidden (and paused)
  await page.evaluate(() => (window.location.hash = '#/gym'));
  await expect(strip(page)).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(/#\/gym$/);
});

test('←/→ walk the climber without focusing the floor, even from a strip button (W1)', async ({
  page,
}) => {
  await page.goto('/#/gym');
  await expect(hubCanvas(page)).toHaveAttribute('data-painted-at', /\d+/);
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  await page.keyboard.down('ArrowRight');
  await expect(hubCanvas(page)).toHaveAttribute('data-pose', 'walk');
  await page.keyboard.up('ArrowRight');
  await expect(hubCanvas(page)).toHaveAttribute('data-pose', 'idle');
  const x = (await climber(page)).x;
  expect(x).toBeGreaterThan(28);

  await strip(page).getByRole('button', { name: 'Wall 2' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await climber(page)).facing).toBe(-1);
  await expect(page).not.toHaveURL(/#\/wall/); // the focused button was not pressed
});

test('←/→ leave the gym climber alone while another screen shows (W1)', async ({ page }) => {
  await page.goto('/#/gym');
  await strip(page).getByRole('button', { name: 'Wall 2' }).click();
  await expect(page).toHaveURL(/#\/wall\/wall-b$/);
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(500);
  await page.keyboard.up('ArrowLeft');
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Climb Wall 2' })).toBeVisible();
  expect(await climber(page)).toMatchObject({ x: 140, facing: 1 });
});

test.describe('the on-screen ◀ ▶ buttons (W2)', () => {
  const walkRight = (page: Page) => page.getByRole('button', { name: 'Walk right' });
  const walkLeft = (page: Page) => page.getByRole('button', { name: 'Walk left' });

  test('are hidden where a fine pointer can hover', async ({ page, isMobile }) => {
    test.skip(isMobile, 'the desktop profile (mouse)');
    await page.goto('/#/gym');
    await expect(strip(page)).toBeVisible();
    await expect(walkRight(page)).toBeHidden();
    await expect(walkLeft(page)).toBeHidden();
  });

  test('walk the climber on a touch profile while held, ≥ 44 px', async ({
    page,
    context,
    isMobile,
  }) => {
    test.skip(!isMobile, 'the phone profile (touch)');
    await page.goto('/#/gym');
    await expect(hubCanvas(page)).toHaveAttribute('data-painted-at', /\d+/);
    for (const b of [walkLeft(page), walkRight(page)]) {
      await expect(b).toBeVisible();
      const box = (await b.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    // A real finger: touchstart, hold, touchend (the browser makes the pointer events).
    const box = (await walkRight(page).boundingBox())!;
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] });
    await expect(hubCanvas(page)).toHaveAttribute('data-pose', 'walk');
    await expect.poll(async () => (await climber(page)).x).toBeGreaterThan(40);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(hubCanvas(page)).toHaveAttribute('data-pose', 'idle');
    const x = (await climber(page)).x;
    expect((await climber(page)).facing).toBe(1);
    await page.waitForTimeout(400);
    expect((await climber(page)).x).toBe(x); // let go: it stops
    await expect(page).toHaveURL(/#\/gym$/); // walking never uses a place
  });
});
