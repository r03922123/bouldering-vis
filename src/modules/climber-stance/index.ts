// Public API of the `climber-stance` module. See SPEC-climber-stance.md.
export {
  autoAssign,
  contactsFor,
  defaultClimberHeight,
  EMPTY_ASSIGNMENT,
  SMEAR,
  type Assignment,
  type AutoAssignOptions,
  type ContactExtras,
} from './assign';
export { blobShapeOk, footCandidates, type FootCandidate, type FootCandidates } from './anyFeet';
export type { JointName, Joints } from './body';
export { SLOPER_HALF_ANGLE, SLOPER_MU, type Hook } from './cones';
export {
  playReachText,
  playSlipText,
  playSteepText,
  type Diagnosis,
  type DiagnosisKind,
} from './diagnose';
export { reachRatios, type ReachResult } from './reach';
export {
  canHook,
  DEFAULT_PRIOR,
  gravityFor,
  solveStance,
  type PosturePrior,
  type ContactInput,
  type Stance,
  type StanceContacts,
  type StanceOptions,
} from './stance';
export {
  isHand,
  LIMB_NAME,
  LIMBS,
  WALL_ANGLES,
  type FeetMode,
  type Limb,
  type StanceHold,
  type WallAngle,
} from './types';
export { STANCE_DEBOUNCE_MS, useStance, type StanceState } from './useStance';
export { useWallFootholds } from './useWallFootholds';
export {
  drawStance,
  flatProjection,
  layoutStance,
  STANCE_COLOR,
  type Project,
  type StanceLayout,
} from './overlay';
export type { Vec3 } from './vec';
export {
  isWallFoothold,
  TOE_INSET,
  WALL_FOOT_PREFIX,
  type WallFoothold,
  type WallFootholds,
} from './wallFootholds';
export { StancePanel } from './StancePanel';
