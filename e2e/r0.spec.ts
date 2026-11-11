import type { Page } from '@playwright/test';
import { expect, openTestWall, openTestWallMap, test } from './testLevel';

// SPEC-play-shell › Amendment 2026-11-03 R0 (the playtest fixes), E2E on the test level, desktop and a
// 375 × 740 phone: keyboard-only arming (R0-1), the fall reason on the first visible page and the
// phone's COACH strip opening for it (R0-2), and the goal from the first frame (R0-4).

const stage = (page: Page) => page.getByRole('region', { name: 'Wall' });
const verdict = (page: Page) => page.locator('.play-verdict');
const coach = (page: Page) => page.getByRole('region', { name: 'Coach' });
const limb = (page: Page, short: string) =>
  page
    .getByRole('group', { name: 'Moves' })
    .getByRole('button', { name: new RegExp(`^${short}\\b`) });
const FALL = "Left hand to 7F: you'd fall. Too far: left hand — move your feet up first";

/** Taps the photo at an image point (the synthetic route's working image, 1536 × 1152). */
async function tapImage(page: Page, x: number, y: number) {
  const taps = page.locator('.play-taps');
  const d = await taps.evaluate((el: HTMLElement) => ({ ...el.dataset }));
  const [scale, tx, ty] = [Number(d.scale), Number(d.tx), Number(d.ty)];
  await taps.click({ position: { x: x * scale + tx, y: y * scale + ty } });
}

async function pressed(page: Page) {
  const out: string[] = [];
  for (const l of ['LH', 'RH', 'LF', 'RF']) {
    if ((await limb(page, l).getAttribute('aria-pressed')) === 'true') out.push(l);
  }
  return out;
}

/** Tab, and only Tab, until the focused element's name starts with `name` (as play.spec). */
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

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(
    test.info().project.name === 'phone'
      ? { width: 375, height: 740 }
      : { width: 1280, height: 800 },
  );
});

test('R0-1 (acceptance 1): keyboard-only arming: a key replaces, Shift adds, Esc clears', async ({
  page,
}) => {
  // From load (a baked level opens on the tray, R7): Tab to LH, to LF and back is the keyboard
  // path; Enter on LH, then the keys alone.
  await openTestWall(page);
  await tabTo(page, 'LH');
  await expect(limb(page, 'LH')).toBeFocused();
  await tabTo(page, 'LF');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(limb(page, 'LH')).toBeFocused();
  await page.keyboard.press('Enter');
  expect(await pressed(page)).toEqual(['LH']);
  await page.keyboard.press('w');
  expect(await pressed(page)).toEqual(['RH']);
  await expect(page.locator('.play-hint')).toHaveText('Moving: right hand — tap a hold');
  await page.keyboard.press('w');
  expect(await pressed(page)).toEqual(['RH']);
  await page.keyboard.press('Shift+A');
  expect(await pressed(page)).toEqual(['RH', 'LF']);
  await page.keyboard.press('Escape');
  expect(await pressed(page)).toEqual([]);
  // "+ limb", by Tab and Enter, then Q and W: both hands.
  await page.keyboard.press('q');
  await tabTo(page, '+ limb');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '+ limb' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('w');
  expect(await pressed(page)).toEqual(['LH', 'RH']);
});

test('R0-1 (acceptance 1): after a fall preview with RH armed, A arms only LF and a tap moves it', async ({
  page,
}) => {
  await openTestWall(page);
  await page.keyboard.press('w');
  await tapImage(page, 806.4, 143); // 7F, out of reach
  await expect(stage(page)).toHaveAttribute('data-preview', 'fall');
  expect(await pressed(page)).toEqual(['RH']);
  await page.keyboard.press('a');
  expect(await pressed(page)).toEqual(['LF']);
  await tapImage(page, 726, 739); // Wall foothold 23
  await expect(stage(page)).toHaveAttribute('data-moves', '1');
  await expect(verdict(page)).toHaveText('Left foot to Wall foothold 23: holds');
});

test('R0-1 (acceptance 1): a foot tap on bare wall says "No foothold there for that foot"', async ({
  page,
}) => {
  await openTestWall(page);
  await page.keyboard.press('a');
  await tapImage(page, 100, 1100);
  await expect(page.locator('.play-hint')).toContainText('No foothold there for that foot');
  await expect(stage(page)).toHaveAttribute('data-moves', '0');
  // Review 1: the spot stays one deliberate press away; the referee decides what it does there.
  await page.getByRole('button', { name: 'Smear here' }).click();
  await expect(limb(page, 'LF')).toBeFocused();
  await expect(verdict(page)).toHaveText(/^Left foot to Smear: /);
});

test('R0-2 (acceptance 2): a fall shows its reason on the first visible page, with no click', async ({
  page,
}) => {
  await openTestWall(page);
  await page.keyboard.press('q');
  await tapImage(page, 806.4, 143);
  await expect(stage(page)).toHaveAttribute('data-preview', 'fall');
  // The letters reveal by themselves; nothing is clicked.
  await expect(coach(page)).toHaveAttribute('data-revealed', 'all');
  await expect(coach(page)).toHaveAttribute('data-page', '1');
  await expect(coach(page)).not.toHaveAttribute('data-strip');
  const text = coach(page).locator('.play-coach-text');
  await expect(text).toHaveText(FALL);
  await expect(text).toBeInViewport();
  // Arming another limb keeps it, as the last try (review 10: its ghost goes); Esc replaces it.
  await page.keyboard.press('w');
  await expect(text).toHaveText(`Last try: ${FALL}`);
  await expect(page.locator('.play-ghost')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(verdict(page)).toHaveText('Start: Balanced: this position can be held');
});

test('R0-2: on a phone the COACH strip opens by itself on a fall, and folds back after', async ({
  page,
}) => {
  test.skip(test.info().project.name !== 'phone', 'the strip is the phone layout (U3)');
  await openTestWall(page);
  await expect(coach(page)).toHaveAttribute('data-strip', 'true');
  await page.keyboard.press('q');
  await tapImage(page, 806.4, 143);
  await expect(coach(page)).not.toHaveAttribute('data-strip');
  await expect(coach(page).locator('.play-coach-text')).toHaveText(FALL);
  // Review 3: folded, then the same blocked hold again: it opens again and the words come again.
  await coach(page)
    .getByRole('button', { name: /one line/ })
    .click();
  await expect(coach(page)).toHaveAttribute('data-strip', 'true');
  await tapImage(page, 806.4, 143);
  await expect(coach(page)).not.toHaveAttribute('data-strip');
  await expect(coach(page)).toHaveAttribute('data-attempt', '2');
  await page.keyboard.press('Escape');
  await expect(coach(page)).toHaveAttribute('data-strip', 'true');
});

test('R0-4 (acceptance 4): before any move, "both hands on 7F" is on screen, first', async ({
  page,
}) => {
  await openTestWallMap(page);
  const goal = page.getByRole('banner').locator('.play-goal');
  await expect(goal).toBeVisible();
  await expect(goal).toBeInViewport();
  await expect(goal).toContainText('both hands on 7F');
  // The COACH's first page is the goal.
  await expect(coach(page)).toHaveAttribute('data-page', '1');
  await expect(coach(page).locator('.play-coach-text')).toHaveText('Goal: both hands on 7F');
  // Read as "Goal: both hands on 7F", and before the verdict and the pad in the page's order.
  const order = await page.evaluate(() => {
    const g = document.querySelector('.play-goal')!;
    const read = g.cloneNode(true) as Element;
    read.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
    const live = document.querySelector('.play-verdict')!;
    return {
      read: read.textContent!.replace(/\s+/g, ' ').trim(),
      beforeLive: !!(g.compareDocumentPosition(live) & Node.DOCUMENT_POSITION_FOLLOWING),
    };
  });
  expect(order).toEqual({ read: 'Goal: both hands on 7F', beforeLive: true });
  await page.getByRole('button', { name: 'Start planning' }).click();
  await expect(goal).toBeInViewport();
  // No horizontal scroll at 375 px with the goal in the header.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test('review 11: on the direction check, a limb key or a wall tap says to press Start planning', async ({
  page,
}) => {
  await openTestWallMap(page);
  const nudge = stage(page)
    .getByRole('region', { name: 'Do these directions look right?' })
    .getByRole('status');
  await expect(nudge).toHaveText('');
  await page.keyboard.press('q');
  await expect(nudge).toHaveText('Press Start planning to climb');
  await page.getByRole('button', { name: 'Start planning' }).click();
  await expect(stage(page)).toHaveAttribute('data-map', 'closed');
  expect(await pressed(page)).toEqual([]);
});
