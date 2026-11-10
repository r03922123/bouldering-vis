// Shared types of `pixel-kit` (SPEC-pixel-kit › Decisions P4). The limb and joint strings match
// climber-stance's `Limb` and `JointName`; joints are {x, y, z?} objects, not Vec3 tuples.

export interface Pt {
  x: number;
  y: number;
}

export type PixelLimb = 'lh' | 'rh' | 'lf' | 'rf';

export type PixelJointName =
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

/** Image px; z is +out of the wall (draw order only). climber-stance's Vec3 [x,y,z] → {x,y,z}. */
export type PixelJoints = Record<PixelJointName, Pt & { z?: number }>;
