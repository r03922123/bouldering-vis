import { BODY_CONE, coneEdges, type Cone, type Hook } from './cones';
import { nnls } from './nnls';
import { isHand, type Limb } from './types';
import { add, cross, norm, scale, sub, type Vec3 } from './vec';

// SPEC-climber-stance S1, S9–S11. Quasi-static balance with point contacts: the contact forces (each
// inside its cone) cancel the weight and its torque about the center of mass.

export interface Contact {
  limb: Limb;
  point: Vec3;
  cone: Cone;
  /** Amendment 2026-11-04, M3: a hooked foot (its leg hooks, it doesn't stand). */
  hook?: Hook;
}

/** Amendment 2026-11-04, M1: the hips on the wall, a contact with no limb. */
export interface BodyContact {
  point: Vec3;
  cone: Cone;
}

/** M1: the hips touch the wall from this pelvis depth (× height): the posture prior's hipDepth (B4). */
export const BODY_TOUCH = 0.1;

/**
 * M1: with no foot on, a pelvis within BODY_TOUCH of the wall rests the hips on it, at the pelvis
 * projected onto the wall. Null otherwise (a foot already pushes the body off the wall).
 */
export function bodyContact(
  contacts: readonly Contact[],
  pelvis: Vec3,
  height: number,
): BodyContact | null {
  if (contacts.some((c) => !isHand(c.limb))) return null;
  if (pelvis[2] > BODY_TOUCH * height + 1e-9) return null;
  return { point: [pelvis[0], pelvis[1], 0], cone: BODY_CONE };
}

export interface ForceSolution {
  /** Force each hold puts on the climber, in bodyweights. */
  forces: Partial<Record<Limb, Vec3>>;
  /** M1: the force the wall puts on the hips, or null without a body contact. */
  body: Vec3 | null;
  /** ‖Σf + g‖, bodyweights. */
  residualForce: number;
  /** ‖Σ(p − c) × f‖ / height, bodyweights. */
  residualTorque: number;
  feasible: boolean;
  /** Σ w‖f‖² with hands ×2 and sideways ×SIDEWAYS_WEIGHT (S10). */
  cost: number;
}

/** S10: the hands cost twice as much as the feet. */
export const HAND_WEIGHT = 2;
export const FOOT_WEIGHT = 1;
/**
 * Sideways (along the wall, x) force costs this much more than the rest: climbers shift weight onto
 * the foot under them rather than lean on sideways friction. Without it the split barely moved
 * when a foot did (review, 2026-10-30).
 */
export const SIDEWAYS_WEIGHT = 4;
/** S11. */
export const RESIDUAL_TOLERANCE = 0.02;
/** How much more balance matters than the load preference (squared-row weight). */
const BALANCE_WEIGHT = 1e4;

/** Cones don't change during a search, so their pyramid edges are built once. */
const edgeCache = new WeakMap<Contact['cone'], Vec3[]>();
function edgesOf(cone: Contact['cone']): Vec3[] {
  let e = edgeCache.get(cone);
  if (!e) edgeCache.set(cone, (e = coneEdges(cone)));
  return e;
}

/**
 * `gravity` is the unit weight direction; the body weighs 1. `body` (M1) is one more contact, after
 * the limbs, weighted as a foot.
 */
export function solveForces(
  limbs: readonly Contact[],
  com: Vec3,
  gravity: Vec3,
  height: number,
  body: BodyContact | null = null,
): ForceSolution {
  if (limbs.length === 0) {
    const none = { forces: {}, body: null, residualForce: 1, residualTorque: 0 };
    return { ...none, feasible: false, cost: Infinity };
  }
  const contacts: { point: Vec3; cone: Cone; hand: boolean }[] = limbs.map((c) => ({
    point: c.point,
    cone: c.cone,
    hand: isHand(c.limb),
  }));
  if (body) contacts.push({ point: body.point, cone: body.cone, hand: false });
  const edges = contacts.map((c) => edgesOf(c.cone));
  const n = edges.reduce((s, e) => s + e.length, 0);
  const rows: number[][] = [];
  const rhs: number[] = [];
  const kb = Math.sqrt(BALANCE_WEIGHT);

  // Balance rows: Σf = −g, and Σ(p − c)×f = 0 (torque scaled by 1/height to match units).
  for (let axis = 0; axis < 6; axis++) rows.push(new Array(n).fill(0));
  let col = 0;
  contacts.forEach((c, i) => {
    const r = sub(c.point, com);
    for (const e of edges[i]!) {
      const t = scale(cross(r, e), 1 / height);
      for (let k = 0; k < 3; k++) {
        rows[k]![col] = kb * e[k]!;
        rows[3 + k]![col] = kb * t[k]!;
      }
      col++;
    }
  });
  rhs.push(-kb * gravity[0], -kb * gravity[1], -kb * gravity[2], 0, 0, 0);

  // Load rows: √w·f_i for each contact, so the squared norm is w‖f_i‖² (sideways part × SIDEWAYS).
  col = 0;
  contacts.forEach((c, i) => {
    const w = Math.sqrt(c.hand ? HAND_WEIGHT : FOOT_WEIGHT);
    for (let k = 0; k < 3; k++) {
      const row = new Array(n).fill(0);
      const wk = k === 0 ? w * Math.sqrt(SIDEWAYS_WEIGHT) : w;
      edges[i]!.forEach((e, j) => (row[col + j] = wk * e[k]!));
      rows.push(row);
      rhs.push(0);
    }
    col += edges[i]!.length;
  });

  const { x } = nnls(rows, rhs);
  const forces: Partial<Record<Limb, Vec3>> = {};
  let bodyForce: Vec3 | null = null;
  let total: Vec3 = [0, 0, 0];
  let torque: Vec3 = [0, 0, 0];
  let cost = 0;
  col = 0;
  contacts.forEach((c, i) => {
    let f: Vec3 = [0, 0, 0];
    for (const e of edges[i]!) f = add(f, scale(e, x[col++]!));
    if (i < limbs.length) forces[limbs[i]!.limb] = f;
    else bodyForce = f;
    total = add(total, f);
    torque = add(torque, cross(sub(c.point, com), f));
    cost +=
      (c.hand ? HAND_WEIGHT : FOOT_WEIGHT) * (norm(f) ** 2 + (SIDEWAYS_WEIGHT - 1) * f[0] ** 2);
  });
  const residualForce = norm(add(total, gravity));
  const residualTorque = norm(torque) / height;
  return {
    forces,
    body: bodyForce,
    residualForce,
    residualTorque,
    feasible: residualForce <= RESIDUAL_TOLERANCE && residualTorque <= RESIDUAL_TOLERANCE,
    cost,
  };
}
