// Public API of the `beta-moves` module: the pure rules engine of the plan-the-beta game.
// See SPEC-beta-moves.md. No React, DOM, timers, storage or network (B16, enforced by ESLint).
export {
  BETA_RULES_VERSION,
  CACHE_CAPACITY,
  DEADPOINT_REACH,
  DEFAULT_RULES,
  DIR_DECIMALS,
  HIP_SHIFT,
  HISTORY_LIMIT,
  MAX_LIMBS_PER_MOVE,
  MIN_CONTACTS_KEPT,
  POINT_QUANTUM,
  STATIC_REACH,
  STYLE_EFFORT,
  type Beta,
  type BetaResult,
  type BetaStep,
  type Fail,
  type FailKind,
  type FeetRule,
  type Move,
  type MoveCheck,
  type MoveContext,
  type MoveKind,
  type MoveRules,
  type MoveStyle,
  type Plan,
  type Rejection,
  type RouteHold,
  type ShapeCheck,
  type StanceCache,
  type StepOutcome,
  type Target,
  type WallFoot,
} from './types';
export { makeContext, toWallFeet } from './context';
export { createStanceCache } from './cache';
export { classifyMove } from './classify';
export { startFallenText, validateShape } from './shape';
export { defaultStart } from './start';
export { checkMove, checkStart } from './check';
export { checkBeta } from './beta';
export { applyStep, canRedo, canUndo, editStart, newPlan, redo, undo } from './plan';
export { targetAt } from './target';
export { decodeBeta, encodeBeta } from './encode';
