import type { ContactInput } from './stance';
import { isHand, type Limb } from './types';
import { add, cross, scale, unit, type Vec3 } from './vec';

// SPEC-climber-stance › Friction cones. The cone holds the force the hold puts on the climber:
// the hand pulls along `dir`, so the hold pushes back along −dir.

export interface Cone {
  axis: Vec3;
  /** Radians. */
  halfAngle: number;
  /** Takes a force in any direction (used to test whether this contact's friction is what fails). */
  free?: boolean;
}

const deg = (d: number) => (d * Math.PI) / 180;

/**
 * Amendment 2026-10-31 (b), rule 11: skin on a hold surface. Fuss et al. 2020 (Front. Psychol.
 * 11:252) measured ~0.72 on plastic; those are ratios applied before slip, so a lower bound.
 */
export const SLOPER_MU = 0.72;
/** atan(0.72) = 0.6240 rad (35.75°). */
export const SLOPER_HALF_ANGLE = Math.atan(SLOPER_MU);

/** A squeeze. Amendment 2026-11-04, M4 rule 3: 60° whether or not a pull is set. */
const PINCH = deg(60);

const HAND_ANGLE: Record<string, number> = {
  jug: deg(55),
  pocket: deg(45),
  edge: deg(40),
  crimp: deg(35),
  sloper: SLOPER_HALF_ANGLE,
  volume: SLOPER_HALF_ANGLE,
  pinch: PINCH,
};
const HAND_DEFAULT = deg(40);
const UP: Vec3 = [0, -1, 0];
const FOOT_AXIS = unit([0, -1, 0.6]);
const FOOT_ANGLE = deg(45);
const SMEAR_ANGLE = deg(35);

const isSloper = (type: string | null) => type === 'sloper' || type === 'volume';

/**
 * The reaction cone for one limb on one hold. `type` is the effective hold type; `dir` its force.
 * A sloper or volume hand with a grip `surface` is held by friction on it, so its cone is centred
 * on the surface's outward normal (rule 11).
 */
export function coneFor(
  limb: Limb,
  type: string | null,
  dir: Vec3 | null,
  surface?: ContactInput['surface'],
): Cone {
  // Amendment 2026-11-01 (c), picked footholds (builder's call; the user can veto): a foot stands
  // on top of a tagged hold whatever its hand type (a sloper or volume included), so only a smear
  // gets the smear cone.
  if (!isHand(limb)) {
    return type === 'smear'
      ? { axis: [0, 0, 1], halfAngle: SMEAR_ANGLE }
      : { axis: FOOT_AXIS, halfAngle: FOOT_ANGLE };
  }
  if (surface && isSloper(type)) {
    return { axis: unit(surface.normal), halfAngle: SLOPER_HALF_ANGLE };
  }
  if (!dir) return { axis: UP, halfAngle: type === 'pinch' ? PINCH : HAND_DEFAULT };
  return { axis: unit(scale(dir, -1)), halfAngle: HAND_ANGLE[type ?? ''] ?? HAND_DEFAULT };
}

/** Amendment 2026-11-04, M3: a foot hooked on a picked route hold. */
export type Hook = 'heel' | 'toe';

/**
 * M3: a heel pulls the hold toward the hips as fingers do, so it takes the hand cone's axis on that
 * hold; 45° is shoe rubber's μ ≈ 1.0 (Elkington et al. 2024, static μ 0.97–1.21; the foothold's
 * 45°). No force measurements of hooks exist; both cones are builder's calls.
 */
const HEEL_ANGLE = deg(45);
/** M3: the top of the toe pulls the hold toward the body and the wall (40°, ours). */
const TOE_ANGLE = deg(40);

/**
 * M3: the reaction cone of a hooked foot. `side` is +1 when the hold is right of the hands (−1 left):
 * a toe hook pulls the climber toward the hold's far side and into the wall.
 */
export function hookCone(
  hook: Hook,
  type: string | null,
  dir: Vec3 | null,
  surface: ContactInput['surface'],
  side: 1 | -1,
): Cone {
  if (hook === 'heel')
    return { axis: coneFor('lh', type, dir, surface).axis, halfAngle: HEEL_ANGLE };
  return { axis: unit([side, 0, -1]), halfAngle: TOE_ANGLE };
}

/**
 * Amendment 2026-11-04, M1: the body on the wall (both feet off). It only pushes out of the wall;
 * 20° is ours (clothing and skin on a textured wall, no measurement found), and barely matters.
 */
export const BODY_CONE: Cone = { axis: [0, 0, 1], halfAngle: deg(20) };

export const PYRAMID_EDGES = 8;

const ALL_DIRECTIONS: Vec3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/** The cone as an inscribed 8-edge pyramid (unit edge vectors). */
export function coneEdges(cone: Cone): Vec3[] {
  if (cone.free) return ALL_DIRECTIONS;
  const a = unit(cone.axis);
  const t1 = unit(cross(a, Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
  const t2 = cross(a, t1);
  const c = Math.cos(cone.halfAngle);
  const s = Math.sin(cone.halfAngle);
  return Array.from({ length: PYRAMID_EDGES }, (_, k) => {
    const phi = (2 * Math.PI * k) / PYRAMID_EDGES;
    return add(scale(a, c), add(scale(t1, s * Math.cos(phi)), scale(t2, s * Math.sin(phi))));
  });
}
