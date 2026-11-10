// Public API of the `hold-segmentation` module. See SPEC-hold-segmentation.md.
export type { HoldMask, HoldRole } from './types';
export { SelectionCanvas } from './SelectionCanvas';
export { HoldList } from './HoldList';
export { RouteSteps, routeStep, type RouteStep } from './RouteSteps';
export {
  badgeColor,
  badgeRadius,
  drawBadge,
  badgeLabels,
  MAX_STARTS,
  routeStatus,
  setRole,
  type RouteStatus,
} from './roles';
