import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// SPEC-launch-wall-2, success criterion 1: Wall 2 opens on the setter's start and a player can
// climb it to the top, every verdict the referee's own. The level and photo are the shipped ones.

interface Level {
  holds: { id: string; label: string }[];
  wallFeet: { id: string }[];
  start: Record<string, string>;
}
const level = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'public', 'levels', 'wall-b.json'), 'utf8'),
) as Level;

/** The 12-move top from src/app/wall2Level.test.ts, as encodeBeta writes it (lh,rh,lf,rf). */
const TOP =
  '3S,4S,2,1;3S,5,2,1;3S,5,wf:289:705,1;6,5,wf:289:705,1;6,5,wf:289:705,wf:259:753;' +
  '6,9,wf:289:705,wf:259:753;6,9,2,wf:259:753;6,7,2,wf:259:753;6,7,9,wf:259:753;' +
  '6,7,9,wf:201:667;10,7,9,wf:201:667;10,11F,9,wf:201:667;11F,11F,9,wf:201:667';
const LIMBS = ['lh', 'rh', 'lf', 'rf'] as const;
const SHORT = { lh: 'LH', rh: 'RH', lf: 'LF', rf: 'RF' } as const;
const byLabel = new Map(level.holds.map((h) => [h.label, h]));
const idOf = (t: string) => (t.startsWith('wf:') ? t : byLabel.get(t)!.id);
/** The target list's name for a target (play-shell's targetText): a label or "Wall foothold n". */
const nameOf = (t: string) =>
  t.startsWith('wf:') ? `Wall foothold ${level.wallFeet.findIndex((f) => f.id === t) + 1}` : t;
const steps = TOP.split(';').map((s) => s.split(','));
/** Each move: the one limb that changes, where it goes, and the assignment after it. */
const MOVES = steps.slice(1).map((step, i) => {
  const l = LIMBS.findIndex((_, k) => step[k] !== steps[i]![k]);
  const limb = LIMBS[l]!;
  return {
    limb,
    target: nameOf(step[l]!),
    after: Object.fromEntries(LIMBS.map((k, j) => [k, idOf(step[j]!)])),
  };
});

const stage = (page: Page) => page.getByRole('region', { name: 'Wall' });
const assignment = async (page: Page) =>
  JSON.parse((await stage(page).getAttribute('data-assignment'))!) as Record<string, string>;
const limbButton = (page: Page, short: string) =>
  page
    .getByRole('group', { name: 'Moves' })
    .getByRole('button', { name: new RegExp(`^${short}\\b`) });
/**
 * Picks a target from the list (U5; in the ☰ drawer on a phone). Exact on every screen, where a
 * tap on a phone can land on a neighbouring foothold a few screen px away.
 */
async function pickTarget(page: Page, name: string) {
  const drawer = page.getByRole('button', { name: 'Hints and tools' });
  if ((await drawer.count()) && (await drawer.getAttribute('aria-expanded')) !== 'true')
    await drawer.click();
  const list = page.getByRole('button', { name: 'List targets' });
  if ((await list.getAttribute('aria-expanded')) !== 'true') await list.click();
  await page
    .getByRole('region', { name: /^Targets for/ })
    .getByRole('button', { name, exact: true })
    .click();
}

test("Wall 2: from the setter's start to the top", async ({ page }) => {
  await page.goto('/');
  // A baked level opens in Plan, never Tag, on the setter's start, which holds.
  await expect(stage(page)).toHaveAttribute('data-verdict', 'hold', { timeout: 30_000 });
  expect(await assignment(page)).toEqual(level.start);
  // R7: straight to the tray, no direction check first.
  await expect(stage(page)).toHaveAttribute('data-map', 'closed');

  for (const [i, m] of MOVES.entries()) {
    await limbButton(page, SHORT[m.limb]).click();
    await pickTarget(page, m.target);
    await expect(stage(page)).toHaveAttribute('data-moves', String(i + 1));
    expect(await assignment(page)).toEqual(m.after);
    const last = i === MOVES.length - 1;
    await expect(stage(page)).toHaveAttribute('data-verdict', last ? 'top' : 'hold');
  }
});
