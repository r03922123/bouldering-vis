// Public API of the `hold-geometry` module. See SPEC-hold-geometry.md.
export {
  facingWord,
  holdGeometry,
  type Facing,
  type HoldGeometry,
  type Orientation,
} from './geometry';
export { DirectionControl } from './DirectionControl';
export { forceDirection, forceWithOverride, type Force } from './force';
export {
  describePull,
  isCustomPull,
  PRESET_DIR,
  PULL_OPTIONS,
  pullDir,
  snapPull,
  SNAP_DEG,
  type PullOverride,
  type PullPreset,
} from './pull';
export { forceEmphasis, type Emphasis } from './emphasis';
export {
  ARROW_STYLE,
  drawArrow2D,
  drawForceArrows,
  drawIntoView,
  FORCE_COLOR,
} from './ForceArrows';
export { useHoldGeometry } from './useHoldGeometry';
