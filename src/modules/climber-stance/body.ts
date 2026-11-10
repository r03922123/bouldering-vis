import { add, lerp, scale, sub, unit, type Vec3 } from './vec';

// SPEC-climber-stance S6. A stick body: lengths from Winter's anthropometric ratios (× height,
// "Biomechanics and Motor Control of Human Movement", after Drillis & Contini); segment masses and
// CoM positions from de Leva 1996 (J Biomech 29:1223), mean of the male and female tables.

export type JointName =
  | 'pelvis'
  | 'neck'
  | 'head'
  | 'lShoulder'
  | 'rShoulder'
  | 'lElbow'
  | 'rElbow'
  | 'lHand'
  | 'rHand'
  | 'lHip'
  | 'rHip'
  | 'lKnee'
  | 'rKnee'
  | 'lFoot'
  | 'rFoot';

export type Joints = Record<JointName, Vec3>;

/** Fraction of body mass per segment (de Leva 1996, mean of male and female). */
export const MASS = {
  head: 0.0681,
  trunk: 0.43015,
  upperArm: 0.0263,
  forearm: 0.015,
  hand: 0.00585,
  thigh: 0.1447,
  shank: 0.0457,
  foot: 0.0133,
} as const;

/** Segment CoM as a fraction of our segments, measured from the proximal joint. */
const COM_AT = {
  /** neck → pelvis (de Leva trunk ≈ 43 % from the top). */
  trunk: 0.432,
  upperArm: 0.576,
  /** elbow → grip: de Leva forearm CoM 45.7 % of 0.146 H, over our 0.200 H forearm-to-grip. */
  forearm: 0.334,
  thigh: 0.385,
  /** knee → toe: de Leva shank CoM 44.4 % of 0.246 H, over our 0.285 H knee-to-toe. */
  shank: 0.383,
} as const;

export interface BodyDims {
  height: number;
  upperArm: number;
  /** Elbow to the middle of the grip. */
  forearm: number;
  thigh: number;
  /** Knee to the toe contact (shank plus ankle height). */
  shank: number;
  /** Mid-hip to mid-shoulder. */
  trunk: number;
  /** Mid-shoulder to the head's CoM. */
  headOffset: number;
  shoulderHalf: number;
  hipHalf: number;
  /** Sole to hip joint, standing. */
  legLength: number;
}

export function bodyDims(height: number): BodyDims {
  const h = height;
  return {
    height: h,
    upperArm: 0.186 * h,
    forearm: (0.146 + 0.054) * h,
    thigh: 0.245 * h,
    shank: 0.285 * h,
    trunk: (0.818 - 0.53) * h,
    headOffset: 0.1 * h,
    shoulderHalf: 0.1295 * h,
    hipHalf: 0.0955 * h,
    legLength: 0.53 * h,
  };
}

/** Whole-body center of mass from the joint positions. */
export function centerOfMass(j: Joints): Vec3 {
  let sum: Vec3 = [0, 0, 0];
  const put = (p: Vec3, m: number) => (sum = add(sum, scale(p, m)));
  put(lerp(j.neck, j.pelvis, COM_AT.trunk), MASS.trunk);
  put(j.head, MASS.head);
  for (const s of ['l', 'r'] as const) {
    put(lerp(j[`${s}Shoulder`], j[`${s}Elbow`], COM_AT.upperArm), MASS.upperArm);
    put(lerp(j[`${s}Elbow`], j[`${s}Hand`], COM_AT.forearm), MASS.forearm);
    put(j[`${s}Hand`], MASS.hand);
    put(lerp(j[`${s}Hip`], j[`${s}Knee`], COM_AT.thigh), MASS.thigh);
    put(lerp(j[`${s}Knee`], j[`${s}Foot`], COM_AT.shank), MASS.shank);
    put(j[`${s}Foot`], MASS.foot);
  }
  const total =
    MASS.head +
    MASS.trunk +
    2 * (MASS.upperArm + MASS.forearm + MASS.hand + MASS.thigh + MASS.shank + MASS.foot);
  return scale(sum, 1 / total);
}

/** The climber's right, given the trunk direction (pelvis → neck): it faces the wall, back to the camera. */
export const rightOf = (trunkDir: Vec3): Vec3 => unit([-trunkDir[1], trunkDir[0], 0]);

/** Neck, head, shoulders and hips for a trunk at `pelvis` pointing along `trunkDir`. */
export function trunkJoints(pelvis: Vec3, trunkDir: Vec3, d: BodyDims) {
  const up = unit(trunkDir);
  const right = rightOf(up);
  const neck = add(pelvis, scale(up, d.trunk));
  return {
    pelvis,
    neck,
    head: add(neck, scale(up, d.headOffset)),
    lShoulder: sub(neck, scale(right, d.shoulderHalf)),
    rShoulder: add(neck, scale(right, d.shoulderHalf)),
    lHip: sub(pelvis, scale(right, d.hipHalf)),
    rHip: add(pelvis, scale(right, d.hipHalf)),
    right,
  };
}
