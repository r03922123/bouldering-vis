// Public API of the `pixel-kit` module. See SPEC-pixel-kit.md.
export type { PixelJointName, PixelJoints, PixelLimb, Pt } from './types';
export {
  COLOR,
  contrastRatio,
  LIMB_COLOR,
  PALETTE,
  relativeLuminance,
  ROLE_COLOR,
  worstCaseContrast,
  type ColorName,
  type MarkerRole,
  type PaletteIndex,
} from './palette';
export {
  blit,
  bufferFromText,
  bufferToText,
  createBuffer,
  resizeBuffer,
  type PixelBuffer,
} from './buffer';
export {
  ART_HEIGHT_BAND,
  artGrid,
  artPixel,
  minPixelSize,
  pixelSize,
  TARGET_ART_HEIGHT,
  toArt,
  type ArtGrid,
  type PixelView,
} from './view';
export {
  DEFAULT_LOOK,
  HAIR_COLORS,
  OUTFITS,
  SKIN_TONES,
  type Look,
  type Outfit,
  type OutfitId,
} from './outfits';
export {
  limbThickness,
  rasterClimber,
  type LimbThickness,
  type Mood,
  type PixelClimber,
} from './climber';
export {
  ADVANCE,
  GLYPH_H,
  GLYPH_W,
  GLYPHS,
  LINE_HEIGHT,
  measurePixelText,
  rasterText,
} from './font';
export {
  markerFrame,
  rasterMarker,
  TARGET_FRAME_MIN,
  targetFrame,
  type HoldMarker,
  type ReachGap,
} from './markers';
export { createRng, hashSeed } from './rng';
export {
  MAX_PUFFS,
  PUFF_MAX_LIFE_MS,
  PUFF_PARTICLES,
  puffParticles,
  type ChalkPuff,
  type Particle,
} from './puffs';
export { nextChangeAt, renderScene, type PixelScene } from './scene';
export { PixelLayer, type PixelLayerProps } from './PixelLayer';
export { useReducedMotion } from './useReducedMotion';
export { PixelText } from './hud/PixelText';
export { PixelButton } from './hud/PixelButton';
export { GripMeter, MoveCounter, Stars } from './hud/Hud';
export type { PixelIcon } from './hud/icons';
export {
  loadSoundOn,
  MASTER_GAIN,
  MAX_VOICES_AT_ONCE,
  noiseSamples,
  pulseWaveCoefficients,
  saveSoundOn,
  scheduleSfx,
  SFX,
  SOUND_KEY,
  type Ramp,
  type SfxDef,
  type SfxName,
  type Voice,
  type Wave,
} from './sfx';
export { useSfx } from './useSfx';
export { SoundToggle } from './SoundToggle';
