import { solveStance, type StanceContacts } from '../climber-stance';
import { checkMove, checkStart, tooCramped, tooHigh } from './check';
import { contactsOf } from './contacts';
import { makeContext } from './context';
import {
  barnDoor,
  ladder,
  ladderHolds,
  LADDER_PHOTO,
  ladderStart,
  moveTo,
  routeHold,
  sloperLadder,
  step,
} from './fixtures';
import { createStanceCache } from './cache';
import type { BetaStep, MoveCheck, MoveContext } from './types';

// Solver-backed checks are slow on a loaded machine; correctness, not speed, is tested here.
vi.setConfig({ testTimeout: 60_000 });

const ids = () => crypto.randomUUID();
const round1 = (x: number) => Math.round(x * 10) / 10;
const solve = (contacts: StanceContacts, ctx: MoveContext) =>
  solveStance(contacts, { height: ctx.height, wallAngleDeg: ctx.wallAngleDeg, region: false });
const kept = (prev: BetaStep, next: BetaStep, ctx: MoveContext): StanceContacts => {
  const c = contactsOf(prev, ctx);
  return Object.fromEntries(
    (['lh', 'rh', 'lf', 'rf'] as const).flatMap((l) =>
      prev[l] !== null && prev[l] === next[l] ? [[l, c[l]]] : [],
    ),
  );
};
const maxHandPercent = (c: MoveCheck) =>
  Math.max(0, ...(['lh', 'rh'] as const).map((l) => c.stance.load[l]?.percent ?? 0));
const loadSum = (c: MoveCheck) => Object.values(c.loads).reduce((s, v) => s + v!, 0);
const oneDecimal = (x: number) => Math.abs(x * 10 - Math.round(x * 10)) < 1e-9;

const ctx = ladder({ ids, wallFeet: [{ id: 'wf:300:1450', point: [300, 1450] }] });
const start = ladderStart(ctx);
const id = (c: MoveContext, label: string) => step(c, { lh: label }).lh;

describe('contacts kept (AC 7)', () => {
  it('keeps 3 on a one-limb move and 2 on a two-limb move from the 4-contact start', () => {
    expect(checkMove(start, moveTo(start, { rh: id(ctx, '4') }), ctx).contactsKept).toBe(3);
    expect(
      checkMove(start, moveTo(start, { rh: id(ctx, '4'), rf: id(ctx, '11') }), ctx).contactsKept,
    ).toBe(2);
  });

  it('counts a smear and a wall foothold as contacts', () => {
    const s = moveTo(start, { lf: 'wf:300:1450', rf: 'smear:700:1580' });
    expect(checkMove(s, moveTo(s, { rh: id(ctx, '4') }), ctx).contactsKept).toBe(3);
  });
});

describe('contacts fall (AC 8)', () => {
  it('keeping one contact is a fall', () => {
    const s = moveTo(start, { rf: null });
    const c = checkMove(s, moveTo(s, { lh: id(ctx, '3'), rh: id(ctx, '4') }), ctx);
    expect(c).toMatchObject({
      verdict: 'fall',
      legal: false,
      style: null,
      contactsKept: 1,
      fail: { kind: 'contacts', diagnosis: null, text: 'Keep at least two points on the wall' },
      reason: 'Keep at least two points on the wall',
      loads: {},
      effort: null,
    });
  });
});

describe('cutting feet (AC 9)', () => {
  it('holds on Overhang 35°: the hands can take it', () => {
    const steep = ladder({ ids, wallAngleDeg: 35 });
    const s = ladderStart(steep);
    const c = checkMove(s, moveTo(s, { lf: null, rf: null }), steep);
    expect(c).toMatchObject({
      verdict: 'hold',
      style: 'static',
      contactsKept: 2,
      move: { kind: 'cut' },
      reach: {},
    });
  });

  // SPEC-climber-stance Amendment 2026-11-04, M1 (decision D1-A): with both feet off the hips rest
  // on the wall, so the ladder's jugs hold on Vertical too (this used to be a fall). A sloper start
  // pulled into the wall still cuts loose.
  it('holds on Vertical on jugs, the hips on the wall', () => {
    const c = checkMove(start, moveTo(start, { lf: null, rf: null }), ctx);
    expect(c).toMatchObject({
      verdict: 'hold',
      style: 'static',
      contactsKept: 2,
      move: { kind: 'cut' },
    });
    expect(c.stance.body).not.toBeNull();
  });

  it('is a fall on Vertical from slopers: the feet would cut loose', () => {
    const slopers = sloperLadder(ids);
    const s = ladderStart(slopers);
    const c = checkMove(s, moveTo(s, { lf: null, rf: null }), slopers);
    expect(c.verdict).toBe('fall');
    expect(c.fail).toMatchObject({
      kind: 'pivot',
      text: 'Your feet would cut loose — find a foothold',
    });
  });
});

describe('foot pivot falls (AC 10)', () => {
  // M1 (D1-A): on the ladder's jugs the hands now hold while the only foot moves, so the cut-loose
  // pivot is pinned on the sloper start.
  it('moving the only foot on Vertical from slopers cuts the feet loose', () => {
    const slopers = sloperLadder(ids);
    const s = moveTo(ladderStart(slopers), { rf: null });
    const c = checkMove(s, moveTo(s, { lf: id(slopers, '10') }), slopers);
    expect(c.fail).toMatchObject({
      kind: 'pivot',
      text: 'Your feet would cut loose — find a foothold',
    });
  });

  it('a hand and a foot kept that can’t hold: the solver’s reason, while the foot moves', () => {
    const c = sloperLadder(ids);
    const s = ladderStart(c);
    const next = moveTo(s, { lf: id(c, '12') });
    const pivot = solve(kept(s, next, c), c);
    expect(pivot.feasible).toBe(false);
    const check = checkMove(s, next, c);
    expect(check.fail).toEqual({
      kind: 'pivot',
      diagnosis: pivot.diagnosis,
      text: `While your left foot moves: ${pivot.diagnosis!.text}`,
    });
  });
});

describe('deadpoints (AC 11)', () => {
  it('the barn-door set: the pivot barn-doors, the new stance holds, the hands’ pivot holds', () => {
    const { ctx: c, start: s } = barnDoor(ids);
    const up = moveTo(s, { rh: id(c, '3') });
    expect(solve(kept(s, up, c), c).diagnosis?.kind).toBe('barn-door');
    expect(solve(contactsOf(up, c), c).feasible).toBe(true);
    expect(solve(kept(s, moveTo(s, { lf: null }), c), c).feasible).toBe(true);
  });

  it('a hand move from a position you can’t hold with it off is a deadpoint', () => {
    const { ctx: c, start: s } = barnDoor(ids);
    const check = checkMove(s, moveTo(s, { rh: id(c, '3') }), c);
    expect(check).toMatchObject({
      verdict: 'hold',
      style: 'deadpoint',
      tip: 'Deadpoint: move fast and catch the hold',
      fail: null,
    });
    // B13 and B16: the stance effort (rounded to 0.1) × 1.15, rounded to 0.1.
    expect(check.effort).toBe(round1(round1(maxHandPercent(check)) * 1.15));
  });

  it('with dynamic moves off, the same move is a pivot fall', () => {
    const { ctx: c, start: s } = barnDoor(ids, { dynamic: false });
    const check = checkMove(s, moveTo(s, { rh: id(c, '3') }), c);
    expect(check.verdict).toBe('fall');
    expect(check.fail?.kind).toBe('pivot');
    expect(check.fail?.text).toMatch(/^While your right hand moves: Barn door: /);
  });

  it('moving the foot instead is not a pivot fall: the hands’ pivot holds', () => {
    const { ctx: c, start: s } = barnDoor(ids);
    const check = checkMove(s, moveTo(s, { lf: 'smear:450:1580' }), c);
    expect(check.fail?.kind).not.toBe('pivot');
  });
});

describe('a hands-only move off the feet (AC 12)', () => {
  it('on Vertical: keep one hand on', () => {
    const c = checkMove(start, moveTo(start, { lh: id(ctx, '3'), rh: id(ctx, '4') }), ctx);
    expect(c.fail).toMatchObject({ kind: 'pivot', text: 'Keep one hand on while you move' });
  });
});

describe('matching (AC 13)', () => {
  it('shifts only the staying hand, by 0.015 H, and back when unmatched', () => {
    const matched = moveTo(start, { lh: start.rh });
    const m = checkMove(start, matched, ctx);
    expect(m.move?.kind).toBe('match');
    const before = contactsOf(start, ctx);
    expect(m.contacts.rh!.point[0] - before.rh!.point[0]).toBeCloseTo(15, 9);
    expect(m.contacts.rh!.point[1]).toBe(before.rh!.point[1]);
    expect(m.contacts.lf!.point).toEqual(before.lf!.point);
    expect(m.contacts.rf!.point).toEqual(before.rf!.point);
    const u = checkMove(matched, start, ctx);
    expect(u.contacts.rh!.point).toEqual(before.rh!.point);
  });

  it('measures a match’s reach to the shifted point', () => {
    const m = checkMove(start, moveTo(start, { lh: start.rh }), ctx);
    expect(m.contacts.lh!.point).toEqual([585, 1000]);
    expect(m.reach.lh).toBeGreaterThan(0);
  });
});

describe('reach (AC 15)', () => {
  it('rh 2S → 4 is static and holds', () => {
    expect(checkMove(start, moveTo(start, { rh: id(ctx, '4') }), ctx)).toMatchObject({
      verdict: 'hold',
      style: 'static',
      legal: true,
      reason: null,
    });
  });

  it('rh 2S → 7F is too far: move your feet up first', () => {
    const c = checkMove(start, moveTo(start, { rh: id(ctx, '7F') }), ctx);
    expect(c).toMatchObject({
      verdict: 'fall',
      style: null,
      fail: {
        kind: 'reach',
        limb: 'rh',
        diagnosis: null,
        text: 'Too far: right hand — move your feet up first',
      },
    });
    expect(c.reach.rh).toBeGreaterThan(1.1);
  });

  it('a hold 1 H to the right at the same height: try a closer hold', () => {
    const holds = [...ladderHolds(ids), routeHold(11, '12', 1600, 1000, 'route', ids())];
    const wide = makeContext({
      holds,
      wallFeet: [],
      height: 1000,
      wallAngleDeg: 0,
      photo: { width: 2000, height: 2000 },
    });
    const s = ladderStart(wide);
    expect(checkMove(s, moveTo(s, { rh: id(wide, '12') }), wide).fail).toMatchObject({
      kind: 'reach',
      limb: 'rh',
      text: 'Too far: right hand — try a closer hold',
    });
  });

  it('a foot too far: try a closer foothold', () => {
    const c = checkMove(start, moveTo(start, { lf: 'smear:0:600' }), ctx);
    expect(c.fail).toMatchObject({
      kind: 'reach',
      limb: 'lf',
      text: 'Too far: left foot — try a closer foothold',
    });
  });

  // SPEC-climber-stance Amendment 2026-11-04, M2 rule 3 (the reach check's `cramped`, tested in
  // climber-stance's reach.test.ts): a move blocked by a joint's range, not by length.
  it('words a cramped move: move your hips away first', () => {
    expect(tooCramped('lf')).toBe('Too cramped: left foot — move your hips away first');
    expect(tooHigh('rf')).toBe('Too high: right foot — try a lower foothold');
  });

  it('a limb going off has no ratio', () => {
    expect(checkMove(start, moveTo(start, { rf: null }), ctx).reach).toEqual({});
  });
});

describe('new stance falls (AC 19)', () => {
  it('a start that can’t be held falls with the solver’s diagnosis', () => {
    const c = sloperLadder(ids, 35);
    const s = step(c, { lh: '1S', rh: '2S', lf: 'smear:290:1580', rf: 'smear:710:1580' });
    const check = checkStart(s, c);
    expect(check.verdict).toBe('fall');
    expect(check.fail?.kind).toBe('stance');
    expect(check.fail?.diagnosis).toEqual(check.stance.diagnosis);
    expect(check.fail?.text).toBe(check.stance.diagnosis!.text);
    // The spec's 'slip' predates climber-stance's sloper amendment: a sloper hand from contactsFor
    // now carries its assumed grip surface, and the solver calls it too steep (rule 13).
    expect(check.fail?.diagnosis?.kind).toBe('sloper-steep');
    expect(check).toMatchObject({ move: null, pivot: null, style: null, loads: {}, effort: null });
  });

  it('a move whose pivot holds but whose new stance doesn’t', () => {
    const steep = ladder({
      ids,
      wallAngleDeg: 45,
      wallFeet: [{ id: 'wf:400:1900', point: [400, 1900] }],
    });
    const s = ladderStart(steep);
    const next = moveTo(s, { lf: 'wf:400:1900' });
    expect(solve(kept(s, next, steep), steep).feasible).toBe(true);
    const after = solve(contactsOf(next, steep), steep);
    expect(after.feasible).toBe(false);
    const check = checkMove(s, next, steep);
    expect(check.fail).toEqual({
      kind: 'stance',
      diagnosis: after.diagnosis,
      text: after.diagnosis!.text,
    });
    expect(check.style).toBe('static');
    expect(check.pivot?.feasible).toBe(true);
  });
});

describe('loads and effort (AC 20, 21)', () => {
  it('loads add up to 100 ± 0.2 with one decimal on every hold', () => {
    for (const c of [
      checkStart(start, ctx),
      checkMove(start, moveTo(start, { rh: id(ctx, '4') }), ctx),
      checkMove(start, moveTo(start, { lh: start.rh }), ctx),
    ]) {
      expect(c.verdict).toBe('hold');
      expect(Math.abs(loadSum(c) - 100)).toBeLessThanOrEqual(0.2);
      for (const v of Object.values(c.loads)) expect(oneDecimal(v!)).toBe(true);
    }
  });

  it('shows an undercling hand’s negative share', () => {
    const under = ladder({
      holds: ladderHolds(ids).map((h) =>
        h.role === 'start'
          ? { ...h, type: 'edge', dir: [0, -1, 0] as [number, number, number] }
          : h,
      ),
    });
    const c = checkStart(ladderStart(under), under);
    expect(c.verdict).toBe('hold');
    expect(c.loads.lh!).toBeLessThan(0);
  });

  it('on the ladder start, effort is the larger hand percent, and higher on 35°', () => {
    const v = checkStart(start, ctx);
    expect(v.effort).toBe(round1(maxHandPercent(v)));
    const steep = ladder({ holds: ctx.holds, wallAngleDeg: 35 });
    expect(checkStart(ladderStart(steep), steep).effort!).toBeGreaterThan(v.effort!);
  });

  it('a static move’s effort is the larger of the new stance’s and the pivot’s', () => {
    const c = checkMove(start, moveTo(start, { rh: id(ctx, '4') }), ctx);
    const hand = (s: MoveCheck['stance']) =>
      round1(Math.max(0, s.load.lh?.percent ?? 0, s.load.rh?.percent ?? 0));
    expect(c.effort).toBe(Math.max(hand(c.stance), hand(c.pivot!)));
  });
});

describe('outputs', () => {
  it('reports ratios with at most 3 decimals and the moved limb only', () => {
    const c = checkMove(start, moveTo(start, { rh: id(ctx, '4') }), ctx);
    expect(Object.keys(c.reach)).toEqual(['rh']);
    expect(Math.round(c.reach.rh! * 1000) / 1000).toBe(c.reach.rh);
    expect(c.assignment).toEqual(moveTo(start, { rh: id(ctx, '4') }));
  });

  it('gives the same answer through a shared cache', () => {
    const cache = createStanceCache();
    const next = moveTo(start, { rh: id(ctx, '4') });
    const a = checkMove(start, next, ctx, cache);
    expect(checkMove(start, next, ctx, cache)).toEqual(a);
    expect(checkMove(start, next, ctx)).toEqual(a);
  });
});

describe('preconditions (AC 24)', () => {
  it('checkMove and checkStart throw RangeError on shape-invalid input', () => {
    expect(() => checkMove(start, { ...start }, ctx)).toThrow(RangeError);
    expect(() => checkMove(start, moveTo(start, { lf: id(ctx, '7F') }), ctx)).toThrow(
      'The finish is for hands',
    );
    expect(() => checkStart(step(ctx, { lh: '3', rh: '4' }), ctx)).toThrow(RangeError);
  });

  it('the start photo bottom case returns a verdict (AC 6)', () => {
    const y = LADDER_PHOTO.height - 100;
    const c = makeContext({
      holds: [
        routeHold(0, '1S', 400, y, 'start', ids()),
        routeHold(1, '2S', 600, y, 'start', ids()),
        routeHold(2, '3F', 500, y - 600, 'finish', ids()),
      ],
      wallFeet: [],
      height: 1000,
      wallAngleDeg: 0,
      photo: LADDER_PHOTO,
    });
    const s = step(c, { lh: '1S', rh: '2S', lf: 'smear:290:1979', rf: 'smear:710:1979' });
    expect(['hold', 'fall']).toContain(checkStart(s, c).verdict);
  });
});

// Amendment 2026-11-02 (SPEC-play-shell E1): the grip point is a different contact point and
// nothing else; the referee's rules are the same.
describe('a grip point', () => {
  const fixed = (i: number) => `hold-${i}`;
  const gripOn4 = (x: number | null) =>
    ladder({
      ids: fixed,
      holds: ladderHolds(fixed).map((h) =>
        h.label === '4' && x !== null ? { ...h, grip: { x, y: 700 } } : h,
      ),
    });
  const rhTo4 = (c: MoveContext) => {
    const s = ladderStart(c);
    return checkMove(s, moveTo(s, { rh: id(c, '4') }), c);
  };

  it('on the centroid gives the same check as no grip', () => {
    expect(rhTo4(gripOn4(600))).toEqual(rhTo4(gripOn4(null)));
  });

  // rh 2S → 4 with 4's grip moved toward the left hand (on 1S at x 400): the right hand reaches
  // across from its own shoulder, so its ratio grows, and a hand nearer the body's middle takes
  // more of the weight, so its share grows and the left hand's shrinks.
  it('moved toward the other hand: a longer reach and more load on that hand', () => {
    const [at600, at570, at540] = [600, 570, 540].map((x) => rhTo4(gripOn4(x)));
    for (const c of [at600, at570, at540]) {
      expect(c).toMatchObject({ verdict: 'hold', style: 'static' });
    }
    expect(at570!.contacts.rh!.point).toEqual([570, 700]);
    expect(at570!.contacts.lh).toEqual(at600!.contacts.lh);
    expect(at570!.contacts.lf).toEqual(at600!.contacts.lf);
    expect(at570!.contacts.rf).toEqual(at600!.contacts.rf);
    expect(at600!.reach.rh!).toBeLessThan(at570!.reach.rh!);
    expect(at570!.reach.rh!).toBeLessThan(at540!.reach.rh!);
    expect(at600!.loads.rh!).toBeLessThan(at570!.loads.rh!);
    expect(at570!.loads.rh!).toBeLessThan(at540!.loads.rh!);
    expect(at540!.loads.lh!).toBeLessThan(at600!.loads.lh!);
  });
});
