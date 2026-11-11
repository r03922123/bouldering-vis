import { bodyDims, trunkJoints } from './body';
import { reachRatios } from './reach';
import {
  DEFAULT_PRIOR,
  solveStance,
  trunkDirection,
  type ContactInput,
  type StanceContacts,
} from './stance';
import { isHand, LIMBS, type Limb } from './types';
import { norm, sub, type Vec3 } from './vec';

// SPEC-beta-moves A3 and AC 16–18. The ladder (SPEC-beta-moves › Acceptance Criteria): H = 1000 px,
// Vertical, jugs pulled down, edges for the feet.
const H = 1000;
const DOWN: Vec3 = [0, 1, 0];
const opts = { height: H, wallAngleDeg: 0 };

const jug = (x: number, y: number): ContactInput => ({
  holdId: `${x},${y}`,
  point: [x, y],
  type: 'jug',
  dir: DOWN,
});
const edge = (x: number, y: number): ContactInput => ({
  holdId: `${x},${y}`,
  point: [x, y],
  type: 'edge',
  dir: null,
});

const START: StanceContacts = {
  lh: jug(400, 1000),
  rh: jug(600, 1000),
  lf: edge(420, 1580),
  rf: edge(580, 1580),
};
const startPelvis = solveStance(START, opts).joints!.pelvis;
const around = { pelvis: startPelvis, radius: 0.3 * H };
const stayRh: StanceContacts = { lh: START.lh, lf: START.lf, rf: START.rf };

const decimals = (x: number) => (Number.isFinite(x) ? (String(x).split('.')[1]?.length ?? 0) : 0);

describe('reachRatios', () => {
  it('reaches the next hold up from the ladder start (≤ 1.000)', () => {
    const r = reachRatios(stayRh, { rh: jug(600, 700) }, opts, around);
    expect(r.ratios.rh).toBeLessThanOrEqual(1);
    expect(r.pelvis).not.toBeNull();
  });

  it('can’t reach the finish from the ladder start (> 1.100)', () => {
    const r = reachRatios(stayRh, { rh: jug(500, 150) }, opts, around);
    expect(r.ratios.rh).toBeGreaterThan(1.1);
  });

  it('gives Infinity and no pelvis when a staying limb can’t reach', () => {
    const r = reachRatios(
      { lh: jug(400, 1000), lf: edge(420, 3000) },
      { rh: jug(600, 900) },
      opts,
      null,
    );
    expect(r.ratios.rh).toBe(Infinity);
    expect(r.pelvis).toBeNull();
  });

  it('respects the hip box (AC 16)', () => {
    const target = { rh: jug(600, 700) };
    const boxed = reachRatios(stayRh, target, opts, around).ratios.rh!;
    const shifted = reachRatios(stayRh, target, opts, {
      pelvis: [startPelvis[0] + 0.6 * H, startPelvis[1], startPelvis[2]],
      radius: 0.3 * H,
    }).ratios.rh!;
    expect(shifted).toBeGreaterThan(boxed);
    expect(reachRatios(stayRh, target, opts, null).ratios.rh!).toBeLessThanOrEqual(boxed);
  });

  it('reaches two holds from one pelvis (AC 17)', () => {
    const stay: StanceContacts = { lf: edge(420, 1580), rf: edge(580, 1580) };
    const max = (r: ReturnType<typeof reachRatios>) => Math.max(...Object.values(r.ratios));
    // A and B 0.5 H either side of the shoulders' middle.
    const A = jug(0, 900);
    const B = jug(1000, 900);
    const both = max(reachRatios(stay, { lh: A, rh: B }, opts, null));
    const alone = Math.max(
      max(reachRatios(stay, { lh: A }, opts, null)),
      max(reachRatios(stay, { rh: B }, opts, null)),
    );
    expect(both).toBeGreaterThan(alone);
    // And never less when the trunk is the same for both (it follows the hands): two feet up the
    // ladder under the start hands.
    const hands: StanceContacts = { lh: START.lh, rh: START.rh };
    const ladderBoth = max(
      reachRatios(hands, { lf: edge(420, 1300), rf: edge(580, 1300) }, opts, around),
    );
    const ladderAlone = Math.max(
      max(reachRatios(hands, { lf: edge(420, 1300) }, opts, around)),
      max(reachRatios(hands, { rf: edge(580, 1300) }, opts, around)),
    );
    expect(ladderBoth).toBeGreaterThanOrEqual(ladderAlone);
  });

  it('reports ratios ≥ 0 with at most 3 decimals, at a pelvis the IK can bend into (AC 18)', () => {
    const d = bodyDims(H);
    const cases: [StanceContacts, StanceContacts][] = [
      [stayRh, { rh: jug(600, 700) }],
      [stayRh, { rh: jug(500, 150) }],
      [stayRh, { rh: jug(1600, 1000) }],
      // A target right at the shoulder: the chosen pelvis must not fold the arm shorter than it bends.
      [
        { lf: START.lf, rf: START.rf },
        { lh: jug(400, 1000), rh: jug(400, 1001) },
      ],
    ];
    for (const [stay, moving] of cases) {
      const r = reachRatios(stay, moving, opts, around);
      for (const v of Object.values(r.ratios)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(decimals(v)).toBeLessThanOrEqual(3);
      }
      if (!r.pelvis) continue;
      const all = { ...stay, ...moving };
      const hands = LIMBS.filter((l) => all[l] && isHand(l)).map((l) => ({
        limb: l,
        point: [all[l]!.point[0], all[l]!.point[1], 0] as Vec3,
      }));
      const t = trunkJoints(
        r.pelvis,
        trunkDirection(
          r.pelvis,
          hands.map((h) => ({ ...h, cone: { axis: [0, 0, 1], halfAngle: 0 } })),
          DEFAULT_PRIOR.lean,
        ),
        d,
      );
      const root: Record<Limb, Vec3> = {
        lh: t.lShoulder,
        rh: t.rShoulder,
        lf: t.lHip,
        rf: t.rHip,
      };
      for (const l of LIMBS) {
        const c = all[l];
        if (!c) continue;
        const [a, b] = isHand(l) ? [d.upperArm, d.forearm] : [d.thigh, d.shank];
        const dist = norm(sub([c.point[0], c.point[1], 0], root[l]));
        expect(dist).toBeGreaterThanOrEqual(Math.abs(a - b) - 1e-9);
        if (stay[l]) expect(dist).toBeLessThanOrEqual(a + b + 1e-9);
      }
    }
  });

  // After the book-based prior (main, private PR #8): the hip floor and the trunk's lean come from the
  // solver's posture prior, with the same `opts.prior` overrides solveStance takes.
  it('uses the solver’s posture prior, overrides included', () => {
    const target = { rh: jug(600, 700) };
    const base = reachRatios(stayRh, target, opts, null).ratios.rh!;
    const lowHips = reachRatios(stayRh, target, { ...opts, prior: { hipsBelowHands: 0.45 } }, null)
      .ratios.rh!;
    const upright = reachRatios(stayRh, target, { ...opts, prior: { lean: 0 } }, null).ratios.rh!;
    expect(lowHips).toBeGreaterThan(base);
    expect(upright).not.toBe(base);
    expect(reachRatios(stayRh, target, { ...opts, prior: {} }, null).ratios.rh).toBe(base);
  });

  // SPEC-beta-moves OQ 11 (builder's call, 2026-11-01; the user can veto): reach uses the solver's
  // own hip floor, counting the moving hand's target as solveStance counts every hand.
  it('doesn’t reject a one-hand-up move the solver holds because of the hip floor', () => {
    const stay: StanceContacts = { lh: jug(400, 1000), lf: edge(420, 1300), rf: edge(580, 1300) };
    const moving: StanceContacts = { rh: jug(600, 420) };
    const after = solveStance({ ...stay, ...moving }, opts);
    expect(after.feasible).toBe(true);
    // The solver holds it with the hips above the old, staying-hands-only floor (y ≥ 1150).
    expect(after.joints!.pelvis[1]).toBeLessThan(1000 + DEFAULT_PRIOR.hipsBelowHands * H);
    expect(reachRatios(stay, moving, opts, null).ratios.rh).toBeLessThanOrEqual(1);
  });

  // Guard: if the solver holds stay ∪ moving at pelvis P, reach (which minimises the largest moving
  // ratio over the pelvis positions it allows) can't report more than the ratios at P. A stricter
  // floor in reach than in the solver would exclude P and break this.
  describe('agrees with the solver’s hip floor', () => {
    const d = bodyDims(H);
    const cases: [string, StanceContacts, StanceContacts][] = [
      [
        'one hand up',
        { lh: jug(400, 1000), lf: edge(420, 1300), rf: edge(580, 1300) },
        { rh: jug(600, 420) },
      ],
      ['ladder rh → 4', stayRh, { rh: jug(600, 700) }],
      ['ladder lh → 3', { rh: START.rh, lf: START.lf, rf: START.rf }, { lh: jug(400, 700) }],
      ['hand and foot', { lh: START.lh, rf: START.rf }, { rh: jug(600, 700), lf: edge(420, 1300) }],
      [
        'left hand up off a low right hand',
        { rh: jug(600, 1000), lf: edge(420, 1300), rf: edge(580, 1300) },
        { lh: jug(380, 450) },
      ],
    ];
    it.each(cases)('%s', (_, stay, moving) => {
      const s = solveStance({ ...stay, ...moving }, opts);
      expect(s.feasible).toBe(true);
      const P = s.joints!.pelvis;
      const all = { ...stay, ...moving };
      const hands = LIMBS.filter((l) => all[l] && isHand(l)).map((l) => ({
        limb: l,
        point: [all[l]!.point[0], all[l]!.point[1], 0] as Vec3,
        cone: { axis: [0, 0, 1] as Vec3, halfAngle: 0 },
      }));
      const t = trunkJoints(P, trunkDirection(P, hands, DEFAULT_PRIOR.lean), d);
      const root: Record<Limb, Vec3> = { lh: t.lShoulder, rh: t.rShoulder, lf: t.lHip, rf: t.rHip };
      const atP = Math.max(
        ...LIMBS.filter((l) => moving[l]).map((l) => {
          const [a, b] = isHand(l) ? [d.upperArm, d.forearm] : [d.thigh, d.shank];
          const p = moving[l]!.point;
          return norm(sub([p[0], p[1], 0], root[l])) / (a + b);
        }),
      );
      const r = reachRatios(stay, moving, opts, null);
      expect(Math.max(...Object.values(r.ratios))).toBeLessThanOrEqual(atP + 0.02);
    });
  });

  it('is pure: the same inputs give the same answer', () => {
    const a = reachRatios(stayRh, { rh: jug(600, 700) }, opts, around);
    expect(reachRatios(stayRh, { rh: jug(600, 700) }, opts, around)).toEqual(a);
  });
});

// Amendment 2026-11-04, M2: joint range of motion in the reach check, with the pelvis pinned by a
// small box under two jugs (nearly straight arms keep it from moving out from the wall).
describe('reachRatios › joint range (M2)', () => {
  const H = 1000;
  const jug = (x: number): ContactInput => ({
    holdId: `j${x}`,
    point: [x, 0],
    type: 'jug',
    dir: [0, 1, 0],
  });
  const foot = (x: number, y: number): ContactInput => ({
    holdId: `f${x},${y}`,
    point: [x, y],
    type: null,
    dir: null,
  });
  const hands = { lh: jug(-100), rh: jug(100) };
  const pinned = { pelvis: [0, 600, 80] as Vec3, radius: 6 };
  const opts = { height: H, wallAngleDeg: 0 };

  it('calls a foot nearer than the knee can fold cramped (AC 44)', () => {
    const r = reachRatios(hands, { lf: foot(-95, 660) }, opts, pinned);
    expect(r.ratios.lf).toBe(Infinity);
    expect(r.cramped).toEqual(['lf']);
    expect(r.high).toEqual([]);
  });

  it('calls a foot too high above the hip for its range cramped, within the leg’s length (AC 45)', () => {
    const r = reachRatios(hands, { lf: foot(-95, 140) }, opts, pinned);
    expect(r.ratios.lf).toBe(Infinity);
    expect(r.cramped).toEqual(['lf']);
    // Private PR #18 review 2: the hip's range alone stops it, so the move says too high.
    expect(r.high).toEqual(['lf']);
    // Not the knee's fold and not too far: the hip-to-foot distance is ~0.46 H.
    const d = bodyDims(H);
    const gap = norm(sub([-95, 140, 0], [-d.hipHalf, 600, 80]));
    expect(gap).toBeGreaterThan(0.3 * H);
    expect(gap).toBeLessThan(d.thigh + d.shank);
  });

  it('keeps a far foot far, not cramped', () => {
    const r = reachRatios(hands, { lf: foot(-95, 1400) }, opts, pinned);
    expect(r.ratios.lf).toBeGreaterThan(1);
    expect(r.cramped).toEqual([]);
  });
});
