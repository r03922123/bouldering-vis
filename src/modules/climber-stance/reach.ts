import { bodyDims, trunkJoints, type BodyDims } from './body';
import type { Contact } from './equilibrium';
import { hipFits, legPole, minReach, twoBone } from './ik';
import {
  DEFAULT_PRIOR,
  hipFloor,
  LIMB_ROOT,
  PELVIS_SEARCH,
  trunkDirection,
  type StanceContacts,
  type StanceOptions,
} from './stance';
import { isHand, LIMBS, type Limb } from './types';
import { add, norm, scale, sub, type Vec3 } from './vec';

// SPEC-beta-moves A3: the solver's reach envelope, for a move's reach check (B4). Pure.

const { GRID_STEP, DEPTHS, Z_MIN, Z_MAX } = PELVIS_SEARCH;
/** The pattern search stops below this step (× H), as the solver's does. */
const MIN_STEP = 0.003;
/** Without a box, the x/y search spans the contacts plus the solver's margins (× H). */
const SIDE_MARGIN = 0.5;
const ABOVE_MARGIN = 0.3;
const BELOW_MARGIN = 0.6;

export interface ReachResult {
  /** Per moving limb: distance ÷ limb length (root joint to target), 3 decimals; Infinity if none. */
  ratios: Partial<Record<Limb, number>>;
  /** The pelvis the ratios were taken at, or null when no pelvis keeps the staying limbs on. */
  pelvis: Vec3 | null;
  /**
   * Amendment 2026-11-04, M2: the moving limbs, when no pelvis fits only because of the joints'
   * range of motion (without the limits one would); otherwise empty.
   */
  cramped: Limb[];
  /**
   * Private PR #18 review 2: the moving legs, when the hip's range alone is what stops every pelvis (the
   * knee's and elbow's fold allowed): a foot too high, not too close. Empty otherwise.
   */
  high: Limb[];
}

interface Point {
  limb: Limb;
  point: Vec3;
}

const pointsOf = (contacts: StanceContacts): Point[] =>
  LIMBS.flatMap((limb) => {
    const c = contacts[limb];
    return c ? [{ limb, point: [c.point[0], c.point[1], 0] as Vec3 }] : [];
  });

const lengths = (limb: Limb, d: BodyDims) =>
  isHand(limb) ? ([d.upperArm, d.forearm] as const) : ([d.thigh, d.shank] as const);

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * For the moving limbs, the reach ratio (distance ÷ limb length, root joint to target) at the pelvis
 * that minimises the largest moving ratio, over pelvis positions where every staying limb reaches
 * (`minReach` ≤ distance ≤ a + b, and a leg's thigh within the hip's range; Amendment 2026-11-04, M2)
 * and no moving limb is closer than `minReach`. The x/y search is limited to
 * ±`around.radius` of `around.pelvis` (no limit when `around` is null). Depth and grid are the
 * solver's: GRID_STEP 0.06 H, DEPTHS 0.10–0.38 H, then a pattern search clamped to Z 0.08–0.45 H and
 * halved down to 0.003 H. Trunk: the solver's trunkDirection over all hand points (staying hands and
 * moving hand targets), leaning by the posture prior's `lean`. The hip floor is the solver's own
 * `hipFloor` over the same hand points (the prior's `hipsBelowHands`, 0.15 H, below the highest
 * hand, moving targets included; SPEC-beta-moves OQ 11). `opts.prior` overrides both, as in
 * solveStance. Pure.
 */
export function reachRatios(
  stay: StanceContacts,
  moving: StanceContacts,
  opts: StanceOptions,
  around: { pelvis: Vec3; radius: number } | null,
): ReachResult {
  const H = opts.height;
  const d = bodyDims(H);
  // The solver's own posture prior (its hip floor and trunk lean), with the same overrides.
  const prior = { ...DEFAULT_PRIOR, ...opts.prior };
  const kept = pointsOf(stay);
  const moved = pointsOf(moving);
  const all = [...kept, ...moved];
  // trunkDirection reads only each contact's limb and point.
  const hands = all.filter((p) => isHand(p.limb)) as unknown as Contact[];
  const none = (cramped: Limb[] = [], high: Limb[] = []): ReachResult => ({
    ratios: Object.fromEntries(moved.map((p) => [p.limb, Infinity])),
    pelvis: null,
    cramped,
    high,
  });
  if (!all.length) return none();

  /**
   * The largest moving ratio at this pelvis, or Infinity when the pelvis isn't allowed. M2's joint
   * limits apply as in the solver: no limb nearer than `minReach` (`fold`), and a leg that reaches
   * keeps its thigh within the hip's range, its knee placed by the solver's own pole (`hip`). Each
   * is switched off only to tell a cramped or too-high move from a far one.
   */
  const score = (pelvis: Vec3, rom = { fold: true, hip: true }): number => {
    const t = trunkJoints(pelvis, trunkDirection(pelvis, hands, prior.lean), d);
    const down = sub(t.pelvis, t.neck);
    let worst = 0;
    for (const p of all) {
      const [a, b] = lengths(p.limb, d);
      const root = t[LIMB_ROOT[p.limb]];
      const dist = norm(sub(p.point, root));
      if (dist < (rom.fold ? minReach(p.limb, d) : Math.abs(a - b))) return Infinity;
      const isKept = kept.includes(p);
      if (isKept && dist > a + b) return Infinity;
      if (rom.hip && !isHand(p.limb) && dist <= a + b) {
        const leg = p.limb as 'lf' | 'rf';
        const knee = twoBone(root, p.point, a, b, legPole(leg, t.right), minReach(leg, d)).mid;
        if (!hipFits(knee, root, down)) return Infinity;
      }
      if (!isKept) worst = Math.max(worst, dist / (a + b));
    }
    return worst;
  };

  const xs = all.map((p) => p.point[0]);
  const ys = all.map((p) => p.point[1]);
  // The solver's floor over every hand point, the moving hands' targets included (OQ 11).
  const yFloor =
    hipFloor(
      hands.map((p) => p.point[1]),
      H,
      prior,
    ) ?? -Infinity;
  const box = around
    ? {
        x0: around.pelvis[0] - around.radius,
        x1: around.pelvis[0] + around.radius,
        y0: Math.max(yFloor, around.pelvis[1] - around.radius),
        y1: around.pelvis[1] + around.radius,
        cx: around.pelvis[0],
      }
    : {
        x0: Math.min(...xs) - SIDE_MARGIN * H,
        x1: Math.max(...xs) + SIDE_MARGIN * H,
        y0: Number.isFinite(yFloor) ? yFloor : Math.min(...ys) - ABOVE_MARGIN * H,
        y1: Math.max(...ys) + BELOW_MARGIN * H,
        cx: xs.reduce((s, x) => s + x, 0) / xs.length,
      };
  if (box.y0 > box.y1) return none();

  // The solver's grid: centred on the box, so a symmetric move gets a symmetric answer.
  const step = GRID_STEP * H;
  const half = Math.floor(Math.max(box.cx - box.x0, box.x1 - box.cx) / step);
  const scan = (fn: (pelvis: Vec3) => number) => {
    let found: { pelvis: Vec3; score: number } | null = null;
    for (let i = -half; i <= half; i++) {
      const x = box.cx + i * step;
      if (x < box.x0 - 1e-9 || x > box.x1 + 1e-9) continue;
      for (let y = box.y0; y <= box.y1 + 1e-9; y += step) {
        for (const z of DEPTHS) {
          const pelvis: Vec3 = [x, y, z * H];
          const s = fn(pelvis);
          if (s < (found?.score ?? Infinity)) found = { pelvis, score: s };
        }
      }
    }
    return found;
  };
  let best = scan((p) => score(p));
  // M2 rule 3: without the joint limits a pelvis fits, so the move is cramped, not far; when the
  // hip's range alone is what stops it, its legs are too high (private PR #18 review 2).
  if (!best) {
    const limbs = moved.map((p) => p.limb);
    if (scan((p) => score(p, { fold: true, hip: false }))) {
      return none(
        limbs,
        limbs.filter((l) => !isHand(l)),
      );
    }
    return none(scan((p) => score(p, { fold: false, hip: false })) ? limbs : []);
  }

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const dirs: Vec3[] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  for (let s = 0.5 * step; s > MIN_STEP * H;) {
    let improved = false;
    for (const dir of dirs) {
      const p = add(best.pelvis, scale(dir, s));
      p[0] = clamp(p[0], box.x0, box.x1);
      p[1] = clamp(p[1], box.y0, box.y1);
      p[2] = clamp(p[2], Z_MIN * H, Z_MAX * H);
      const v = score(p);
      if (v < best.score - 1e-12) {
        best = { pelvis: p, score: v };
        improved = true;
      }
    }
    if (!improved) s /= 2;
  }

  const t = trunkJoints(best.pelvis, trunkDirection(best.pelvis, hands, prior.lean), d);
  const ratios: Partial<Record<Limb, number>> = {};
  for (const p of moved) {
    const [a, b] = lengths(p.limb, d);
    ratios[p.limb] = round3(norm(sub(p.point, t[LIMB_ROOT[p.limb]])) / (a + b));
  }
  return { ratios, pelvis: best.pelvis, cramped: [], high: [] };
}
