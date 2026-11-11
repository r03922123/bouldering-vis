import type { Locator, Page } from '@playwright/test';
import { openOwnTag } from './helpers';
import { expect, openTestWall, openTestWallMap, test } from './testLevel';

// SPEC-play-shell › Amendment 2026-11-02 (b), acceptance 1, 3 and 4: the one-screen Play HUD on
// The test level (served as Wall 2's) at 1280 × 800 and 375 × 740 (fake models). Every verdict is still beta-moves' own.

const SIZES = [
  { name: 'wide 1280 × 800', width: 1280, height: 800 },
  { name: 'phone 375 × 740', width: 375, height: 740 },
] as const;

const stage = (page: Page) => page.getByRole('region', { name: 'Wall' });
const limb = (page: Page, short: string) =>
  page
    .getByRole('group', { name: 'Moves' })
    .getByRole('button', { name: new RegExp(`^${short}\\b`) });

/**
 * Presses Tab, and only Tab, until the focused element's name (aria-label, else its text) starts
 * with `name`. Fails if focus leaves the page on the way (to the body, as a headless browser
 * wraps round; a real one goes to its own toolbar): the control must come next in the page's
 * order, not round the back of it (review 5). (Tab from the body always lands on an
 * element, so landing on the body means the page was left.)
 */
async function tabTo(page: Page, name: string, max = 250) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const at = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      return (el.getAttribute('aria-label') ?? el.textContent ?? '').trim();
    });
    if (at === null) throw new Error(`Focus left the page before "${name}"`);
    if (at?.startsWith(name)) return;
  }
  throw new Error(`Tab never reached "${name}"`);
}

/** Wholly inside the viewport, as the player sees it (no scrolling). */
async function inView(page: Page, l: Locator, what: string) {
  const box = (await l.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box, what).not.toBeNull();
  expect(box.y, `${what}: top`).toBeGreaterThanOrEqual(0);
  expect(box.x, `${what}: left`).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height, `${what}: bottom`).toBeLessThanOrEqual(vp.height + 0.5);
  expect(box.x + box.width, `${what}: right`).toBeLessThanOrEqual(vp.width + 0.5);
}

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test('acceptance 1: pad, Undo, Redo and the verdict stay on screen while a hold is tapped', async ({
      page,
    }) => {
      await openTestWallMap(page);
      await page.getByRole('button', { name: 'Start planning' }).click();
      await limb(page, 'LH').click();
      const taps = page.locator('.play-taps');
      const d = await taps.evaluate((el: HTMLElement) => ({ ...el.dataset }));
      const at = {
        x: 774.7 * Number(d.scale) + Number(d.tx),
        y: 464.6 * Number(d.scale) + Number(d.ty),
      };
      await taps.click({ position: at });
      await expect(stage(page)).toHaveAttribute('data-moves', '1');
      // Nothing scrolled: the hold, the pad, Undo, Redo and the verdict are all in view at once.
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      for (const l of ['LH', 'RH', 'LF', 'RF']) await inView(page, limb(page, l), l);
      await inView(page, page.getByRole('button', { name: 'Undo' }), 'Undo');
      await inView(page, page.getByRole('button', { name: 'Redo' }), 'Redo');
      const coach = page.getByRole('region', { name: 'Coach' });
      await inView(page, coach, 'the verdict');
      await expect(coach.locator('.play-verdict')).toHaveText('Left hand to 3: holds');
      await expect(coach.locator('.play-coach-text')).toContainText('Left hand to 3');
      // The 2×2 pad is shaped like the body: hands over feet, left on the left.
      const [lh, rh, lf, rf] = await Promise.all(
        ['LH', 'RH', 'LF', 'RF'].map(async (l) => (await limb(page, l).boundingBox())!),
      );
      expect(lh!.y).toBeLessThan(lf!.y);
      expect(rh!.y).toBeLessThan(rf!.y);
      expect(lh!.x).toBeLessThan(rh!.x);
      expect(lf!.x).toBeLessThan(rf!.x);
    });

    test('acceptance 3: the direction check is a banner on the photo; Edit and Start planning work', async ({
      page,
    }) => {
      await openTestWallMap(page);
      const banner = page.getByRole('region', { name: 'Do these directions look right?' });
      const photo = (await page.getByRole('img', { name: 'Wall photo' }).boundingBox())!;
      const b = (await banner.boundingBox())!;
      expect(b.y).toBeGreaterThanOrEqual(photo.y);
      expect(b.y + b.height).toBeLessThanOrEqual(photo.y + photo.height + 0.5);
      expect(b.x).toBeGreaterThanOrEqual(photo.x - 0.5);
      expect(b.x + b.width).toBeLessThanOrEqual(photo.x + photo.width + 0.5);
      await banner.getByRole('button', { name: 'Edit directions' }).click();
      await expect(stage(page)).toHaveAttribute('data-map', 'edit');
      await page.getByRole('button', { name: 'Done' }).click();
      await expect(stage(page)).toHaveAttribute('data-map', 'closed');
      await expect(limb(page, 'LH')).toBeVisible();
      // A fresh visit (the plan has no moves): the banner's Start planning goes to the pad.
      await openTestWallMap(page);
      await banner.getByRole('button', { name: 'Start planning' }).click();
      await expect(stage(page)).toHaveAttribute('data-map', 'closed');
      await expect(banner).toHaveCount(0);
      await expect(limb(page, 'LH')).toBeVisible();
    });

    test('acceptance 4: List targets opens the full list, and a keyboard-only move works', async ({
      page,
    }) => {
      // From load, Tab presses only, never a programmatic focus (review 5). A baked level
      // opens on the tray (R7).
      await openTestWall(page);
      // K1: A picks the left foot. Then by Tab: the drawer's ☰ (a phone) and List targets.
      await page.keyboard.press('a');
      await expect(limb(page, 'LF')).toHaveAttribute('aria-pressed', 'true');
      if (await page.getByRole('button', { name: 'Hints and tools' }).count()) {
        await tabTo(page, 'Hints and tools');
        await page.keyboard.press('Enter');
        await expect(page.getByRole('button', { name: 'Hints and tools' })).toHaveAttribute(
          'aria-expanded',
          'true',
        );
      }
      await tabTo(page, 'List targets');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: 'List targets' })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      const list = page.getByRole('region', { name: 'Targets for the left foot' });
      await expect(list).toBeVisible();
      // The full list: every route hold a foot may take, the wall feet, a smear and Let go.
      expect(await list.getByRole('button').count()).toBeGreaterThan(40);
      let found = false;
      for (let i = 0; i < 150 && !found; i++) {
        await page.keyboard.press('Tab');
        found = await page.evaluate(
          () => document.activeElement?.textContent === 'Wall foothold 23',
        );
      }
      expect(found).toBe(true);
      await page.keyboard.press('Enter');
      await expect(stage(page)).toHaveAttribute('data-moves', '1');
      await expect(page.locator('.play-verdict')).toHaveText(
        'Left foot to Wall foothold 23: holds',
      );
    });
  });
}

test('review 1: in Tag on a 375 px phone, the photo stays in view while the hold list scrolls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await page.goto('/#/gym');
  await openOwnTag(page);
  const photo = page.getByRole('img', { name: 'Wall photo' });
  await expect(page.getByRole('button', { name: 'Plan this route' })).toBeVisible();
  await page.waitForTimeout(800);
  const box = (await photo.boundingBox())!;
  const spots: [number, number][] = [
    [0.3, 0.85],
    [0.42, 0.8],
    [0.35, 0.68],
    [0.5, 0.62],
    [0.44, 0.5],
    [0.58, 0.45],
  ];
  for (const [fx, fy] of spots) {
    const n = Number(await photo.getAttribute('data-hold-count'));
    await photo.click({ position: { x: box.width * fx, y: box.height * fy } });
    await expect(photo).toHaveAttribute('data-hold-count', String(n + 1));
  }
  // Scroll down the route steps and the hold list: the photo stays pinned at the top.
  const scrolled = await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    return window.scrollY;
  });
  expect(scrolled).toBeGreaterThan(200);
  await expect(async () => {
    const b = (await photo.boundingBox())!;
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeLessThan(60);
  }).toPass();
});

test('the side panel never squeezes the COACH: its text stays inside its box (wide edit mode)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openTestWall(page);
  // A long COACH page: Numbers on adds the one-line breakdown, which wraps to several lines.
  await page.getByRole('switch', { name: 'Numbers' }).check();
  await page.getByRole('button', { name: 'Check directions' }).click();
  await page.getByRole('button', { name: 'Edit directions' }).click();
  const coach = page.getByRole('region', { name: 'Coach' });
  // R0-4 (amendment 2026-11-03): the goal is page 1, the start verdict page 2, Numbers page 3.
  await coach.click();
  for (const n of ['2', '3']) {
    await coach.getByRole('button', { name: 'Next coach line' }).click();
    await coach.click();
    await expect(coach).toHaveAttribute('data-page', n);
    await expect(coach).toHaveAttribute('data-revealed', 'all');
  }
  const lines = await coach
    .locator('.play-coach-text')
    .evaluate((el) =>
      Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)),
    );
  expect(lines).toBeGreaterThanOrEqual(3);
  const fits = await coach.evaluate((el) => {
    const text = el.querySelector('.play-coach-text')!.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    return text.bottom <= box.bottom + 0.5 && el.scrollHeight <= el.clientHeight + 1;
  });
  expect(fits).toBe(true);
});

test.describe('U7: the Tag step', () => {
  async function openTag(page: Page) {
    await page.goto('/#/gym');
    await openOwnTag(page);
    await expect(page.getByRole('button', { name: 'Plan this route' })).toBeVisible();
    await page.waitForTimeout(300);
  }

  test('at 1280 × 800 the route steps and Plan this route are in a panel right of the photo', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openTag(page);
    const stage = (await page.getByRole('region', { name: 'Wall' }).boundingBox())!;
    const plan = page.getByRole('button', { name: 'Plan this route' });
    const steps = page.getByRole('navigation', { name: 'Route progress' });
    const p = (await plan.boundingBox())!;
    const s = (await steps.boundingBox())!;
    expect(p.x).toBeGreaterThan(stage.x + stage.width);
    expect(s.x).toBeGreaterThan(stage.x + stage.width);
    expect(stage.y).toBeLessThan(120);
    // No scrolling needed to reach Plan this route.
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(p.y + p.height).toBeLessThanOrEqual(800);
    // The steps, Plan this route and the hold list are all in the side panel.
    const panel = page.getByRole('complementary', { name: 'Route' });
    await expect(panel.getByRole('navigation', { name: 'Route progress' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Plan this route' })).toBeVisible();
    // Once a hold is tagged, its list is in the panel too.
    const photo = page.getByRole('img', { name: 'Wall photo' });
    const pb = (await photo.boundingBox())!;
    await photo.click({ position: { x: pb.width * 0.3, y: pb.height * 0.85 } });
    await expect(photo).toHaveAttribute('data-hold-count', '1');
    await expect(panel.getByRole('region', { name: 'Selected holds' })).toBeVisible();
  });

  test('at 1280 × 800 Tab goes from the photo into the panel in reading order', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openTag(page);
    // A route that can be planned (Plan this route is disabled, so not a tab stop, until then).
    const photo = page.getByRole('img', { name: 'Wall photo' });
    const pb = (await photo.boundingBox())!;
    const spots: [number, number][] = [
      [0.3, 0.85],
      [0.42, 0.8],
      [0.35, 0.68],
    ];
    for (const [i, [fx, fy]] of spots.entries()) {
      await photo.click({ position: { x: pb.width * fx, y: pb.height * fy } });
      await expect(photo).toHaveAttribute('data-hold-count', String(i + 1));
    }
    await page
      .getByRole('group', { name: 'Hold 1', exact: true })
      .getByRole('radio', { name: 'Start' })
      .check();
    await page
      .getByRole('group', { name: 'Hold 3', exact: true })
      .getByRole('radio', { name: 'Finish' })
      .check();
    await expect(page.getByRole('button', { name: 'Plan this route' })).toBeEnabled();
    // Start where a keyboard user starts: the page's first stop, the header's ◀ Gym (the browser
    // would otherwise go on from the last radio clicked).
    await page.getByRole('banner').getByRole('link', { name: 'Gym' }).focus();
    // Every stop from the top of the page to Plan this route: photo first, then the panel,
    // never back again, and never off the page (tabTo fails if it leaves).
    const where: string[] = [];
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      const at = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const zone = el.closest('header')
          ? 'header'
          : el.closest('main')
            ? 'main'
            : el.closest('aside')
              ? 'aside'
              : 'other';
        return {
          zone,
          name: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim(),
          tag: el.tagName,
        };
      });
      expect(at, `focus left the page after ${JSON.stringify(where)}`).not.toBeNull();
      where.push(`${at!.zone}:${at!.tag}:${at!.name.slice(0, 16)}`);
      if (at!.name.startsWith('Plan this route')) break;
    }
    const zones = where.map((w) => w.split(':')[0]);
    const trail = where.join(' → ');
    expect(zones.at(-1), trail).toBe('aside');
    const firstAside = zones.indexOf('aside');
    // Header and photo first; once in the panel, Tab stays there in reading order.
    expect(
      zones.slice(firstAside).every((z) => z === 'aside'),
      trail,
    ).toBe(true);
    expect(
      zones.slice(0, firstAside).every((z) => z === 'header' || z === 'main'),
      trail,
    ).toBe(true);
  });

  test('at 390 × 844 it stays stacked: the steps below the photo', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openTag(page);
    const photo = (await page.getByRole('img', { name: 'Wall photo' }).boundingBox())!;
    const s = (await page.getByRole('navigation', { name: 'Route progress' }).boundingBox())!;
    expect(s.y).toBeGreaterThanOrEqual(photo.y + photo.height);
    expect(Math.abs(s.x - photo.x)).toBeLessThan(24);
  });
});

// SPEC-play-shell › Amendment 2026-11-04 L1 (the iPhone check): a phone on its side is wide but
// short, so it gets the side panel, not the portrait bottom bar that covered half its height.
test('L1: a landscape phone (734 × 343) plays side by side: photo, COACH and pad in view', async ({
  page,
}) => {
  await page.setViewportSize({ width: 734, height: 343 });
  await openTestWallMap(page);
  await page.getByRole('button', { name: 'Start planning' }).click();
  await expect(stage(page)).toHaveAttribute('data-map', 'closed');
  await expect(page.locator('.play-wide')).toHaveCount(1);
  await expect(page.locator('.play-bar')).toHaveCount(0);
  await inView(page, stage(page), 'photo');
  expect((await stage(page).boundingBox())!.height, 'photo height').toBeGreaterThanOrEqual(240);
  await limb(page, 'LF').click();
  const taps = page.locator('.play-taps');
  const d = await taps.evaluate((el: HTMLElement) => ({ ...el.dataset }));
  await taps.click({
    position: { x: 726 * Number(d.scale) + Number(d.tx), y: 739 * Number(d.scale) + Number(d.ty) },
  });
  await expect(stage(page)).toHaveAttribute('data-moves', '1');
  const coach = page.getByRole('region', { name: 'Coach' });
  await expect(coach).toContainText('Left foot to Wall foothold 23: holds');
  await inView(page, coach, 'COACH');
  await inView(page, limb(page, 'LF'), 'LF');
});

// SPEC-play-shell › Amendment 2026-11-04 L2 (the iPad check): a tablet held upright is narrow but
// tall; the photo takes the height the header, the COACH and the bar leave, not a phone's 45dvh.
test('L2: an upright tablet (820 × 1106) gets a full-width photo, with the COACH above the bar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 820, height: 1106 });
  await openTestWallMap(page);
  await page.getByRole('button', { name: 'Start planning' }).click();
  await expect(stage(page)).toHaveAttribute('data-map', 'closed');
  await expect(page.locator('.play-narrow')).toHaveCount(1);
  const photo = (await page.locator('.play-taps').boundingBox())!;
  expect(photo.height, 'photo height').toBeGreaterThanOrEqual(570);
  const coach = (await page.getByRole('region', { name: 'Coach' }).boundingBox())!;
  const bar = (await page.locator('.play-bar').boundingBox())!;
  expect(coach.y + coach.height, 'COACH clear of the bar').toBeLessThanOrEqual(bar.y + 0.5);
  await inView(page, page.getByRole('region', { name: 'Coach' }), 'COACH');
});
