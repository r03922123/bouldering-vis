import type { HoldMask } from '../hold-segmentation';

export type Limb = 'lh' | 'rh' | 'lf' | 'rf';

export const LIMBS: readonly Limb[] = ['lh', 'rh', 'lf', 'rf'];

export const isHand = (l: Limb) => l === 'lh' || l === 'rh';

export const LIMB_NAME: Record<Limb, string> = {
  lh: 'Left hand',
  rh: 'Right hand',
  lf: 'Left foot',
  rf: 'Right foot',
};

/** S4: the wall's steepness, degrees past vertical (slab < 0 < overhang). */
export const WALL_ANGLES = [
  { value: -10, label: 'Slab' },
  { value: 0, label: 'Vertical' },
  { value: 20, label: 'Overhang 20°' },
  { value: 35, label: 'Overhang 35°' },
  { value: 45, label: 'Overhang 45°' },
] as const;
export type WallAngle = (typeof WALL_ANGLES)[number]['value'];

/**
 * Amendment 2026-10-31 (b): feet stand on any hold the wall mask found ('any'), or only on the
 * route's holds, as on a strict "feet follow hands" problem ('follow').
 */
export type FeetMode = 'any' | 'follow';

/**
 * SPEC-beta-moves A2: what the start-position rules read from a hold. A SAM mask and its box are
 * optional; without them a hold claims only the wall foothold under its centroid (rule 6).
 */
export type StanceHold = Pick<HoldMask, 'id' | 'centroid' | 'role'> &
  Partial<Pick<HoldMask, 'mask' | 'bbox'>> & {
    /**
     * Amendment 2026-11-02 (SPEC-play-shell E1): where the hand or foot holds the hold, image px.
     * When set it replaces the centroid as the contact point (matched hands spread about it). The
     * assignment heuristics, claims and smears still read the centroid. The Studio never sets it.
     */
    readonly grip?: { readonly x: number; readonly y: number };
  };
