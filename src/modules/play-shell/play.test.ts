import {
  checkStart,
  createStanceCache,
  DEFAULT_RULES,
  defaultStart,
  type BetaStep,
  type MoveContext,
} from '../beta-moves';
import { SYNTHETIC } from './synthetic.fixture';
import {
  BALANCED,
  boxAt,
  climberFor,
  contextFor,
  lastCheck,
  moodOf,
  startPlan,
  startVerdict,
  targetPoint,
} from './play';

// SPEC-play-shell S4, S5, S11 on the synthetic route.

const built = contextFor(SYNTHETIC);
const ctx = (built as { value: MoveContext }).value;

describe('contextFor (S4)', () => {
  it('builds the referee context from the level, with DEFAULT_RULES', () => {
    expect(built.ok).toBe(true);
    expect(ctx.rules).toEqual(DEFAULT_RULES);
    expect(ctx.height).toBe(399.4);
    expect(ctx.holds.map((h) => h.label)).toEqual(['1S', '2', '3', '4', '5', '6', '7F']);
  });

  it('keeps the referee input identical to the level’s route holds', () => {
    expect(ctx.holds).toEqual([...SYNTHETIC.holds].sort((a, b) => a.order - b.order));
    expect(ctx.wallFeet).toEqual(SYNTHETIC.wallFeet);
  });

  it('gives makeContext’s reason in words for a route that isn’t ready', () => {
    const r = contextFor({
      ...SYNTHETIC,
      holds: SYNTHETIC.holds.filter((h) => h.role !== 'finish'),
    });
    expect(r).toEqual({ ok: false, error: 'Tag 1–2 start holds and 1 finish' });
  });
});

describe('the start (S5)', () => {
  it('starts on defaultStart, which holds, with shares adding up to 100', () => {
    const plan = startPlan(ctx);
    if (!plan.ok) throw new Error(plan.error);
    const check = lastCheck(plan.value, ctx, createStanceCache());
    expect(check).toEqual(checkStart(plan.value.beta.steps[0]!, ctx));
    expect(check.verdict).toBe('hold');
    const sum = Object.values(check.loads).reduce((s, v) => s + v, 0);
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.2);
    expect(startVerdict(check)).toBe(`Start: ${BALANCED}`);
  });

  it('words a start that can’t be held with the solver’s reason', () => {
    const plan = startPlan(ctx);
    if (!plan.ok) throw new Error(plan.error);
    const check = lastCheck(plan.value, ctx, createStanceCache());
    const fall = { ...check, verdict: 'fall' as const, reason: 'Barn door: you’d swing off' };
    expect(startVerdict(fall)).toBe('Start: Barn door: you’d swing off');
  });
});

describe("the setter's start (SPEC-launch-wall-2)", () => {
  const first = (start?: BetaStep) => {
    const plan = startPlan(ctx, null, start);
    if (!plan.ok) throw new Error(plan.error);
    return plan.value.beta.steps[0];
  };
  const auto = defaultStart(ctx);

  it("starts on the level's start when it holds, feet included", () => {
    const setter = { ...auto, lf: 'wf:726:739' };
    expect(checkStart(setter, ctx).verdict).toBe('hold');
    expect(first(setter)).toEqual(setter);
  });

  it('falls back to defaultStart for a start the referee calls a fall', () => {
    const falls = { ...auto, lf: 'wf:372:101' };
    expect(checkStart(falls, ctx).verdict).toBe('fall');
    expect(first(falls)).toEqual(auto);
  });

  it("falls back to defaultStart for a start naming a hold the route doesn't have", () => {
    expect(first({ ...auto, lh: 'no-such-hold' })).toEqual(auto);
  });

  it('checks the start once: given the cache, the first verdict is a cache hit', () => {
    const setter = { ...auto, lf: 'wf:726:739' };
    const cache = createStanceCache();
    const plan = startPlan(ctx, null, setter, cache);
    if (!plan.ok) throw new Error(plan.error);
    const misses = cache.misses;
    lastCheck(plan.value, ctx, cache);
    expect(cache.misses).toBe(misses);
  });
});

describe('what the pixel layer draws (S11)', () => {
  const plan = startPlan(ctx);
  if (!plan.ok) throw new Error(plan.error);
  const check = lastCheck(plan.value, ctx, createStanceCache());

  it('draws the climber from the stance joints, gripping with each hand on a hold', () => {
    const c = climberFor(check, ctx, moodOf(check), 'lh')!;
    expect(c.heightPx).toBe(ctx.height);
    expect(c.mood).toBe('ok');
    expect(c.selected).toBe('lh');
    expect(c.gripping).toEqual({ lh: true, rh: true, lf: false, rf: false });
    const [x, y, z] = check.stance.joints!.lHand;
    expect(c.joints.lHand).toEqual({ x, y, z });
  });

  it('draws nothing when the solver gave no joints', () => {
    const noJoints = { ...check, stance: { ...check.stance, joints: null } };
    expect(climberFor(noJoints, ctx, 'ok', null)).toBeNull();
  });

  it('picks the mood from the verdict and style', () => {
    expect(moodOf(check)).toBe('ok');
    expect(moodOf({ ...check, style: 'deadpoint' })).toBe('strain');
    expect(moodOf({ ...check, verdict: 'fall' })).toBe('fail');
  });

  it('places targets: holds, wall feet and smears; off has no point', () => {
    expect(targetPoint(ctx, 'synthetic-3')).toEqual({ x: 774.7, y: 464.6 });
    expect(targetPoint(ctx, 'wf:922:786')).toEqual({ x: 922, y: 786 });
    expect(targetPoint(ctx, 'smear:10:20')).toEqual({ x: 10, y: 20 });
    expect(targetPoint(ctx, null)).toBeNull();
    expect(targetPoint(ctx, 'nowhere')).toBeNull();
    const box = boxAt(ctx, { x: 100, y: 200 });
    expect(box.x + box.w / 2).toBeCloseTo(100, 9);
    expect(box.y + box.h / 2).toBeCloseTo(200, 9);
  });
});
