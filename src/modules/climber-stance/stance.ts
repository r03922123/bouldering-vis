import { bodyDims, centerOfMass, trunkJoints, type BodyDims, type Joints } from './body';
import { coneFor, hookCone, type Hook } from './cones';
import { diagnose, type Diagnosis } from './diagnose';
import { bodyContact, solveForces, type Contact, type ForceSolution } from './equilibrium';
import { hipAngle, JOINT_RANGE, legPole, minReach, twoBone } from './ik';
import { feasibleRegion, type Point2 } from './region';
import { isHand, LIMBS, type Limb } from './types';
import { add, norm, scale, sub, unit, type Vec3 } from './vec';

// SPEC-climber-stance › How It Works. Pure: the same contacts and options give the same stance.

export interface ContactInput {
  holdId: string;
  /** Hold centroid, image pixels. */
  point: [number, number];
  /** Effective hold type (a user override wins), as a plain string. */
  type: string | null;
  /** Effective force the hand applies (hold-geometry `forceWithOverride`), or null. */
  dir: Vec3 | null;
  /** Sloper or volume hands only: the grip surface's outward normal in the wall frame (rule 11). */
  surface?: { normal: Vec3; source: 'measured' | 'user' | 'assumed' } | null;
  /**
   * Amendment 2026-11-04, M3: a heel or toe hook. Feet on picked route holds only; ignored on hands,
   * smears and wall footholds (`blob:` / `wf:`, which are chips).
   */
  hook?: Hook;
}

export type StanceContacts = Partial<Record<Limb, ContactInput | null>>;

export interface StanceOptions {
  /** Climber height in image pixels. */
  height: number;
  /** S4: −10 slab, 0 vertical, > 0 overhang. */
  wallAngleDeg: number;
  /** Overrides for the posture prior (calibration against real climbs; defaults otherwise). */
  prior?: Partial<PosturePrior>;
  /** SPEC-beta-moves A4: false skips the region grid (`region: []`). Default true. */
  region?: boolean;
}

/**
 * S8/S10: how a natural static stance looks (no physics). Lengths are × climber height, reaches are
 * the limb's straight-line length over its full length.
 */
export interface PosturePrior {
  /** Pulling arms near this reach (bent: strongest around 90° at the elbow, p39). */
  armReach: number;
  /** A loaded leg anywhere in this range (near-straight: weight on the skeleton, p19). */
  legReach: [number, number];
  /** A foot at least this far (× H) above the other one is a high step: its leg may bend (p93). */
  highStep: number;
  /** Pelvis this far off the wall… */
  hipDepth: number;
  /** …and steeply penalised beyond this (hand pull grows with hip distance, p19). */
  hipDepthMax: number;
  /** Weight of keeping the pelvis over the middle of all its holds (sideways). */
  centred: number;
  /** Weight of keeping the pelvis over the middle of its feet (sideways). */
  overFeet: number;
  /** Hips at least this far below the highest hand (no mantles in Stage 1). */
  hipsBelowHands: number;
  /** Trunk direction: 0 = straight up the wall, 1 = pointing at the hands. */
  lean: number;
  /** How much least effort (2·Σ‖hand‖² + Σ‖foot‖²) shapes the pose next to the posture terms. */
  loadWeight: number;
}

export interface Stance {
  joints: Joints | null;
  com: Vec3;
  /**
   * Per limb: the force it applies to its hold (bodyweights), its size as % of bodyweight, and its
   * `share` of the weight (% along gravity; the shares add up to 100, an undercling's is negative).
   */
  load: Partial<Record<Limb, { percent: number; share: number; force: Vec3 }>>;
  /**
   * Amendment 2026-11-04, M1: the hips on the wall (both feet off): the force the body applies to the
   * wall, its size and its share, as `load`'s (the limbs' shares plus this one add up to 100). Null
   * when the shown pose doesn't rest on the wall or the stance can't be held.
   */
  body: { percent: number; share: number; force: Vec3 } | null;
  /** Per assigned limb: does it reach its hold? */
  reach: Partial<Record<Limb, boolean>>;
  feasible: boolean;
  diagnosis: Diagnosis | null;
  /** Where the CoM can be on the wall plane (convex, image pixels). */
  region: Point2[];
  /** Weight direction for this wall angle (for the plumb line). */
  gravity: Vec3;
}

/** Weight direction in the wall frame (overhang > 0 pulls the climber off the wall). */
export function gravityFor(wallAngleDeg: number): Vec3 {
  const a = (wallAngleDeg * Math.PI) / 180;
  return [0, Math.cos(a), Math.sin(a)];
}

const ROOT: Record<Limb, 'lShoulder' | 'rShoulder' | 'lHip' | 'rHip'> = {
  lh: 'lShoulder',
  rh: 'rShoulder',
  lf: 'lHip',
  rf: 'rHip',
};
const MID = { lh: 'lElbow', rh: 'rElbow', lf: 'lKnee', rf: 'rKnee' } as const;
const END = { lh: 'lHand', rh: 'rHand', lf: 'lFoot', rf: 'rFoot' } as const;

/** Search box for the pelvis, in heights (S8). */
const GRID_STEP = 0.06;
const DEPTHS = [0.1, 0.17, 0.24, 0.31, 0.38];
const Z_MIN = 0.08;
const Z_MAX = 0.45;
/**
 * S10 (revised after review): the pose comes from a posture prior, and the forces are then the
 * least-effort ones at that pose. Choosing the pose by the load cost made every vertical 4-point
 * stance split 17/17/33/33 (just the cost weights), whatever the feet did.
 */
export const DEFAULT_PRIOR: PosturePrior = {
  armReach: 0.8,
  legReach: [0.97, 1],
  highStep: 0.3,
  hipDepth: 0.1,
  hipDepthMax: 0.15,
  centred: 0,
  overFeet: 1,
  hipsBelowHands: 0.15,
  lean: 0.25,
  loadWeight: 0.05,
};
/** The free (high-stepped or unloaded) leg's reach range. */
const FREE_LEG: [number, number] = [0.45, 1];
/**
 * Amendment 2026-10-31 (b), rule 8: from this overhang (degrees) a foot with no foothold dangles
 * instead of smearing. Ours, from a spike on this solver: with jugs, smears carried 1–2 % each at
 * 20° and 0 % at 35° (AC 31). From here a smear is not a loaded leg either, so the book's
 * near-straight leg (B1) doesn't apply to it.
 */
export const DANGLE_FROM_DEG = 20;
/** Amendment 2026-11-04, M1: below this (% bodyweight) the hips only touch the wall. */
const BODY_MIN_PERCENT = 0.5;
const HIP_DEPTH_PENALTY = 10;
const INFEASIBLE_COST = 100;
const UNREACHABLE_COST = 1e4;

interface Candidate {
  pelvis: Vec3;
  /** Bit per limb that doesn't reach (LIMBS order). */
  missing: number;
  /**
   * Amendment 2026-11-04, M2: the `missing` bits that are too close rather than too far (within the
   * limb's length, but past a joint's range of motion).
   */
  cramped: number;
  /** The `cramped` bits that fail the hip's range only (a foot too high for the hip to lift). */
  high: number;
  /** Null when a limb doesn't reach (no balance solve). */
  com: Vec3 | null;
  sol: ForceSolution | null;
  cost: number;
  /** Posture prior alone (no physics); Infinity when a limb doesn't reach. */
  posture: number;
}

/**
 * Amended AC 4: costs this close are a tie. A mirror-symmetric stance has two mirror-image best
 * poses (the hips over one foot or the other), and rounding alone used to pick between them; a tie
 * goes to the pose further left, so every symmetric stance that can be held settles on its left foot.
 */
const TIE = 1e-9;

/** Does candidate `a` beat `b`? Ties go to the pelvis further left. */
function better(a: Candidate, b: Candidate): boolean {
  return a.cost < b.cost - TIE || (a.cost <= b.cost + TIE && a.pelvis[0] < b.pelvis[0]);
}

/** The trunk leans toward the hands by `lean` (0 = up the wall, 1 = at the hands). */
function trunkDirection(pelvis: Vec3, contacts: readonly Contact[], lean: number): Vec3 {
  const up: Vec3 = [0, -1, 0];
  const hands = contacts.filter((c) => c.limb === 'lh' || c.limb === 'rh');
  if (!hands.length) return up;
  const mid = scale(
    hands.reduce<Vec3>((s, c) => add(s, c.point), [0, 0, 0]),
    1 / hands.length,
  );
  const toHands = unit([mid[0] - pelvis[0], mid[1] - pelvis[1], 0]);
  // Hands straight below the pelvis would cancel "up": stay upright then.
  const dir = unit(add(scale(toHands, lean), scale(up, 1 - lean)));
  return norm(dir) > 1e-6 ? dir : up;
}

function place(
  pelvis: Vec3,
  contacts: readonly Contact[],
  d: BodyDims,
  gravity: Vec3,
  prior: PosturePrior,
): {
  joints: Joints;
  reach: Partial<Record<Limb, boolean>>;
  missing: number;
  cramped: number;
  high: number;
  /** PR #18 review 1: how far past the hip's range (a slope for the pattern search). */
  excess: number;
  posture: number;
} {
  const t = trunkJoints(pelvis, trunkDirection(pelvis, contacts, prior.lean), d);
  const r = t.right;
  const pole: Record<Limb, Vec3> = {
    lh: unit(add(scale(r, -0.4), [0, 1, 0.3])),
    rh: unit(add(scale(r, 0.4), [0, 1, 0.3])),
    lf: legPole('lf', r),
    rf: legPole('rf', r),
  };
  const joints = { ...t } as unknown as Joints;
  const reach: Partial<Record<Limb, boolean>> = {};
  let missing = 0;
  let cramped = 0;
  let hipBits = 0;
  let excess = 0;
  const down = sub(t.pelvis, t.neck);
  const cx = contacts.reduce((s, c) => s + c.point[0], 0) / Math.max(1, contacts.length);
  const z = pelvis[2] / d.height;
  let posture =
    (z - prior.hipDepth) ** 2 +
    HIP_DEPTH_PENALTY * Math.max(0, z - prior.hipDepthMax) ** 2 +
    prior.centred * ((pelvis[0] - cx) / d.height) ** 2;
  const feet = contacts.filter((c) => c.limb[1] === 'f');
  // A smear (its cone only pushes out of the wall) carries next to nothing from rule 8's overhang.
  const smearsUnloaded =
    Math.atan2(gravity[2], gravity[1]) >= (DANGLE_FROM_DEG * Math.PI) / 180 - 1e-9;
  const lowestFootY = feet.length ? Math.max(...feet.map((c) => c.point[1])) : 0;
  if (feet.length && prior.overFeet) {
    const fx = feet.reduce((s, c) => s + c.point[0], 0) / feet.length;
    posture += prior.overFeet * ((pelvis[0] - fx) / d.height) ** 2;
  }
  LIMBS.forEach((limb, bit) => {
    const root = t[ROOT[limb]];
    const [a, b] = limb[1] === 'h' ? [d.upperArm, d.forearm] : [d.thigh, d.shank];
    const contact = contacts.find((c) => c.limb === limb);
    const target = contact?.point;
    if (!contact || !target) {
      // An unused limb hangs along the weight.
      joints[MID[limb]] = add(root, scale(gravity, a));
      joints[END[limb]] = add(joints[MID[limb]], scale(gravity, b));
      return;
    }
    const ik = twoBone(root, target, a, b, pole[limb], minReach(limb, d));
    joints[MID[limb]] = ik.mid;
    joints[END[limb]] = ik.end;
    // M2 rule 2: a leg also has to keep its thigh within the hip's range.
    const past = ik.reachable && !isHand(limb) ? hipAngle(ik.mid, root, down) - JOINT_RANGE.hip : 0;
    const fits = ik.reachable && past <= 0;
    reach[limb] = fits;
    if (!fits) missing |= 1 << bit;
    if (!fits && ik.reach <= 1) cramped |= 1 << bit;
    if (past > 0) {
      hipBits |= 1 << bit;
      excess += past / 180;
    }
    const high = limb[1] === 'f' && lowestFootY - target[1] >= prior.highStep * d.height;
    const unloaded = smearsUnloaded && contact.cone.axis[0] === 0 && contact.cone.axis[1] === 0;
    // M3: a hooked leg hooks, it doesn't stand.
    const [lo, hi] = high || unloaded || contact.hook ? FREE_LEG : prior.legReach;
    posture +=
      limb[1] === 'h'
        ? (ik.reach - prior.armReach) ** 2
        : Math.max(0, lo - ik.reach, ik.reach - hi) ** 2;
  });
  delete (joints as unknown as { right?: Vec3 }).right;
  return { joints, reach, missing, cramped, high: hipBits, excess, posture };
}

/** Which limbs can't reach from this pelvis, and how far past full length they are (cheap). */
function reachOnly(pelvis: Vec3, contacts: readonly Contact[], d: BodyDims, lean: number) {
  const t = trunkJoints(pelvis, trunkDirection(pelvis, contacts, lean), d);
  let missing = 0;
  let cramped = 0;
  const high = 0;
  let excess = 0;
  for (const c of contacts) {
    const [a, b] = c.limb[1] === 'h' ? [d.upperArm, d.forearm] : [d.thigh, d.shank];
    const dist = norm(sub(c.point, t[ROOT[c.limb]]));
    if (dist > a + b || dist < minReach(c.limb, d)) {
      const bit = 1 << LIMBS.indexOf(c.limb);
      missing |= bit;
      if (dist <= a + b) cramped |= bit;
      excess += Math.abs(dist / (a + b) - 1);
    }
  }
  return { missing, cramped, high, excess };
}

function evaluate(
  pelvis: Vec3,
  contacts: readonly Contact[],
  d: BodyDims,
  gravity: Vec3,
  prior: PosturePrior,
): Candidate {
  const quick = reachOnly(pelvis, contacts, d, prior.lean);
  if (quick.missing) {
    return {
      pelvis,
      missing: quick.missing,
      cramped: quick.cramped,
      high: quick.high,
      com: null,
      sol: null,
      cost: UNREACHABLE_COST + quick.excess,
      posture: Infinity,
    };
  }
  const p = place(pelvis, contacts, d, gravity, prior);
  // M2 rule 2: the hip's range, known only once the knee is placed. Its excess keeps a slope for
  // the pattern search, as reachOnly's does (PR #18 review 1).
  if (p.missing) {
    const at = {
      pelvis,
      missing: p.missing,
      cramped: p.cramped,
      high: p.high,
      com: null,
      sol: null,
    };
    return { ...at, cost: UNREACHABLE_COST + p.excess, posture: Infinity };
  }
  const com = centerOfMass(p.joints);
  const sol = solveForces(
    contacts,
    com,
    gravity,
    d.height,
    bodyContact(contacts, pelvis, d.height),
  );
  const cost = sol.feasible
    ? p.posture + prior.loadWeight * sol.cost
    : INFEASIBLE_COST * (1 + sol.residualForce + sol.residualTorque);
  return { pelvis, missing: 0, cramped: 0, high: 0, com, sol, cost, posture: p.posture };
}

/** M3: a hook needs a foot on a picked route hold (not a smear or a wall-foothold chip). */
export const canHook = (limb: Limb, c: ContactInput) =>
  !isHand(limb) &&
  c.type !== 'smear' &&
  !c.holdId.startsWith('blob:') &&
  !c.holdId.startsWith('wf:');

export function resolveContacts(contacts: StanceContacts): Contact[] {
  const hands = (['lh', 'rh'] as const).flatMap((l) =>
    contacts[l] ? [contacts[l]!.point[0]] : [],
  );
  const all = LIMBS.flatMap((l) => (contacts[l] ? [contacts[l]!.point[0]] : []));
  const xs = hands.length ? hands : all;
  const midX = xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
  return LIMBS.flatMap((limb) => {
    const c = contacts[limb];
    if (!c) return [];
    const point: Vec3 = [c.point[0], c.point[1], 0];
    if (c.hook && canHook(limb, c)) {
      const side = c.point[0] >= midX ? 1 : -1;
      return [
        { limb, point, cone: hookCone(c.hook, c.type, c.dir, c.surface, side), hook: c.hook },
      ];
    }
    return [{ limb, point, cone: coneFor(limb, c.type, c.dir, c.surface) }];
  });
}

/**
 * The highest the pelvis may sit (image y; larger is lower): `prior.hipsBelowHands` below the
 * highest hand (no mantles in Stage 1), so a failing stance still looks human. Null without hands.
 * The one rule for both the solver's search and beta-moves' reach check (SPEC-beta-moves OQ 11),
 * so the referee's reach and stance checks can't disagree.
 */
export function hipFloor(
  handYs: readonly number[],
  height: number,
  prior: Pick<PosturePrior, 'hipsBelowHands'>,
): number | null {
  return handYs.length ? Math.min(...handYs) + prior.hipsBelowHands * height : null;
}

/** S8: grid over pelvis positions (filtered by reach), then pattern search from the best. */
function search(
  contacts: readonly Contact[],
  d: BodyDims,
  gravity: Vec3,
  prior: PosturePrior,
): { best: Candidate; grid: Candidate[] } {
  const H = d.height;
  const xs = contacts.map((c) => c.point[0]);
  const ys = contacts.map((c) => c.point[1]);
  const x0 = Math.min(...xs) - 0.5 * H;
  const x1 = Math.max(...xs) + 0.5 * H;
  const y0 =
    hipFloor(
      contacts.filter((c) => c.limb[1] === 'h').map((c) => c.point[1]),
      H,
      prior,
    ) ?? Math.min(...ys) - 0.3 * H;
  const y1 = Math.max(...ys) + 0.6 * H;
  const step = GRID_STEP * H;

  const grid: Candidate[] = [];
  let best: Candidate | null = null;
  // Centred on the holds, so mirrored holds get a mirrored grid (and a mirrored answer).
  const cx = xs.reduce((a, v) => a + v, 0) / xs.length;
  const half = Math.ceil(Math.max(cx - x0, x1 - cx) / step);
  for (let i = -half; i <= half; i++) {
    const x = cx + i * step;
    for (let y = y0; y <= y1; y += step) {
      for (const z of DEPTHS) {
        const c = evaluate([x, y, z * H], contacts, d, gravity, prior);
        grid.push(c);
        if (!best || better(c, best)) best = c;
      }
    }
  }

  let b = best!;
  for (let s = 0.5 * step; s > 0.003 * H;) {
    let improved = false;
    for (const dir of [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ] as Vec3[]) {
      const p = add(b.pelvis, scale(dir, s));
      p[1] = Math.max(y0, p[1]);
      p[2] = Math.min(Z_MAX * H, Math.max(Z_MIN * H, p[2]));
      const c = evaluate(p, contacts, d, gravity, prior);
      if (c.cost < b.cost - 1e-12) {
        b = c;
        improved = true;
      }
    }
    if (!improved) s /= 2;
  }

  return { best: b, grid };
}

/** A failing stance is drawn in the most natural reachable pose (posture prior only, no physics). */
function natural(grid: readonly Candidate[]): Candidate | null {
  let best: Candidate | null = null;
  for (const c of grid) if (c.posture < (best?.posture ?? Infinity)) best = c;
  return best;
}

export function solveStance(input: StanceContacts, opts: StanceOptions): Stance {
  const H = opts.height;
  const d = bodyDims(H);
  const gravity = gravityFor(opts.wallAngleDeg);
  const prior: PosturePrior = { ...DEFAULT_PRIOR, ...opts.prior };
  const contacts = resolveContacts(input);
  if (!contacts.length) {
    return {
      joints: null,
      com: [0, 0, 0],
      load: {},
      body: null,
      reach: {},
      feasible: false,
      diagnosis: diagnose({ contacts, input, best: null, grid: [], gravity, height: H }),
      region: [],
      gravity,
    };
  }

  const xs = contacts.map((c) => c.point[0]);
  const ys = contacts.map((c) => c.point[1]);
  const found = search(contacts, d, gravity, prior);
  const b = found.best;
  const feasible = b.sol?.feasible ?? false;
  const diagnosis = feasible
    ? null
    : diagnose({ contacts, input, best: b.sol ? b : null, grid: found.grid, gravity, height: H });
  // A position that can't be held has no physical best pose (the search's least-bad one is often a
  // strange mantle), so draw a natural one: arms nearly straight, hips a little off the wall.
  const shown = feasible ? b : (natural(found.grid) ?? b);

  const placed = place(shown.pelvis, contacts, d, gravity, prior);
  const load: Stance['load'] = {};
  let body: Stance['body'] = null;
  // A stance that can't be held has no loads to show (its forces don't balance).
  if (feasible && b.sol) {
    const loadOf = (f: Vec3) => {
      const applied = scale(f, -1);
      return {
        percent: 100 * Math.hypot(...applied),
        share: 100 * (applied[0] * gravity[0] + applied[1] * gravity[1] + applied[2] * gravity[2]),
        force: applied,
      };
    };
    for (const [limb, f] of Object.entries(b.sol.forces) as [Limb, Vec3][]) load[limb] = loadOf(f);
    // PR #18 review 4: a body contact that carries next to nothing is no body contact.
    if (b.sol.body) {
      const on = loadOf(b.sol.body);
      if (on.percent >= BODY_MIN_PERCENT) body = on;
    }
  }
  const com = shown.com ?? centerOfMass(placed.joints);
  const pad = 0.2 * H;
  const withRegion = opts.region !== false && b.sol !== null;
  const region = withRegion
    ? feasibleRegion(
        {
          x0: Math.min(...xs, com[0]) - 3 * pad,
          x1: Math.max(...xs, com[0]) + 3 * pad,
          y0: Math.min(...ys, com[1]) - pad,
          y1: Math.max(...ys, com[1]) + pad,
        },
        // M1: the shown pose's hips stay where they rest on the wall.
        (x, y) =>
          solveForces(contacts, [x, y, com[2]], gravity, H, bodyContact(contacts, shown.pelvis, H))
            .feasible,
        feasible ? [com[0], com[1]] : null,
      )
    : [];
  return {
    joints: placed.joints,
    com,
    load,
    body,
    reach: placed.reach,
    feasible,
    diagnosis,
    region,
    gravity,
  };
}

export type { Candidate };
export { BODY_TOUCH } from './equilibrium';

/** SPEC-beta-moves A3: the solver's own search box and trunk rule, for reach.ts (not copies). */
export const PELVIS_SEARCH = { GRID_STEP, DEPTHS, Z_MIN, Z_MAX } as const;
export { ROOT as LIMB_ROOT, trunkDirection };
