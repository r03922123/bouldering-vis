import type { BodyDims } from './body';
import { isHand, type Limb } from './types';
import { add, cross, dot, norm, scale, sub, unit, type Vec3 } from './vec';

// SPEC-climber-stance S7: analytic two-bone IK (shoulder → elbow → hand, hip → knee → toe).

/**
 * Amendment 2026-11-04, M2: the most each joint flexes, in degrees. CDC Normal Joint Range of
 * Motion Study (Soucie et al., Haemophilia 2010), adults 20–44, the mean of men and women rounded
 * to 5°: knee 137.7 / 141.9, elbow 144.6 / 150.0, hip 130.4 / 133.8. Passive, lying down; the hip
 * limit is applied to the thigh's angle from the trunk's down line, flexion and abduction together.
 */
export const JOINT_RANGE = { knee: 140, elbow: 145, hip: 130 } as const;

const rad = (deg: number) => (deg * Math.PI) / 180;

/** M2 rule 1: the limb's root-to-end distance at full flexion (no limb folds shorter). */
export function minReach(limb: Limb, d: BodyDims): number {
  const [a, b, flex] = isHand(limb)
    ? [d.upperArm, d.forearm, JOINT_RANGE.elbow]
    : [d.thigh, d.shank, JOINT_RANGE.knee];
  return Math.sqrt(a * a + b * b - 2 * a * b * Math.cos(Math.PI - rad(flex)));
}

/** Knees open to the side and slightly down, never away from the wall (B5, p54, p139). */
export function legPole(limb: 'lf' | 'rf', right: Vec3): Vec3 {
  return unit(add(scale(right, limb === 'lf' ? -1 : 1), [0, 0.2, 0]));
}

/** M2 rule 2: the thigh's angle (degrees) from the trunk's down line (neck → pelvis). */
export function hipAngle(knee: Vec3, hip: Vec3, trunkDown: Vec3): number {
  const thigh = sub(knee, hip);
  const cos = dot(thigh, trunkDown) / (norm(thigh) * norm(trunkDown));
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}

/** M2 rule 2: does this leg's thigh stay within the hip's range? */
export const hipFits = (knee: Vec3, hip: Vec3, trunkDown: Vec3) =>
  hipAngle(knee, hip, trunkDown) <= JOINT_RANGE.hip;

export interface LimbPose {
  mid: Vec3;
  end: Vec3;
  /** Distance to the target over the limb's full length (> 1: too far). */
  reach: number;
  reachable: boolean;
}

/** Any unit vector perpendicular to `u`. */
function perpendicular(u: Vec3): Vec3 {
  const t: Vec3 = Math.abs(u[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  return unit(cross(u, t));
}

/**
 * Places the middle joint so the limb ends at `target`, bending toward `pole`. An unreachable target
 * gives a straight limb pointing at it (too far) or folded along it (too close). A target nearer
 * than `min` (M2's joint range; default |a − b|, the bones' own fold) is posed but unreachable.
 */
export function twoBone(
  root: Vec3,
  target: Vec3,
  a: number,
  b: number,
  pole: Vec3,
  min = Math.abs(a - b),
): LimbPose {
  const toTarget = sub(target, root);
  const d = norm(toTarget);
  const u = d > 1e-9 ? scale(toTarget, 1 / d) : ([0, -1, 0] as Vec3);
  const reach = d / (a + b);
  if (d > a + b || d < Math.abs(a - b)) {
    const mid = add(root, scale(u, a));
    const end = d > a + b ? add(root, scale(u, a + b)) : add(mid, scale(u, -b));
    return { mid, end, reach, reachable: false };
  }
  const along = (a * a - b * b + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, a * a - along * along));
  let bend = sub(pole, scale(u, dot(pole, u)));
  bend = norm(bend) > 1e-6 ? unit(bend) : perpendicular(u);
  const mid = add(add(root, scale(u, along)), scale(bend, h));
  return { mid, end: target, reach, reachable: d >= min };
}
