import {
  BODY_TOUCH,
  DEFAULT_PRIOR,
  gravityFor,
  resolveContacts,
  solveStance,
  type ContactInput,
  type StanceContacts,
} from './stance';
import { isHand, LIMBS, type Limb } from './types';
import { highText } from './diagnose';
import { hipAngle, JOINT_RANGE } from './ik';
import { norm, sub, unit, type Vec3 } from './vec';

// Synthetic walls, H = 1000 px. Image frame: +y down the wall, so "below" is larger y.
const H = 1000;
const DOWN: Vec3 = [0, 1, 0];
const UP: Vec3 = [0, -1, 0];

const hold = (x: number, y: number, type: string | null = 'jug', dir: Vec3 | null = DOWN) =>
  ({ holdId: `${x},${y}`, point: [x, y], type, dir }) satisfies ContactInput;

const fourPoint = (handType = 'jug', handDir: Vec3 = DOWN): StanceContacts => ({
  lh: hold(-100, 0, handType, handDir),
  rh: hold(100, 0, handType, handDir),
  lf: hold(-120, 750, 'edge'),
  rf: hold(120, 750, 'edge'),
});

const pct = (s: ReturnType<typeof solveStance>, l: Limb) => s.load[l]?.percent ?? 0;
/** The hands' part of all the load. */
const handShare = (s: ReturnType<typeof solveStance>) =>
  (pct(s, 'lh') + pct(s, 'rh')) / (pct(s, 'lh') + pct(s, 'rh') + pct(s, 'lf') + pct(s, 'rf'));

describe('solveStance', () => {
  it('balances a 4-point stance with the feet doing most of the work, weight over a foot (AC 4, book p16)', () => {
    const s = solveStance(fourPoint(), { height: H, wallAngleDeg: 0 });
    expect(s.feasible).toBe(true);
    const vertical = Object.values(s.load).reduce((sum, v) => sum + v!.force[1], 0);
    expect(vertical).toBeCloseTo(1, 1);
    expect(pct(s, 'lf') + pct(s, 'rf')).toBeGreaterThan(pct(s, 'lh') + pct(s, 'rh'));
    // Real climbers shift their hips onto one foot (19 measured climbs): the CoM goes over a foot
    // (B6), and a mirror-symmetric stance picks the left one (amended AC 4).
    expect(Math.abs(s.com[0] - -120)).toBeLessThan(0.1 * H);
    expect(pct(s, 'lf')).toBeGreaterThan(pct(s, 'rf'));
  });

  it('settles every mirror-symmetric stance on its left foot (amended AC 4)', () => {
    const cases: [StanceContacts, number][] = [
      [fourPoint(), 0],
      [fourPoint(), 20],
      [fourPoint('edge', UP), 0],
    ];
    for (const [contacts, angle] of cases) {
      const s = solveStance(contacts, { height: H, wallAngleDeg: angle });
      expect(s.feasible).toBe(true);
      expect(s.joints!.pelvis[0]).toBeLessThan(0);
      expect(s.load.lf!.share).toBeGreaterThan(s.load.rf!.share);
    }
  });

  const flip = (c: ContactInput | null | undefined): ContactInput | null | undefined =>
    c && { ...c, point: [-c.point[0], c.point[1]], dir: c.dir && [-c.dir[0], c.dir[1], c.dir[2]] };
  const mirror = (c: StanceContacts): StanceContacts => ({
    lh: flip(c.rh),
    rh: flip(c.lh),
    lf: flip(c.rf),
    rf: flip(c.lf),
  });
  const other: Record<Limb, Limb> = { lh: 'rh', rh: 'lh', lf: 'rf', rf: 'lf' };
  const uneven: StanceContacts = {
    lh: hold(-80, 0),
    rh: hold(130, 40),
    lf: hold(-150, 640, 'edge'),
    rf: hold(90, 700, 'edge'),
  };
  it.each([
    ['a wide right foot', { ...fourPoint(), rf: hold(320, 700, 'edge') }, 0],
    ['uneven holds', uneven, 0],
    ['uneven holds at 20°', uneven, 20],
  ] as const)(
    'mirrors the pose and the loads when %s are mirrored (amended AC 4)',
    (_, c, angle) => {
      const a = solveStance(c, { height: H, wallAngleDeg: angle });
      const b = solveStance(mirror(c), { height: H, wallAngleDeg: angle });
      expect(b.feasible).toBe(a.feasible);
      expect(Math.abs(b.joints!.pelvis[0] + a.joints!.pelvis[0])).toBeLessThan(0.005 * H);
      expect(Math.abs(b.joints!.pelvis[1] - a.joints!.pelvis[1])).toBeLessThan(0.005 * H);
      for (const l of LIMBS) expect(Math.abs(pct(b, other[l]) - pct(a, l))).toBeLessThan(0.5);
    },
  );

  it('splits the weight into shares that add up to 100 % (AC 13)', () => {
    for (const angle of [0, 35]) {
      const s = solveStance(fourPoint(), { height: H, wallAngleDeg: angle });
      const total = Object.values(s.load).reduce((sum, v) => sum + v!.share, 0);
      expect(total).toBeCloseTo(100, 0);
    }
  });

  it('shifts weight between the feet when one foot moves out wide', () => {
    const wide = { ...fourPoint(), rf: hold(320, 700, 'edge') };
    const s = solveStance(wide, { height: H, wallAngleDeg: 0 });
    expect(s.feasible).toBe(true);
    expect(Math.abs(s.load.lf!.share - s.load.rf!.share)).toBeGreaterThan(3);
  });

  it('shows no loads for a stance that can’t be held', () => {
    const s = solveStance(
      { lh: hold(-100, 0, 'sloper', [0, 0.6, -1]), rh: hold(100, 0, 'sloper', [0, 0.6, -1]) },
      { height: H, wallAngleDeg: 35 },
    );
    expect(s.feasible).toBe(false);
    expect(s.load).toEqual({});
  });

  it('loads the hands more as the wall gets steeper (AC 5)', () => {
    const shares = [0, 20, 35, 45].map((a) =>
      handShare(solveStance(fourPoint(), { height: H, wallAngleDeg: a })),
    );
    for (let i = 1; i < shares.length; i++) expect(shares[i]!).toBeGreaterThan(shares[i - 1]!);
  });

  it('campuses on jugs but slips off slopers on a 35° overhang (AC 6)', () => {
    const jugs = solveStance(
      { lh: hold(-100, 0), rh: hold(100, 0) },
      { height: H, wallAngleDeg: 35 },
    );
    expect(jugs.feasible).toBe(true);
    expect(pct(jugs, 'lh') + pct(jugs, 'rh')).toBeGreaterThan(99);
    const slopers = solveStance(
      {
        lh: hold(-100, 0, 'sloper', [0, 0.6, -1]),
        rh: hold(100, 0, 'sloper', [0, 0.6, -1]),
      },
      { height: H, wallAngleDeg: 35 },
    );
    expect(slopers.feasible).toBe(false);
    expect(slopers.diagnosis?.kind).toBe('slip');
    expect(isHand(slopers.diagnosis!.limb!)).toBe(true);
  });

  it('draws a failing stance in a natural pose, hanging below the hands', () => {
    const slopers = solveStance(
      {
        lh: hold(-100, 0, 'sloper', [0, 0.6, -1]),
        rh: hold(100, 0, 'sloper', [0, 0.6, -1]),
      },
      { height: H, wallAngleDeg: 35 },
    );
    expect(slopers.diagnosis?.kind).toBe('slip');
    expect(slopers.joints!.lShoulder[1]).toBeGreaterThan(0);
    expect(slopers.joints!.rShoulder[1]).toBeGreaterThan(0);
  });

  it('keeps the hips over a one-sided stance, or calls it a barn door (AC 7)', () => {
    const s = solveStance(
      { lh: hold(-100, 0), lf: hold(-100, 750, 'edge') },
      { height: H, wallAngleDeg: 0 },
    );
    // Holdable: friction carries the twist, so the CoM may sit a little off the hand-foot line.
    if (s.feasible) expect(Math.abs(s.com[0] - -100)).toBeLessThan(0.1 * H);
    else expect(s.diagnosis?.kind).toBe('barn-door');
  });

  it('holds underclings with the feet carrying more than the body weight (AC 8)', () => {
    const s = solveStance(fourPoint('edge', UP), { height: H, wallAngleDeg: 0 });
    expect(s.feasible).toBe(true);
    expect(pct(s, 'lf') + pct(s, 'rf')).toBeGreaterThan(100);
  });

  it('names a foothold that is too far away (AC 9)', () => {
    const s = solveStance(
      { lh: hold(-100, 0), rh: hold(100, 0), lf: hold(-120, 1200, 'edge') },
      { height: H, wallAngleDeg: 0 },
    );
    expect(s.feasible).toBe(false);
    expect(s.diagnosis).toMatchObject({ kind: 'reach', limb: 'lf' });
    expect(s.diagnosis!.text).toMatch(/^Out of reach: left foot/);
    expect(s.reach.lf).toBe(false);
  });

  it('gives the same percents when everything is 3× bigger, every time (AC 10)', () => {
    const a = solveStance(fourPoint(), { height: H, wallAngleDeg: 20 });
    const big = Object.fromEntries(
      Object.entries(fourPoint()).map(([l, c]) => [
        l,
        { ...c!, point: [c!.point[0] * 3, c!.point[1] * 3] },
      ]),
    ) as StanceContacts;
    const b = solveStance(big, { height: 3 * H, wallAngleDeg: 20 });
    for (const l of ['lh', 'rh', 'lf', 'rf'] as const) {
      expect(Math.abs(pct(a, l) - pct(b, l))).toBeLessThan(0.1);
    }
    expect(solveStance(fourPoint(), { height: H, wallAngleDeg: 20 })).toEqual(a);
  });

  it('puts the center of mass inside the region exactly when the stance holds (AC 11)', () => {
    const cases: [StanceContacts, number][] = [
      [fourPoint(), 0],
      [{ lh: hold(-100, 0), rh: hold(100, 0) }, 35],
      [{ lh: hold(-100, 0, 'sloper', [0, 0.6, -1]), rh: hold(100, 0, 'sloper', [0, 0.6, -1]) }, 35],
      [fourPoint('edge', UP), 0],
    ];
    for (const [contacts, angle] of cases) {
      const s = solveStance(contacts, { height: H, wallAngleDeg: angle });
      expect(insideHull(s.region, [s.com[0], s.com[1]])).toBe(s.feasible);
    }
  });

  it('draws a whole skeleton with the hands on their holds', () => {
    const s = solveStance(fourPoint(), { height: H, wallAngleDeg: 0 });
    expect(s.joints).not.toBeNull();
    expect(Math.hypot(s.joints!.lHand[0] + 100, s.joints!.lHand[1])).toBeLessThan(1);
    expect(s.joints!.pelvis[2]).toBeGreaterThan(0);
  });
});

// Amendment 2026-10-31 (b): the sloper cone.
describe('solveStance on slopers', () => {
  const shares = (s: ReturnType<typeof solveStance>) =>
    (['lh', 'rh', 'lf', 'rf'] as const).map((l) => Math.round(s.load[l]?.share ?? 0));

  it('centres a sloper hand’s cone on its grip surface', () => {
    const normal = unit([0, -1, 0.2]);
    const [c] = resolveContacts({
      lh: { ...hold(0, 0, 'sloper', [0, 0.6, -1]), surface: { normal, source: 'measured' } },
    });
    c!.cone.axis.forEach((x, i) => expect(x).toBeCloseTo(normal[i]!, 9));
  });

  it('lets the smears carry next to nothing once the wall overhangs (AC 31)', () => {
    const contacts: StanceContacts = {
      lh: hold(400, 200),
      rh: hold(600, 200),
      lf: hold(290, 780, 'smear', null),
      rf: hold(710, 780, 'smear', null),
    };
    const at20 = solveStance(contacts, { height: H, wallAngleDeg: 20 });
    expect(at20.feasible).toBe(true);
    expect(at20.load.lf!.share).toBeLessThanOrEqual(3);
    expect(at20.load.rf!.share).toBeLessThanOrEqual(3);
    const at35 = solveStance(contacts, { height: H, wallAngleDeg: 35 });
    expect(at35.feasible).toBe(true);
    expect(Math.abs(Math.round(at35.load.lf!.share))).toBe(0);
    expect(Math.abs(Math.round(at35.load.rf!.share))).toBe(0);
  });

  // AC 28: a measured normal tilted from up toward the room by `deg` degrees.
  const tilted = (deg: number): Vec3 => {
    const a = (deg * Math.PI) / 180;
    return [0, -Math.cos(a), Math.sin(a)];
  };
  const onSlopers = (
    surface: NonNullable<ContactInput['surface']>,
    dir: Vec3 = [0, 0.6, -1],
  ): StanceContacts => ({
    lh: { ...hold(400, 200, 'sloper', dir), surface },
    rh: { ...hold(600, 200, 'sloper', dir), surface },
    lf: hold(290, 780, null, null),
    rf: hold(710, 780, null, null),
  });
  const vertical = { height: H, wallAngleDeg: 0 };
  const steepText =
    /^(Left|Right) hand: this sloper is too steep to hold here — get a foot on a hold under it$/;
  const mayText =
    /^(Left|Right) hand: this sloper may be too steep — if its top faces up, set its pull to Down$/;

  describe('the sloper cone on Vertical (AC 28)', () => {
    it('holds a sloper whose surface is 20° from up', () => {
      const s = solveStance(onSlopers({ normal: tilted(20), source: 'measured' }), vertical);
      expect(s.feasible).toBe(true);
      const total = Object.values(s.load).reduce((sum, v) => sum + v!.share, 0);
      expect(Math.abs(total - 100)).toBeLessThanOrEqual(1);
    });

    it('never calls a sloper 30° from up too steep (below the threshold)', () => {
      const s = solveStance(onSlopers({ normal: tilted(30), source: 'measured' }), vertical);
      expect(s.diagnosis?.kind).not.toBe('sloper-steep');
    });

    it('calls a measured sloper 45° from up too steep to hold', () => {
      const s = solveStance(onSlopers({ normal: tilted(45), source: 'measured' }), vertical);
      expect(s.feasible).toBe(false);
      expect(s.diagnosis?.kind).toBe('sloper-steep');
      expect(isHand(s.diagnosis!.limb!)).toBe(true);
      expect(s.diagnosis!.text).toMatch(steepText);
    });

    it('says an assumed sloper surface may be too steep, and how to fix the guess', () => {
      const s = solveStance(onSlopers({ normal: unit([0, -0.6, 1]), source: 'assumed' }), vertical);
      expect(s.feasible).toBe(false);
      expect(s.diagnosis?.kind).toBe('sloper-steep');
      expect(isHand(s.diagnosis!.limb!)).toBe(true);
      expect(s.diagnosis!.text).toMatch(mayText);
    });

    it('holds slopers the user set to pull Down', () => {
      const s = solveStance(onSlopers({ normal: UP, source: 'user' }, DOWN), vertical);
      expect(s.feasible).toBe(true);
    });
  });

  it('is stricter on a steeper wall (AC 29)', () => {
    const contacts = onSlopers({ normal: tilted(20), source: 'measured' });
    expect(solveStance(contacts, vertical).feasible).toBe(true);
    // On Overhang 20° the same surface is 40° from true up.
    const up = gravityFor(20).map((x) => -x) as Vec3;
    const n = tilted(20);
    const steepness = Math.acos(n[0] * up[0] + n[1] * up[1] + n[2] * up[2]);
    expect((steepness * 180) / Math.PI).toBeCloseTo(40, 9);
    const s = solveStance(contacts, { height: H, wallAngleDeg: 20 });
    expect(s.feasible).toBe(false);
    if (s.diagnosis?.limb && isHand(s.diagnosis.limb)) {
      expect(s.diagnosis.kind).toBe('sloper-steep');
    }
  });

  // An invented start (H = 1000, round numbers): a crimp sidepull and an assumed sloper.
  describe('a crimp sidepull and an assumed sloper (AC 32)', () => {
    const typeRule = unit([0, 0.6, -1]);
    const hands: StanceContacts = {
      lh: { holdId: '2', point: [-100, 0], type: 'crimp', dir: unit([1, 0, -0.3]) },
      rh: {
        holdId: '1',
        point: [100, 100],
        type: 'sloper',
        dir: typeRule,
        surface: { normal: unit([0, -0.6, 1]), source: 'assumed' },
      },
    };
    const onFootholds: StanceContacts = {
      ...hands,
      lf: { holdId: 'blob:a', point: [-50, 600], type: null, dir: null },
      rf: { holdId: 'blob:b', point: [150, 600], type: null, dir: null },
    };

    it('holds on Vertical with the feet on wall footholds, the feet taking most of it', () => {
      const s = solveStance(onFootholds, { height: H, wallAngleDeg: 0 });
      expect(s.feasible).toBe(true);
      expect(shares(s).reduce((a, b) => a + b, 0)).toBe(100);
      expect(s.load.lf!.share + s.load.rf!.share).toBeGreaterThanOrEqual(50);
    });

    it('holds on Slab', () => {
      expect(solveStance(onFootholds, { height: H, wallAngleDeg: -10 }).feasible).toBe(true);
    });

    it('can’t be held with the same hands on two smears (the gap this fixes)', () => {
      // Where contactsFor smears: the hands' mean x ∓ 0.21 H, the lower hand + 0.58 H.
      const s = solveStance(
        {
          ...hands,
          lf: hold(0 - 0.21 * H, 100 + 0.58 * H, 'smear', null),
          rf: hold(0 + 0.21 * H, 100 + 0.58 * H, 'smear', null),
        },
        { height: H, wallAngleDeg: 0 },
      );
      expect(s.feasible).toBe(false);
      expect(s.diagnosis?.kind).toBe('sloper-steep');
    });
  });
});

/** Point in a convex polygon, boundary counts as inside (1 px slack). */
function insideHull(hull: [number, number][], p: [number, number]): boolean {
  if (hull.length < 3) return false;
  let sign = 0;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]!;
    const b = hull[(i + 1) % hull.length]!;
    const c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    if (Math.abs(c / len) <= 1) continue;
    const s = Math.sign(c);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

/** Angle at b between a and c, in degrees (3D). */
function angleAt(a: Vec3, b: Vec3, c: Vec3): number {
  const u = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const v = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
  const dot = u[0]! * v[0]! + u[1]! * v[1]! + u[2]! * v[2]!;
  return (Math.acos(dot / (Math.hypot(...u) * Math.hypot(...v))) * 180) / Math.PI;
}

// SPEC-climber-stance › Amendment: Book-Based Stance (東秀磯 2018, checked against 19 real climbs).
describe('stance shape (book model)', () => {
  // A stand start: hands at chest height, feet 0.65 H lower.
  const standStart: StanceContacts = {
    lh: hold(-100, 0),
    rh: hold(100, 0),
    lf: hold(-120, 650, 'edge'),
    rf: hold(120, 650, 'edge'),
  };

  it('stands on near-straight legs (p19, p117, p120)', () => {
    const j = solveStance(standStart, { height: H, wallAngleDeg: 0 }).joints!;
    expect(angleAt(j.lHip, j.lKnee, j.lFoot)).toBeGreaterThan(150);
    expect(angleAt(j.rHip, j.rKnee, j.rFoot)).toBeGreaterThan(150);
  });

  it('pulls with bent arms when the hands are at chest height (p39)', () => {
    const j = solveStance(standStart, { height: H, wallAngleDeg: 0 }).joints!;
    expect(angleAt(j.lShoulder, j.lElbow, j.lHand)).toBeLessThan(165);
  });

  it('keeps the hips close to the wall (p19, p139)', () => {
    const j = solveStance(standStart, { height: H, wallAngleDeg: 0 }).joints!;
    // Aimed at 0.1 H; a short span pushes them out a little, never past the old 0.2 H target.
    expect(j.pelvis[2]).toBeLessThanOrEqual(0.2 * H);
  });

  it('bends the knee of a high-stepped foot and stands on the other (p93-95)', () => {
    const highStep: StanceContacts = { ...standStart, rf: hold(140, 250, 'edge') };
    const j = solveStance(highStep, { height: H, wallAngleDeg: 0 }).joints!;
    expect(angleAt(j.rHip, j.rKnee, j.rFoot)).toBeLessThan(140);
    expect(angleAt(j.lHip, j.lKnee, j.lFoot)).toBeGreaterThan(150);
  });

  // On the earlier sample route the hips rest on the search's floor (`anyFeet.test.ts`), where no
  // prior can move them. With deeper feet the posture prior sets the hip height instead, so a prior
  // change shows up here (real starts: median 0.275 H below the hands). Pinned to ±0.005 H: a leg reach of 0.85 instead
  // of 0.97 moves the hips only 0.03 H (to 0.390), and 1.0 moves them 0.007 H (to 0.367).
  it('hangs the hips off the floor when the feet are 0.72 H down (B1)', () => {
    const deep: StanceContacts = {
      lh: hold(-100, 0),
      rh: hold(100, 0),
      lf: hold(-210, 720, 'edge'),
      rf: hold(210, 720, 'edge'),
    };
    const s = solveStance(deep, { height: H, wallAngleDeg: 0 });
    expect(s.feasible).toBe(true);
    const below = s.joints!.pelvis[1] / H;
    expect(below).toBeGreaterThan(DEFAULT_PRIOR.hipsBelowHands + 0.1);
    expect(below).toBeCloseTo(0.36, 2);
  });

  it('opens the knees to the side, not away from the wall (p54, p139)', () => {
    const j = solveStance(standStart, { height: H, wallAngleDeg: 0 }).joints!;
    // Knees no further from the wall than the hips.
    expect(j.lKnee[2]).toBeLessThanOrEqual(j.pelvis[2] + 1e-6);
    expect(j.rKnee[2]).toBeLessThanOrEqual(j.pelvis[2] + 1e-6);
  });
});

// Amendment 2026-11-01 (c), picked footholds (builder's call; the user can veto): a foot on a tagged
// hold stands on its top with the foothold cone, whatever the hold's hand type.
describe('a foot on a tagged hold typed for hands', () => {
  const jugHands = { lh: hold(-100, 0), rh: hold(100, 0) };
  it.each(['sloper', 'volume'])('on a %s solves as on an untyped foothold', (type) => {
    const typed: StanceContacts = {
      ...jugHands,
      lf: hold(-120, 650, type, [0, 0.6, -1]),
      rf: hold(120, 650, type, null),
    };
    const plain: StanceContacts = {
      ...jugHands,
      lf: hold(-120, 650, null, null),
      rf: hold(120, 650, null, null),
    };
    const a = solveStance(typed, { height: H, wallAngleDeg: 0 });
    const b = solveStance(plain, { height: H, wallAngleDeg: 0 });
    expect(b.feasible).toBe(true);
    expect(b.load.lf!.share + b.load.rf!.share).toBeGreaterThan(30);
    expect(a.feasible).toBe(true);
    expect(a.joints).toEqual(b.joints);
    expect(a.load).toEqual(b.load);
  });
});

// SPEC-beta-moves A4: `region: false` skips the region grid and changes nothing else.
describe('solveStance without the region (A4)', () => {
  const fixtures: [string, StanceContacts, number][] = [
    ['AC 4', fourPoint(), 0],
    ['AC 5', fourPoint(), 35],
    ['AC 6 jugs', { lh: hold(-100, 0), rh: hold(100, 0) }, 35],
    [
      'AC 6 slopers',
      { lh: hold(-100, 0, 'sloper', [0, 0.6, -1]), rh: hold(100, 0, 'sloper', [0, 0.6, -1]) },
      35,
    ],
    ['AC 7', { lh: hold(-100, 0), lf: hold(-100, 750, 'edge') }, 0],
    ['AC 8', fourPoint('edge', UP), 0],
    ['AC 9', { lh: hold(-100, 0), rh: hold(100, 0), lf: hold(-120, 1200, 'edge') }, 0],
  ];

  it.each(fixtures)(
    '%s: the same joints, loads and verdict, and no region',
    (_, contacts, angle) => {
      const full = solveStance(contacts, { height: H, wallAngleDeg: angle, region: true });
      const bare = solveStance(contacts, { height: H, wallAngleDeg: angle, region: false });
      expect(bare.region).toEqual([]);
      expect({ ...bare, region: full.region }).toEqual(full);
    },
  );

  it('computes the region when the option is left out (the default)', () => {
    const contacts = fourPoint();
    expect(solveStance(contacts, { height: H, wallAngleDeg: 0 })).toEqual(
      solveStance(contacts, { height: H, wallAngleDeg: 0, region: true }),
    );
    expect(solveStance(contacts, { height: H, wallAngleDeg: 0 }).region.length).toBeGreaterThan(2);
  });
});

// Amendment 2026-11-04, M2: every pose the solver shows keeps its joints within their range.
describe('solveStance › joint range (M2)', () => {
  const H = 1000;
  const jug = (x: number, y: number): ContactInput => ({
    holdId: `j${x},${y}`,
    point: [x, y],
    type: 'jug',
    dir: [0, 1, 0],
  });
  const foot = (x: number, y: number): ContactInput => ({
    holdId: `f${x},${y}`,
    point: [x, y],
    type: null,
    dir: null,
  });
  const bend = (a: Vec3, mid: Vec3, b: Vec3) => {
    const u = sub(a, mid);
    const w = sub(b, mid);
    const cos = (u[0] * w[0] + u[1] * w[1] + u[2] * w[2]) / (norm(u) * norm(w));
    return 180 - (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
  };

  it.each([
    [-250, 300],
    [-200, 200],
    [-450, 50],
    [-100, 150],
  ])('high left foot at (%i, %i): knee ≤ 140°, elbow ≤ 145°, hip ≤ 130°', (fx, fy) => {
    const s = solveStance(
      { lh: jug(-100, 0), rh: jug(100, 0), lf: foot(fx, fy), rf: foot(150, 600) },
      { height: H, wallAngleDeg: 0, region: false },
    );
    expect(s.feasible).toBe(true);
    const j = s.joints!;
    for (const k of ['l', 'r'] as const) {
      expect(bend(j[`${k}Hip`], j[`${k}Knee`], j[`${k}Foot`])).toBeLessThanOrEqual(
        JOINT_RANGE.knee + 1e-6,
      );
      expect(bend(j[`${k}Shoulder`], j[`${k}Elbow`], j[`${k}Hand`])).toBeLessThanOrEqual(
        JOINT_RANGE.elbow + 1e-6,
      );
      expect(hipAngle(j[`${k}Knee`], j[`${k}Hip`], sub(j.pelvis, j.neck))).toBeLessThanOrEqual(
        JOINT_RANGE.hip + 1e-6,
      );
    }
  });
});

// Amendment 2026-11-04, M1: with both feet off, the hips rest on the wall.
describe('solveStance › feet cut, the body on the wall (M1)', () => {
  const H = 1000;
  const jug = (x: number): ContactInput => ({
    holdId: `j${x}`,
    point: [x, 0],
    type: 'jug',
    dir: [0, 1, 0],
  });
  const solve = (c: StanceContacts, wallAngleDeg: number) =>
    solveStance(c, { height: H, wallAngleDeg, region: false });
  const total = (s: ReturnType<typeof solve>) =>
    Object.values(s.load).reduce((t, l) => t + l!.share, 0) + (s.body?.share ?? 0);

  it('hangs from two jugs on a vertical wall with the hips on the wall (AC 41)', () => {
    const s = solve({ lh: jug(-100), rh: jug(100) }, 0);
    expect(s.feasible).toBe(true);
    expect(s.body).not.toBeNull();
    expect(s.body!.percent).toBeGreaterThanOrEqual(10);
    expect(s.body!.percent).toBeLessThanOrEqual(25);
    expect(total(s)).toBeCloseTo(100, 0);
    expect(s.joints!.pelvis[2]).toBeLessThanOrEqual(BODY_TOUCH * H + 1e-9);
    // The wall only pushes the body out.
    expect(s.body!.force[2]).toBeLessThan(0);
  });

  it('hangs from one jug on a vertical wall (AC 42)', () => {
    const s = solve({ lh: jug(0) }, 0);
    expect(s.feasible).toBe(true);
    expect(s.body).not.toBeNull();
    expect(total(s)).toBeCloseTo(100, 0);
  });

  it('has no body contact with a foot on, or on an overhang where the hips hang clear (AC 43)', () => {
    const foot: ContactInput = { holdId: 'f', point: [0, 600], type: null, dir: null };
    expect(solve({ lh: jug(-100), rh: jug(100), lf: foot }, 0).body).toBeNull();
    for (const angle of [20, 35, 45]) {
      const s = solve({ lh: jug(-100), rh: jug(100) }, angle);
      expect(s.feasible).toBe(true);
      expect(s.body).toBeNull();
      expect(s.load.lh!.share).toBeCloseTo(50, 0);
      expect(s.load.rh!.share).toBeCloseTo(50, 0);
    }
  });

  it('still falls with the feet cut from a sloper pulled into the wall', () => {
    const s = solve(
      { lh: { holdId: 's', point: [0, 0], type: 'sloper', dir: unit([0, 0.6, -1]) } },
      0,
    );
    expect(s.feasible).toBe(false);
    expect(s.body).toBeNull();
  });
});

// Amendment 2026-11-04, M3: heel and toe hooks on picked route holds.
describe('solveStance › hooks (M3)', () => {
  const H = 1000;
  const h = (type: string, x: number, y: number, dir: Vec3 | null = [0, 1, 0]): ContactInput => ({
    holdId: `${type}${x},${y}`,
    point: [x, y],
    type,
    dir,
  });
  const solve = (c: StanceContacts, wallAngleDeg: number) =>
    solveStance(c, { height: H, wallAngleDeg, region: false });
  const hands = (s: ReturnType<typeof solve>) => s.load.lh!.share + s.load.rh!.share;

  it.each([35, 45])(
    'a heel hook at hand height takes weight off the arms at %i° (AC 47)',
    (angle) => {
      const base = { lh: h('jug', -100, 0), rh: h('jug', 100, 0), rf: h('edge', 100, 550, null) };
      const stand = solve({ ...base, lf: h('jug', -450, 50) }, angle);
      const heel = solve({ ...base, lf: { ...h('jug', -450, 50), hook: 'heel' } }, angle);
      expect(stand.feasible && heel.feasible).toBe(true);
      expect(hands(stand)).toBeGreaterThanOrEqual(70);
      expect(hands(heel)).toBeLessThanOrEqual(55);
    },
  );

  it('a toe hook out right stops a barn door that standing there can’t (AC 48)', () => {
    const base = { lh: h('edge', -100, 0), lf: h('edge', -100, 600, null) };
    expect(solve(base, 45).diagnosis?.kind).toBe('barn-door');
    expect(solve({ ...base, rf: h('jug', 350, 300) }, 45).feasible).toBe(false);
    const toe = solve({ ...base, rf: { ...h('jug', 350, 300), hook: 'toe' } }, 45);
    expect(toe.feasible).toBe(true);
    expect(toe.load.rf!.share).toBeGreaterThan(0);
  });

  it('ignores a hook on a hand, a smear or a wall foothold', () => {
    const base = { lh: h('jug', -100, 0), rh: h('jug', 100, 0), rf: h('edge', 100, 550, null) };
    const plain = (c: ContactInput) => JSON.stringify(solve({ ...base, lf: c }, 35));
    const hooked = (c: ContactInput) =>
      JSON.stringify(solve({ ...base, lf: { ...c, hook: 'heel' } }, 35));
    const smear: ContactInput = { holdId: 'wall', point: [-120, 600], type: 'smear', dir: null };
    const blob: ContactInput = { holdId: 'blob:3', point: [-120, 600], type: null, dir: null };
    const wf: ContactInput = { holdId: 'wf:-120:600', point: [-120, 600], type: null, dir: null };
    for (const c of [smear, blob, wf]) expect(hooked(c)).toBe(plain(c));
    const lh = { ...base, lf: h('edge', -120, 600, null) };
    expect(JSON.stringify(solve({ ...lh, lh: { ...lh.lh, hook: 'heel' } }, 35))).toBe(
      JSON.stringify(solve(lh, 35)),
    );
  });

  it('gives a heel the hand cone’s axis at 45°, and a toe a cone toward its side and the wall', () => {
    const [heel] = resolveContacts({ lf: { ...h('jug', -450, 50), hook: 'heel' } });
    heel!.cone.axis.forEach((v, i) => expect(v).toBeCloseTo([0, -1, 0][i]!, 12));
    expect(heel!.cone.halfAngle).toBeCloseTo(Math.PI / 4, 12);
    const toes = resolveContacts({
      lh: h('jug', 0, 0),
      lf: { ...h('jug', -300, 300), hook: 'toe' },
      rf: { ...h('jug', 300, 300), hook: 'toe' },
    });
    expect(toes[1]!.cone.axis).toEqual(unit([-1, 0, -1]));
    expect(toes[2]!.cone.axis).toEqual(unit([1, 0, -1]));
    expect(toes[2]!.hook).toBe('toe');
  });
});

// PR #18 review: regressions found by random stances (H = 1000, jug hands pulled down).
describe('solveStance › R1 review regressions', () => {
  const H = 1000;
  const mk = (o: Partial<Record<'lh' | 'rh' | 'lf' | 'rf', [number, number]>>): StanceContacts =>
    Object.fromEntries(
      Object.entries(o).map(([l, p]) => [
        l,
        { holdId: `${l}${p}`, point: p, type: l[1] === 'h' ? 'jug' : null, dir: [0, 1, 0] },
      ]),
    );
  const solve = (c: StanceContacts, wallAngleDeg = 0) =>
    solveStance(c, { height: H, wallAngleDeg, region: false });

  // Review 1: a hip-limit failure used to cost a flat UNREACHABLE_COST, so the pattern search lost
  // its slope toward the reaching pose between grid points ("Out of reach" on a holdable stance).
  it('still finds the pose between grid points past a hip-limit failure (review 1)', () => {
    const s = solve(mk({ lh: [-257, 0], rh: [257, 38], lf: [-206, -20], rf: [582, 744] }));
    expect(s.feasible).toBe(true);
  });

  // Review 2: a foot above the hip that only the hip's range stops is too high, not too close.
  it('a foot the hip can’t lift to reads "Too high", with lower-hold advice (review 2)', () => {
    // The left foot stands 0.27 H above the hands: no 130° hip puts it there (main held it).
    const s = solve(mk({ lh: [-114, 159], rh: [61, 170], lf: [-174, -102], rf: [350, 527] }));
    expect(s.feasible).toBe(false);
    expect(s.diagnosis).toEqual({ kind: 'reach', limb: 'lf', text: highText('lf'), cramped: true });
    expect(highText('lf')).toBe('Too high: left foot — pick a lower foothold');
  });

  // Review 4: a body contact that carries nothing is no body contact.
  it('reports no body on the wall when it carries (next to) nothing (review 4)', () => {
    const s = solve(mk({ lh: [-100, 0], rh: [100, 0] }), 15);
    expect(s.feasible).toBe(true);
    expect(s.body).toBeNull();
  });
});
