import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, openTestWall, openTestWallMap, test, TEST_LEVEL } from './testLevel';
import { openOwnTag } from './helpers';

// SPEC-play-shell › E2E (fake models, desktop and Pixel 7): the Play screen on the synthetic
// route (served as Wall 2's level). Every verdict here is beta-moves' own.

const stage = (page: Page) => page.getByRole('region', { name: 'Wall' });
const verdict = (page: Page) => page.locator('.play-verdict');

/**
 * Amendment (b) U3: on a phone the hint row, "List targets" and the tools are in the ☰ drawer over
 * the bottom bar. These open (or close) it; on a wide screen there is no drawer and they do
 * nothing, the controls being in the side panel already.
 */
async function setDrawer(page: Page, open: boolean) {
  const toggle = page.getByRole('button', { name: 'Hints and tools' });
  if (!(await toggle.count())) return;
  if ((await toggle.getAttribute('aria-expanded')) !== String(open)) await toggle.click();
}
/** U5: the target list is behind "List targets" (in the drawer on a phone). */
async function openTargets(page: Page) {
  await setDrawer(page, true);
  const b = page.getByRole('button', { name: 'List targets' });
  if ((await b.getAttribute('aria-expanded')) === 'false') await b.click();
}

/**
 * Presses Tab, and only Tab, until the focused element's name (aria-label, else its text) starts
 * with `name`. Fails if focus leaves the page on the way (to the body, as a headless browser
 * wraps round; a real one goes to its own toolbar): the control must come next in the page's
 * order, not round the back of it (private PR #15 review 5). (Tab from the body always lands on an
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

/** Non-clear pixels on the pixel layer: the climber is drawn. */
const pixelsDrawn = (page: Page) =>
  page
    .locator('canvas.px-layer')
    .first()
    .evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++;
      return n;
    });

test('AC 1: the wall opens on the start, the climber on it, shares adding up to 100', async ({
  page,
}) => {
  await openTestWall(page);
  await expect(stage(page)).toHaveAttribute('data-climber', 'shown');
  await expect(stage(page)).toHaveAttribute('data-moves', '0');
  await expect(verdict(page)).toHaveText('Start: Balanced: this position can be held');
  const loads = JSON.parse((await stage(page).getAttribute('data-loads'))!) as Record<
    string,
    number
  >;
  expect(Object.keys(loads).sort()).toEqual(['lf', 'lh', 'rf', 'rh']);
  const sum = Object.values(loads).reduce((s, v) => s + v, 0);
  expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.2);
  await expect.poll(() => pixelsDrawn(page)).toBeGreaterThan(100);
});

test('AC 12: Play fits a 375 × 740 phone, 44 px buttons, the wall in the top third', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await openTestWall(page);
  const wall = (await page.getByRole('img', { name: 'Wall photo' }).boundingBox())!;
  expect(wall.y).toBeLessThan(740 / 3);
  // With a foot picked, its target list is on screen too (behind "List targets", U5).
  await page.getByRole('group', { name: 'Moves' }).getByRole('button', { name: /^LF\b/ }).click();
  await openTargets(page);
  await expect(page.getByRole('region', { name: 'Targets for the left foot' })).toBeVisible();
  for (const b of await page.locator('.play button, .play a, .play summary').all()) {
    if (!(await b.isVisible())) continue;
    const box = (await b.boundingBox())!;
    expect(box.height, await b.innerText()).toBeGreaterThanOrEqual(44);
    expect(box.width, await b.innerText()).toBeGreaterThanOrEqual(44);
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

/** Taps the photo at an image point (the synthetic route's working image, 1536 × 1152). */
async function tapImage(page: Page, x: number, y: number) {
  const taps = page.locator('.play-taps');
  const d = await taps.evaluate((el: HTMLElement) => ({ ...el.dataset }));
  const [scale, tx, ty] = [Number(d.scale), Number(d.tx), Number(d.ty)];
  await taps.click({ position: { x: x * scale + tx, y: y * scale + ty } });
}

const limb = (page: Page, short: string) =>
  page
    .getByRole('group', { name: 'Moves' })
    .getByRole('button', { name: new RegExp(`^${short}\\b`) });
const assignment = async (page: Page) =>
  JSON.parse((await stage(page).getAttribute('data-assignment'))!) as Record<string, string | null>;

// Three moves from defaultStart: both feet onto wall footholds, then the left hand up to 3.
const MOVES = [
  { limb: 'LF', at: [726, 739], text: 'Left foot to Wall foothold 23: holds' },
  { limb: 'RF', at: [1125, 816], text: 'Right foot to Wall foothold 25: holds' },
  { limb: 'LH', at: [774.7, 464.6], text: 'Left hand to 3: holds' },
] as const;

test('AC 5 and 2: on the test level, three moves tapped on the photo, each the referee’s', async ({
  page,
}) => {
  await openTestWall(page);
  for (const [i, m] of MOVES.entries()) {
    await limb(page, m.limb).click();
    await expect(limb(page, m.limb)).toHaveAttribute('aria-pressed', 'true');
    await tapImage(page, m.at[0], m.at[1]);
    await expect(stage(page)).toHaveAttribute('data-moves', String(i + 1));
    await expect(verdict(page)).toHaveText(m.text);
    await expect(stage(page)).toHaveAttribute('data-verdict', 'hold');
  }
  expect(await assignment(page)).toEqual({
    lh: 'synthetic-3',
    rh: 'synthetic-2',
    lf: 'wf:726:739',
    rf: 'wf:1125:816',
  });
});

test('AC 3: a fall is a preview: the ghost and the reason show, and the plan is unchanged', async ({
  page,
}) => {
  await openTestWall(page);
  const before = await assignment(page);
  await limb(page, 'LH').click();
  await tapImage(page, 806.4, 143); // 7F, far out of reach from the start
  await expect(stage(page)).toHaveAttribute('data-preview', 'fall');
  await expect(verdict(page)).toHaveText(
    "Left hand to 7F: you'd fall. Too far: left hand — move your feet up first",
  );
  await expect(verdict(page)).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('.play-ghost canvas.px-layer')).toBeVisible();
  await expect(stage(page)).toHaveAttribute('data-moves', '0');
  expect(await assignment(page)).toEqual(before);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
});

test('AC 4: Undo restores the previous step exactly, after moves and a preview', async ({
  page,
}) => {
  await openTestWall(page);
  const steps = [await assignment(page)];
  for (const m of MOVES.slice(0, 2)) {
    await limb(page, m.limb).click();
    await tapImage(page, m.at[0], m.at[1]);
    await expect(verdict(page)).toHaveText(m.text);
    steps.push(await assignment(page));
  }
  await limb(page, 'LH').click();
  await tapImage(page, 806.4, 143);
  await expect(stage(page)).toHaveAttribute('data-preview', 'fall');
  for (const i of [1, 0]) {
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(stage(page)).toHaveAttribute('data-moves', String(i));
    expect(await assignment(page)).toEqual(steps[i]);
  }
  await expect(verdict(page)).toHaveText('Start: Balanced: this position can be held');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  await page.getByRole('button', { name: 'Redo' }).click();
  expect(await assignment(page)).toEqual(steps[1]);
});

test('AC 11: a whole move by keyboard, limb button then target list, with the verdict announced', async ({
  page,
}) => {
  await openTestWall(page);
  // Tab presses only, never a programmatic focus (private PR #15 review 5).
  await tabTo(page, 'LF');
  await page.keyboard.press('Enter');
  await expect(limb(page, 'LF')).toHaveAttribute('aria-pressed', 'true');
  // U5: "List targets" (in the ☰ drawer on a phone) opens the list, reached by Tab.
  if (await page.getByRole('button', { name: 'Hints and tools' }).count()) {
    await tabTo(page, 'Hints and tools');
    await page.keyboard.press('Enter');
  }
  await tabTo(page, 'List targets');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'List targets' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  const list = page.getByRole('region', { name: 'Targets for the left foot' });
  await expect(list).toBeVisible();
  // Tab forward through the tray into the list until "Wall foothold 23" has the focus.
  let found = false;
  for (let i = 0; i < 120 && !found; i++) {
    await page.keyboard.press('Tab');
    found = await page.evaluate(() => document.activeElement?.textContent === 'Wall foothold 23');
  }
  expect(found).toBe(true);
  await page.keyboard.press('Enter');
  await expect(stage(page)).toHaveAttribute('data-moves', '1');
  await expect(verdict(page)).toHaveText('Left foot to Wall foothold 23: holds');
  await expect(verdict(page)).toHaveAttribute('aria-live', 'polite');
});

test('K1 (amendment 2026-11-02, acceptance 1): Q/W/A/S and 1–4 pick limbs, Esc clears', async ({
  page,
}) => {
  await openTestWall(page);
  const pressed = async () => {
    const out: string[] = [];
    for (const l of ['LH', 'RH', 'LF', 'RF']) {
      if ((await limb(page, l).getAttribute('aria-pressed')) === 'true') out.push(l);
    }
    return out;
  };
  await expect(limb(page, 'LH').locator('kbd')).toHaveText('Q');
  await openTargets(page);
  await page.keyboard.press('a');
  await expect(page.getByRole('region', { name: 'Targets for the left foot' })).toBeVisible();
  // R0-1 (amendment 2026-11-03): a second limb is added on purpose, with Shift.
  await page.keyboard.press('Shift+4');
  expect(await pressed()).toEqual(['LF', 'RF']);
  await page.keyboard.press('Escape');
  await expect(limb(page, 'LF')).toHaveAttribute('aria-pressed', 'false');
  expect(await pressed()).toEqual([]);
  // A whole move from the keys: A picks the left foot, then the photo click places it (with the
  // phone's drawer closed, so the photo is in view).
  await setDrawer(page, false);
  await page.keyboard.press('a');
  await tapImage(page, 726, 739);
  await expect(verdict(page)).toHaveText('Left foot to Wall foothold 23: holds');
});

test('K2 (acceptance 2): the mouse outlines and names the click target, and the click commits it', async ({
  page,
}) => {
  await openTestWall(page);
  await limb(page, 'LH').click();
  const taps = page.locator('.play-taps');
  const d = await taps.evaluate((el: HTMLElement) => ({ ...el.dataset }));
  const [scale, tx, ty] = [Number(d.scale), Number(d.tx), Number(d.ty)];
  const box = (await taps.boundingBox())!;
  // Hold 3, a little off its centre: within the 24 px tap radius.
  const at = { x: box.x + (774.7 + 6) * scale + tx, y: box.y + (464.6 - 6) * scale + ty };
  await page.mouse.move(at.x, at.y);
  await expect(stage(page)).toHaveAttribute('data-hover', 'synthetic-3');
  await expect(page.locator('.play-hover-label')).toHaveText('3');
  await expect(stage(page)).toHaveAttribute('data-moves', '0');
  await page.mouse.click(at.x, at.y);
  await expect(stage(page)).toHaveAttribute('data-moves', '1');
  await expect(verdict(page)).toHaveText('Left hand to 3: holds');
  await expect(page.locator('.play-hover-label')).toHaveCount(0);
});

test('H1 (acceptance 3): "Hold directions" draws the referee’s pull on every route hold', async ({
  page,
}) => {
  await openTestWall(page);
  const layer = page.locator('svg.play-arrows[data-arrows]');
  await expect(layer).toHaveCount(0);
  await setDrawer(page, true);
  await page.getByRole('switch', { name: 'Hold directions' }).check();
  const arrows = JSON.parse((await layer.getAttribute('data-arrows'))!) as {
    id: string;
    dir: number[] | null;
  }[];
  // The synthetic route: 7 route holds; the pinches (2, 3, 4) have no single pull.
  expect(arrows).toHaveLength(7);
  expect(arrows.find((a) => a.id === 'synthetic-1')!.dir).toEqual([0, 1, 0]);
  expect(arrows.filter((a) => a.dir === null)).toHaveLength(3);
  // Drawn: exactly one thin arrow (Amendment (b) T1) per hold with an in-plane pull, less the
  // ones the badges leave no room for (named in data-dropped-arrows).
  const dropped = ((await layer.getAttribute('data-dropped-arrows')) ?? '')
    .split(',')
    .filter(Boolean);
  const inPlane = arrows.filter(
    (a) => a.dir && Math.hypot(a.dir[0]!, a.dir[1]!) >= 0.35 * Math.hypot(...a.dir),
  );
  expect(inPlane.map((a) => a.id).sort()).toEqual([
    'synthetic-1',
    'synthetic-5',
    'synthetic-6',
    'synthetic-7',
  ]);
  const drawnIds = await layer
    .locator('[data-kind="arrow"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-hold')!).sort());
  expect(drawnIds).toEqual(
    inPlane
      .map((a) => a.id)
      .filter((id) => !dropped.includes(id))
      .sort(),
  );
  // Never vacuous: at most one is dropped (hold 5, on a phone), so at least three are drawn.
  expect(dropped.length).toBeLessThanOrEqual(1);
  expect(drawnIds.length).toBeGreaterThanOrEqual(3);
  // Each arrow lies outside its hold's box (the level's boxes: 0.05 × climber height a side).
  const t = await page.locator('.play-taps').evaluate((el: HTMLElement) => ({ ...el.dataset }));
  const [scale, tx, ty] = [Number(t.scale), Number(t.tx), Number(t.ty)];
  const layerBox = (await layer.boundingBox())!;
  // From the file, since page.request bypasses page.route (e2e/wall1Level.ts).
  const level = JSON.parse(readFileSync(TEST_LEVEL, 'utf8')) as {
    height: number;
    holds: { id: string; centroid: { x: number; y: number } }[];
  };
  for (const id of drawnIds) {
    const h = level.holds.find((x) => x.id === id)!;
    const side = 0.05 * level.height * scale;
    const hold = {
      x: layerBox.x + h.centroid.x * scale + tx - side / 2,
      y: layerBox.y + h.centroid.y * scale + ty - side / 2,
      w: side,
      h: side,
    };
    const a = (await layer.locator(`[data-kind="arrow"][data-hold="${id}"]`).boundingBox())!;
    const overlaps =
      a.x < hold.x + hold.w &&
      hold.x < a.x + a.width &&
      a.y < hold.y + hold.h &&
      hold.y < a.y + a.height;
    expect(overlaps, `${id}'s arrow over its hold`).toBe(false);
  }
  await page.getByRole('switch', { name: 'Hold directions' }).uncheck();
  await expect(layer).toHaveCount(0);
});

test('H3 (acceptance 5): plausible holds is off by default, marks every target and never moves', async ({
  page,
}) => {
  await openTestWall(page);
  await limb(page, 'LH').click();
  await expect(page.locator('.play-plausible')).toHaveCount(0);
  await setDrawer(page, true);
  await page.getByRole('switch', { name: 'Plausible holds' }).check();
  const line = page.locator('.play-plausible');
  await expect(line).toHaveAttribute('data-done', 'true');
  // The count line is the marks counted, and the three counts add up to the total.
  await expect(line).toHaveText(/^\d+ targets?: \d+ hold · \d+ deadpoint · \d+ fall$/);
  const marks = JSON.parse((await line.getAttribute('data-marks'))!) as {
    label: string;
    kind: string;
  }[];
  const counts = (await line.innerText()).match(/\d+/g)!.map(Number);
  expect(counts[0]).toBe(marks.length);
  expect(counts[1]! + counts[2]! + counts[3]!).toBe(marks.length);
  // 7F is far out of reach from the start: the referee says it falls, as the preview would.
  expect(marks.find((m) => m.label === '7F')!.kind).toBe('falls');
  await expect(stage(page)).toHaveAttribute('data-moves', '0');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
});

test('D1 (acceptance 6): the coach window shows the referee’s words, can be skipped and paged', async ({
  page,
}) => {
  await openTestWall(page);
  const coach = page.getByRole('region', { name: 'Coach' });
  await expect(coach).toBeVisible();
  await expect(coach.locator('.play-coach-tag canvas')).toHaveAttribute('data-text', 'COACH');
  // Numbers on, so the fall has a second page (its breakdown) to page to.
  await setDrawer(page, true);
  await page.getByRole('switch', { name: 'Numbers' }).check();
  await setDrawer(page, false);
  await expect(coach).toHaveAttribute('data-revealed', 'all');
  await limb(page, 'LH').click();
  await tapImage(page, 806.4, 143); // 7F, a fall preview
  const full = "Left hand to 7F: you'd fall. Too far: left hand — move your feet up first";
  // The live region has the whole line at once; the box reveals it.
  await expect(verdict(page)).toHaveText(full);
  await coach.click({ position: { x: 20, y: 30 } });
  await expect(coach).toHaveAttribute('data-revealed', 'all');
  // R0-2 (amendment 2026-11-03): the reason is on the first page, with the verdict.
  await expect(coach).toHaveAttribute('data-page', '1');
  await expect(coach.locator('.play-coach-text')).toHaveText(full);
  await coach.getByRole('button', { name: 'Next coach line' }).click();
  await expect(coach).toHaveAttribute('data-page', '2');
  await page.keyboard.press('Enter');
  await expect(coach).toHaveAttribute('data-revealed', 'all');
  await expect(coach.locator('.play-coach-text')).toHaveText(/Contacts kept \d$/);
  await expect(verdict(page)).toHaveText(full);
});

test('D1: under reduced motion the coach shows each page at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openTestWall(page);
  await limb(page, 'LH').click();
  await tapImage(page, 806.4, 143);
  const coach = page.getByRole('region', { name: 'Coach' });
  await expect(coach.locator('.play-coach-text')).toHaveText(
    "Left hand to 7F: you'd fall. Too far: left hand — move your feet up first",
  );
  await expect(coach).toHaveAttribute('data-revealed', 'all');
});

/** A handle's centre on the page, and the base dot's, for a hold (E1 edit mode). */
async function handle(page: Page, hold: string, kind: 'head' | 'base') {
  const b = (await page.locator(`.play-dir-${kind}[data-hold="${hold}"]`).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
const edits = async (page: Page) =>
  JSON.parse((await stage(page).getAttribute('data-edits')) ?? '{}') as Record<
    string,
    { custom?: number[]; grip?: { x: number; y: number } }
  >;

test('E1 (acceptance 8): the direction map opens from Check directions, its arrows the referee’s dir', async ({
  page,
}) => {
  await openTestWallMap(page);
  await expect(
    page.getByRole('heading', { name: 'Do these directions look right?' }),
  ).toBeVisible();
  await expect(page.getByRole('group', { name: 'Moves' })).toHaveCount(0);
  const arrows = JSON.parse(
    (await page.locator('svg.play-arrows[data-arrows]').getAttribute('data-arrows'))!,
  ) as { id: string; dir: number[] | null }[];
  expect(arrows).toHaveLength(7);
  expect(arrows.find((a) => a.id === 'synthetic-1')!.dir).toEqual([0, 1, 0]);
  // The start is already the referee's: its verdict is announced under the map.
  await expect(verdict(page)).toHaveText('Start: Balanced: this position can be held');
});

test('E1 re-review 1: at 375 px, the map words the pull of a hold whose arrow has no room (7F)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await openTestWallMap(page);
  const layer = page.locator('svg.play-arrows[data-arrows]');
  await expect(layer).toHaveAttribute('data-dropped-arrows', /(^|,)synthetic-7(,|$)/);
  // On a phone the banner is compact: the words are behind "Pulls not drawn" (review suggestion).
  const toggle = page.getByRole('button', { name: /^Pulls not drawn/ });
  await expect(toggle).toHaveText('Pulls not drawn (1)');
  await toggle.click();
  const words = page.getByRole('list', { name: 'Pulls not drawn on the photo' });
  await expect(words).toContainText('Hold 7F: pulls down (180°)');
  // 5's arrow is drawn, so it isn't listed.
  await expect(layer.locator('[data-kind="arrow"][data-hold="synthetic-5"]')).toHaveCount(1);
  await expect(words).not.toContainText('Hold 5');
});

test('E1 re-review 1: on a wide screen every arrow fits, and no words list shows', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await openTestWallMap(page);
  await expect(page.locator('svg.play-arrows[data-arrows]')).not.toHaveAttribute(
    'data-dropped-arrows',
    /./,
  );
  await expect(page.getByRole('list', { name: 'Pulls not drawn on the photo' })).toHaveCount(0);
});

test('E1 (acceptance 9, 11): dragging an arrowhead sets the pull the referee uses; Reset restores it', async ({
  page,
}) => {
  await openTestWallMap(page);
  const before = await stage(page).getAttribute('data-loads');
  await page.getByRole('button', { name: 'Edit directions' }).click();
  const head = await handle(page, 'synthetic-1', 'head');
  const base = await handle(page, 'synthetic-1', 'base');
  await page.mouse.move(head.x, head.y);
  await page.mouse.down();
  await page.mouse.move(base.x - 20, base.y + 5, { steps: 4 });
  await page.mouse.move(base.x - 40, base.y, { steps: 4 });
  await page.mouse.up();
  const e = await edits(page);
  const d = e['synthetic-1']!.custom!;
  // Dragged to the left of the base: the pull now points left, still with no out-of-wall part.
  expect(d[0]).toBeLessThan(-0.98);
  expect(d[2]).toBeCloseTo(0, 3);
  // The hold list is in the side panel, or the ☰ drawer on a phone (Amendment (b) U4).
  await setDrawer(page, true);
  await expect(page.getByRole('slider', { name: 'Pull of hold 1S' })).toHaveAttribute(
    'aria-valuenow',
    /^(26\d|27\d)$/,
  );
  await expect(stage(page)).not.toHaveAttribute('data-loads', before!);
  await page.getByRole('button', { name: 'Reset hold 1S' }).click();
  await expect(stage(page)).not.toHaveAttribute('data-edits');
  await expect(stage(page)).toHaveAttribute('data-loads', before!);
});

test('E1 (acceptance 10): dragging the base dot moves the grip point, kept within the hold box', async ({
  page,
}) => {
  await openTestWallMap(page);
  await page.getByRole('button', { name: 'Edit directions' }).click();
  // Both handles are at least 44 px to grab, and clear of each other.
  for (const kind of ['base', 'head']) {
    const b = (await page.locator(`.play-dir-${kind}[data-hold="synthetic-5"]`).boundingBox())!;
    expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(44);
  }
  const base = await handle(page, 'synthetic-5', 'base');
  const head = await handle(page, 'synthetic-5', 'head');
  expect(Math.hypot(head.x - base.x, head.y - base.y)).toBeGreaterThanOrEqual(44);
  await page.mouse.move(base.x, base.y);
  await page.mouse.down();
  await page.mouse.move(base.x + 200, base.y - 200, { steps: 5 });
  await page.mouse.up();
  const g = (await edits(page))['synthetic-5']!.grip!;
  // Hold 5 at (1033.9, 332.2), clear of the other holds' handles even on a 375 px phone (1S's base
  // dot sits under hold 4's head handle there); its box is 0.05 × the climber's 399.4 px a side.
  const half = (0.05 * 399.4) / 2;
  expect(g.x).toBeGreaterThan(1033.9);
  expect(g.x).toBeLessThanOrEqual(1033.9 + half);
  expect(g.y).toBeLessThan(332.2);
  expect(g.y).toBeGreaterThanOrEqual(332.2 - half);
  // The hold list is in the side panel, or the ☰ drawer on a phone (Amendment (b) U4).
  await setDrawer(page, true);
  await expect(
    page.getByRole('button', { name: /^Grip point of hold 5: Grip: \d+ px right, \d+ px up/ }),
  ).toBeVisible();
});

test('E1 (acceptance 12): the whole edit flow by keyboard, then planning starts', async ({
  page,
}) => {
  await openTestWallMap(page);
  await page.getByRole('button', { name: 'Edit directions' }).focus();
  await page.keyboard.press('Enter');
  const pull = page.getByRole('slider', { name: 'Pull of hold 1S' });
  if (await page.getByRole('button', { name: 'Hints and tools' }).count()) {
    // A phone (review 7): the focus goes to the bar's edit actions, by the ☰ that opens the
    // hold list; Tab and Enter there, then Tab to the first hold's pull.
    await expect(page.getByRole('button', { name: 'Done' })).toBeFocused();
    await tabTo(page, 'Hints and tools');
    await page.keyboard.press('Enter');
    await tabTo(page, 'Pull of hold 1S');
  }
  // The focus is on the first hold's pull (wide: it goes there directly).
  await expect(pull).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(pull).toHaveAttribute('aria-valuenow', '195');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /^Grip point of hold 1S/ })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  expect((await edits(page))['synthetic-1']!.grip).toEqual({ x: 703.5, y: 584.6 });
  // Then the grip's four nudge buttons (review suggestion), then Reset.
  for (const dir of ['left', 'up', 'right', 'down']) {
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: `Move hold 1S’s grip ${dir}` })).toBeFocused();
  }
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Reset hold 1S' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(stage(page)).not.toHaveAttribute('data-edits');
  await page.getByRole('button', { name: 'Done' }).focus();
  await page.keyboard.press('Enter');
  await expect(stage(page)).toHaveAttribute('data-map', 'closed');
  await expect(limb(page, 'LH')).toBeFocused();
});

test('H2 (acceptance 4): 3D opens with the stance in it; no worker and no depth request before', async ({
  page,
}) => {
  // Workers made and the message types posted to them.
  await page.addInitScript(() => {
    const w = window as unknown as { __made: number; __sent: string[] };
    w.__made = 0;
    w.__sent = [];
    const Real = window.Worker;
    window.Worker = class extends Real {
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args);
        w.__made++;
      }
      postMessage(msg: unknown, ...rest: never[]) {
        const m = msg as { req?: { type?: string } } | null;
        if (typeof m?.req?.type === 'string') w.__sent.push(m.req.type);
        return super.postMessage(msg, ...rest);
      }
    } as typeof Worker;
  });
  const seen = () =>
    page.evaluate(() => {
      const w = window as unknown as { __made: number; __sent: string[] };
      return { made: w.__made, depth: w.__sent.filter((t) => t.startsWith('depth:')) };
    });
  await openTestWall(page);
  await limb(page, 'LF').click();
  await tapImage(page, 726, 739);
  await expect(verdict(page)).toHaveText('Left foot to Wall foothold 23: holds');
  expect(await seen()).toEqual({ made: 0, depth: [] });

  await setDrawer(page, true);
  await page.getByRole('button', { name: '3D', exact: true }).click();
  const panel = page.getByRole('region', { name: '3D view' });
  await expect(panel.getByText(/3D needs the depth model/)).toBeVisible();
  await expect(panel.locator('.play-3d-body')).toHaveAttribute('data-depth', 'ready');
  expect((await seen()).depth).toEqual(['depth:run']);
  const cloud = panel.getByRole('img', { name: '3D point cloud of the wall' });
  await expect(cloud).toBeVisible();
  await expect
    .poll(async () => Number(await cloud.getAttribute('data-point-count')))
    .toBeGreaterThan(0);
  // The plan is as it was: the 3D view is a hint, never a move.
  await expect(stage(page)).toHaveAttribute('data-moves', '1');
});

test('S10: Numbers mode on the start: the shares add up to 100', async ({ page }) => {
  // A pro started with Numbers on; with no level asked (W3, W5) it's turned on from Aids.
  await openTestWall(page);
  await setDrawer(page, true);
  await page.getByRole('switch', { name: 'Numbers' }).check();
  const panel = page.getByRole('region', { name: 'Numbers' });
  await expect(panel).toBeVisible();
  const shares = await panel
    .locator('dl > div')
    .filter({ hasText: / share/ })
    .locator('dd')
    .allTextContents();
  expect(shares).toHaveLength(4);
  const sum = shares.reduce((s, v) => s + Number(v.replace(' %', '')), 0);
  expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.2);
  await expect(panel.getByText('Contacts kept')).toBeVisible();
});

test('S8: a gym climber turns Numbers on from the Aids menu, and off again', async ({ page }) => {
  await openTestWall(page);
  await expect(page.getByRole('region', { name: 'Numbers' })).toHaveCount(0);
  await setDrawer(page, true);
  await page.getByRole('switch', { name: 'Numbers' }).check();
  await expect(page.getByRole('region', { name: 'Numbers' })).toBeVisible();
  await page.getByRole('switch', { name: 'Numbers' }).uncheck();
  await expect(page.getByRole('region', { name: 'Numbers' })).toHaveCount(0);
});

test('the plan survives a trip to the gym: back on the wall, the same 3 moves, stance and Undo', async ({
  page,
}) => {
  await openTestWall(page);
  for (const m of MOVES) {
    await limb(page, m.limb).click();
    await tapImage(page, m.at[0], m.at[1]);
    await expect(verdict(page)).toHaveText(m.text);
  }
  const before = await stage(page).evaluate((el: HTMLElement) => ({ ...el.dataset }));
  // Wall 2 has no "◀ Gym" (SPEC-launch-wall-2 R3): leave in-app by URL, return with Back.
  await page.evaluate(() => (window.location.hash = '#/gym'));
  await expect(page.getByRole('navigation', { name: 'Gym' })).toBeVisible();
  await page.goBack();
  await expect(stage(page)).toHaveAttribute('data-moves', '3');
  const after = await stage(page).evaluate((el: HTMLElement) => ({ ...el.dataset }));
  expect(after.assignment).toBe(before.assignment);
  expect(after.loads).toBe(before.loads);
  await expect(verdict(page)).toHaveText('Left hand to 3: holds');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(stage(page)).toHaveAttribute('data-moves', '2');
});

test('a baked level never prepares the segmentation model; Tag does (load on demand)', async ({
  page,
}) => {
  // Every message the page posts to a worker, by type.
  await page.addInitScript(() => {
    const sent: string[] = [];
    (window as unknown as { __workerTypes: string[] }).__workerTypes = sent;
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, msg: unknown, ...rest: never[]) {
      const m = msg as { type?: string; req?: { type?: string } } | null;
      const type = m?.req?.type ?? m?.type;
      if (typeof type === 'string') sent.push(type);
      return post.call(this, msg, ...rest);
    } as typeof Worker.prototype.postMessage;
  });
  const sam = () =>
    page.evaluate(() =>
      (window as unknown as { __workerTypes: string[] }).__workerTypes.filter((t) =>
        t.startsWith('sam:'),
      ),
    );
  await openTestWall(page);
  for (const m of MOVES) {
    await limb(page, m.limb).click();
    await tapImage(page, m.at[0], m.at[1]);
    await expect(verdict(page)).toHaveText(m.text);
  }
  expect(await sam()).toEqual([]);
  // An own photo has no level: it opens in Tag, which prepares SAM for the hold taps. In-app, so
  // the page that played the baked level is the one that must start SAM. Wall 2 has no "◀ Gym"
  // (R3), so the trip to the gym is by URL, still without a reload.
  await page.evaluate(() => (window.location.hash = '#/gym'));
  await openOwnTag(page);
  await expect(page.getByRole('button', { name: 'Plan this route' })).toBeVisible();
  await expect.poll(sam).toContain('sam:embed');
});
