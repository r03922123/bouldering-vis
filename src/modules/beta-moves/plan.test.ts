import { checkBeta } from './beta';
import { createStanceCache } from './cache';
import { checkStart } from './check';
import { applyStep, canRedo, canUndo, editStart, newPlan, redo, undo } from './plan';
import { defaultStart } from './start';
import {
  ladder,
  ladderStart,
  moveTo,
  sloperLadder,
  step,
  LADDER_TOP,
  LADDER_TOP_FEET,
} from './fixtures';
import { HISTORY_LIMIT, type Plan, type StepOutcome } from './types';

vi.setConfig({ testTimeout: 60_000 });

const ids = () => crypto.randomUUID();
const ctx = ladder({ ids, wallFeet: LADDER_TOP_FEET });
const id = (label: string) => step(ctx, { lh: label }).lh;
const planOf = (o: StepOutcome) => o.plan;
/** One limb onto a target written by label. */
const to = (limb: 'lh' | 'rh' | 'lf' | 'rf', t: string | null) => ({
  [limb]: step(ctx, { [limb]: t })[limb],
});
const rejected = (o: StepOutcome) => ('rejected' in o ? o.rejected : null);

/** n foot shuffles (rf between 9 and 11) from the start: every one holds. */
function shuffled(n: number, cache = createStanceCache()) {
  let plan = newPlan(ctx);
  const outs: Plan[] = [plan];
  for (let i = 0; i < n; i++) {
    const last = plan.beta.steps.at(-1)!;
    const o = applyStep(plan, moveTo(last, { rf: i % 2 ? id('9') : id('11') }), ctx, cache);
    expect('check' in o && o.check.verdict).toBe('hold');
    plan = o.plan;
    outs.push(plan);
  }
  return { plan, outs };
}

describe('history (AC 25, 27)', () => {
  it('starts at the default start with nothing to undo or redo', () => {
    const p = newPlan(ctx);
    expect(p).toEqual({ beta: { steps: [defaultStart(ctx)] }, past: [], future: [] });
    expect(canUndo(p)).toBe(false);
    expect(canRedo(p)).toBe(false);
    expect(undo(p)).toBe(p);
    expect(redo(p)).toBe(p);
  });

  it('N undos go back to the start and N redos replay the plan', () => {
    const cache = createStanceCache();
    const n = 30;
    const { plan } = shuffled(n, cache);
    expect(plan.beta.steps).toHaveLength(n + 1);
    let p = plan;
    for (let i = 0; i < n; i++) p = undo(p);
    // newPlan's beta and past; `future` holds the n steps Redo replays.
    expect(p.beta).toEqual(newPlan(ctx).beta);
    expect(p.past).toEqual([]);
    expect(p.future).toHaveLength(n);
    expect(canRedo(p)).toBe(true);
    for (let i = 0; i < n; i++) p = redo(p);
    expect(p).toEqual(plan);
  });

  it('a new step after an undo empties the future', () => {
    const { plan } = shuffled(3);
    const back = undo(undo(plan));
    expect(back.future).toHaveLength(2);
    const o = applyStep(back, moveTo(back.beta.steps.at(-1)!, { rh: id('4') }), ctx);
    expect(o.plan.future).toEqual([]);
    expect(canUndo(o.plan)).toBe(true);
  });

  it('keeps at most 200 betas in the past, dropping the oldest', () => {
    const { plan, outs } = shuffled(HISTORY_LIMIT + 5);
    expect(plan.past).toHaveLength(HISTORY_LIMIT);
    expect(plan.past[0]).toEqual(outs[5]!.beta);
  });
});

describe('undo is served from the cache (AC 26)', () => {
  it('re-checks the undone plan with 0 misses and the same result', () => {
    const cache = createStanceCache();
    let plan = newPlan(ctx);
    for (const [limb, t] of LADDER_TOP.slice(0, 4)) {
      plan = applyStep(plan, moveTo(plan.beta.steps.at(-1)!, to(limb, t)), ctx, cache).plan;
    }
    const before = checkBeta(plan.beta, ctx, cache);
    const next = applyStep(plan, moveTo(plan.beta.steps.at(-1)!, { rh: id('6') }), ctx, cache).plan;
    checkBeta(next.beta, ctx, cache);
    const misses = cache.misses;
    expect(checkBeta(undo(next).beta, ctx, cache)).toEqual(before);
    expect(cache.misses).toBe(misses);
  });
});

describe('editing the start (AC 28)', () => {
  it('changes the start (any number of limbs) and is undoable', () => {
    const p = newPlan(ctx);
    const s = step(ctx, { lh: '2S', rh: '1S', lf: 'wf:420:1250', rf: null });
    const o = editStart(p, s, ctx);
    expect('check' in o && o.check.move).toBeNull();
    expect(o.plan.beta.steps).toEqual([s]);
    expect(undo(o.plan).beta).toEqual(p.beta);
  });

  it('is locked once a move is made', () => {
    const p = applyStep(newPlan(ctx), moveTo(ladderStart(ctx), { rh: id('4') }), ctx).plan;
    const o = editStart(p, ladderStart(ctx), ctx);
    expect(rejected(o)).toEqual({
      ok: false,
      reason: 'start-locked',
      text: 'Undo back to the start to change it',
    });
    expect(o.plan).toBe(p);
  });

  it('rejects a shape-invalid start', () => {
    const p = newPlan(ctx);
    expect(rejected(editStart(p, step(ctx, { lh: '3', rh: '4' }), ctx))?.reason).toBe(
      'start-hands',
    );
  });

  it('after a start that can’t be held: editing is allowed, moving is not', () => {
    const c = sloperLadder(ids, 35);
    const bad = step(c, { lh: '1S', rh: '2S', lf: 'smear:290:1580', rf: 'smear:710:1580' });
    const p = newPlan(c, bad);
    const o = applyStep(p, moveTo(bad, { rf: null }), c);
    // SPEC-play-shell › Amendment 2026-11-03 R0-3 (c): the start text says why, in the solver's
    // words (it said only "change it first", which names no action).
    const why = checkStart(bad, c).reason!;
    expect(why).toMatch(/sloper/);
    expect(rejected(o)).toEqual({
      ok: false,
      reason: 'fallen',
      text: `This start can’t be held: ${why}`,
    });
    expect(o.plan).toBe(p);
    const fixed = editStart(p, moveTo(bad, { lf: 'smear:300:1580' }), c);
    expect('check' in fixed).toBe(true);
  });
});

describe('after a fall or a top (AC 29)', () => {
  it('a committed fall ends the plan', () => {
    const p = newPlan(ctx);
    const fell = applyStep(p, moveTo(ladderStart(ctx), { rh: id('7F') }), ctx);
    expect('check' in fell && fell.check.verdict).toBe('fall');
    expect(fell.plan.beta.steps).toHaveLength(2);
    const again = applyStep(fell.plan, moveTo(fell.plan.beta.steps[1]!, { lh: id('3') }), ctx);
    expect(rejected(again)).toEqual({
      ok: false,
      reason: 'fallen',
      text: 'You’re off the wall — Undo to try again',
    });
    expect(again.plan).toEqual(fell.plan);
    // Undo takes the fall back.
    expect(undo(fell.plan).beta).toEqual(p.beta);
  });

  it('a top ends the plan', () => {
    let plan = newPlan(ctx);
    let last: StepOutcome | null = null;
    for (const [limb, t] of LADDER_TOP) {
      last = applyStep(plan, moveTo(plan.beta.steps.at(-1)!, to(limb, t)), ctx);
      plan = last.plan;
    }
    expect(last && 'check' in last && last.check.verdict).toBe('top');
    const o = applyStep(plan, moveTo(plan.beta.steps.at(-1)!, { rf: null }), ctx);
    expect(rejected(o)).toEqual({ ok: false, reason: 'topped', text: 'Topped out!' });
    expect(o.plan).toEqual(plan);
  });
});

describe('shape rejections at the plan level (AC 2)', () => {
  it('three limbs at once: too-many-limbs, and the plan is unchanged', () => {
    const p = newPlan(ctx);
    const o = applyStep(
      p,
      moveTo(ladderStart(ctx), { lh: id('3'), rh: id('4'), lf: 'wf:420:1250' }),
      ctx,
    );
    expect(rejected(o)).toEqual({
      ok: false,
      reason: 'too-many-limbs',
      text: 'Move one or two limbs at a time',
    });
    expect(planOf(o)).toEqual(p);
  });

  it('a move that changes nothing: Already there', () => {
    const p = newPlan(ctx);
    expect(rejected(applyStep(p, ladderStart(ctx), ctx))?.text).toBe('Already there');
  });
});
