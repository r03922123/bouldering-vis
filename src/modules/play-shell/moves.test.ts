import {
  canRedo,
  canUndo,
  checkMove,
  createStanceCache,
  decodeBeta,
  redo,
  undo,
  type MoveCheck,
  type MoveContext,
  type Plan,
} from '../beta-moves';
import { betaText, SYNTHETIC } from './synthetic.fixture';
import {
  attempt,
  checkLast,
  contextFor,
  lastCheck,
  listTargets,
  reachGap,
  startPlan,
  targetLabel,
  verdictLine,
} from './play';

// SPEC-play-shell S6, S7, S12 and AC 2–4 on the synthetic route, with the referee's own verdicts.

vi.setConfig({ testTimeout: 60_000 });

const ctx = (contextFor(SYNTHETIC) as { value: MoveContext }).value;
const start = (): Plan => (startPlan(ctx) as { value: Plan }).value;
const cache = createStanceCache();

/** The reference beta starts on defaultStart; its first moves, by limb. */
const reference = decodeBeta(betaText('reference'), ctx)!;
const moveOf = (i: number) => {
  const [a, b] = [reference.steps[i - 1]!, reference.steps[i]!];
  return Object.fromEntries(
    (Object.keys(b) as (keyof typeof b)[]).filter((l) => a[l] !== b[l]).map((l) => [l, b[l]]),
  );
};

describe('attempt (S6)', () => {
  it('starts where the reference beta starts', () => {
    expect(start().beta.steps[0]).toEqual(reference.steps[0]);
  });

  it('commits a legal move: the plan grows by one and the check is the referee’s (AC 2)', () => {
    const plan = start();
    const out = attempt(plan, moveOf(1), ctx, cache);
    if (out.kind !== 'commit') throw new Error(out.kind);
    expect(out.plan.beta.steps).toHaveLength(2);
    expect(out.check).toEqual(checkMove(reference.steps[0]!, reference.steps[1]!, ctx));
    expect(verdictLine(ctx, out.check)).toBe('Left hand to 3: holds');
  });

  it('previews a fall and leaves the plan as it was (AC 3)', () => {
    const plan = start();
    const out = attempt(plan, { lh: 'synthetic-7' }, ctx, cache);
    if (out.kind !== 'preview') throw new Error(out.kind);
    expect(out.check.verdict).toBe('fall');
    expect(out.check.reason).toBe('Too far: left hand — move your feet up first');
    expect(verdictLine(ctx, out.check)).toBe(
      "Left hand to 7F: you'd fall. Too far: left hand — move your feet up first",
    );
    const gap = reachGap(ctx, out.check)!;
    expect(gap.limb).toBe('lh');
    expect(gap.to).toEqual({ x: 806.4, y: 143 });
    expect(plan.beta.steps).toHaveLength(1);
  });

  it('shows a shape rejection’s text, and nothing moves', () => {
    expect(attempt(start(), { lf: 'synthetic-7' }, ctx, cache)).toEqual({
      kind: 'rejected',
      text: 'The finish is for hands',
    });
    expect(attempt(start(), { rh: 'synthetic-2' }, ctx, cache)).toEqual({
      kind: 'rejected',
      text: 'Already there',
    });
  });
});

describe('Undo and Redo (S7, AC 4)', () => {
  it('after moves and previews, Undo restores the previous step’s assignment and stance exactly', () => {
    let plan = start();
    const checks: MoveCheck[] = [lastCheck(plan, ctx, cache)];
    for (const i of [1, 2, 3]) {
      // A preview between moves never touches the plan.
      expect(attempt(plan, { rh: 'synthetic-7' }, ctx, cache).kind).not.toBe('commit');
      const out = attempt(plan, moveOf(i), ctx, cache);
      if (out.kind !== 'commit') throw new Error(`move ${i}: ${out.kind}`);
      plan = out.plan;
      checks.push(out.check);
    }
    expect(plan.beta.steps).toEqual(reference.steps.slice(0, 4));
    for (const i of [2, 1, 0]) {
      expect(canUndo(plan)).toBe(true);
      plan = undo(plan);
      // A fresh cache: the restored stance is the referee's, not a remembered object.
      const restored = lastCheck(plan, ctx, createStanceCache());
      expect(restored.assignment).toEqual(checks[i]!.assignment);
      expect(restored.stance).toEqual(checks[i]!.stance);
    }
    expect(canUndo(plan)).toBe(false);
    expect(canRedo(plan)).toBe(true);
    plan = redo(plan);
    expect(lastCheck(plan, ctx, cache).stance).toEqual(checks[1]!.stance);
  });
});

describe('the DOM target list (S12)', () => {
  it('lists route holds by label, then wall footholds, then Smear and Let go for a foot', () => {
    const list = listTargets(ctx, 'lf', { x: 700.4, y: 860 });
    expect(list.slice(0, 7).map((t) => t.label)).toEqual(['1S', '2', '3', '4', '5', '6', '7F']);
    expect(list[7]).toEqual({ target: ctx.wallFeet[0]!.id, label: 'Wall foothold 1' });
    expect(list).toHaveLength(7 + ctx.wallFeet.length + 2);
    expect(list.at(-2)).toEqual({ target: 'smear:700:860', label: 'Smear' });
    expect(list.at(-1)).toEqual({ target: null, label: 'Let go' });
  });

  it('gives a hand the route holds and Let go only', () => {
    expect(listTargets(ctx, 'rh', null).map((t) => t.label)).toEqual([
      '1S',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7F',
      'Let go',
    ]);
  });

  it('names targets the way the list does', () => {
    expect(targetLabel(ctx, 'synthetic-3')).toBe('3');
    expect(targetLabel(ctx, ctx.wallFeet[4]!.id)).toBe('Wall foothold 5');
    expect(targetLabel(ctx, 'smear:1:2')).toBe('Smear');
    expect(targetLabel(ctx, null)).toBe('Let go');
  });
});

describe('checkLast (review finding 2)', () => {
  it('words a plan that names a hold the route no longer has, never throws', () => {
    const plan = start();
    const out = attempt(plan, moveOf(1), ctx, cache);
    if (out.kind !== 'commit') throw new Error(out.kind);
    const stale = {
      ...out.plan,
      beta: { steps: [...out.plan.beta.steps, { ...out.plan.beta.steps[1]!, lh: 'gone' }] },
    };
    expect(checkLast(stale, ctx, cache)).toEqual({ ok: false, error: 'That isn’t on this route' });
    expect(checkLast(out.plan, ctx, cache)).toEqual({ ok: true, value: out.check });
  });
});
