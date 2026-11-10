// Public API of the `gym-hub` module: the walkable gym at the app root. See SPEC-gym-hub.md.
export { DEFAULT_PROFILE, profileFor, type Level, type Profile } from './profile';
export { PLACE_GAP, placeAt, placesFor, stripFor, type Place, type PlaceKind } from './places';
export { idle, step, STRIDE_MS, WALK_SPEED, type WalkInput, type WalkState } from './walk';
export { LevelDialog } from './LevelDialog';
export { HubScreen } from './HubScreen';
