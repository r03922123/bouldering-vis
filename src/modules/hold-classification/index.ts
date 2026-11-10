// Public API of the `hold-classification` module. See SPEC-hold-classification.md.
export {
  applySizePrior,
  classifyFromEmbedding,
  cropHold,
  HOLD_TYPES,
  MIN_VOLUME_SHARE,
  UNSURE_BELOW,
  type HoldType,
} from './classify';
export {
  effectiveClassification,
  type HoldClassification,
  type StoredClassification,
} from './classification';
export { CLIP_MODEL_ID, PROMPTS } from './prompts';
export { useClassification } from './useClassification';
export { Credits, HoldCard } from './HoldCard';
export { LEARN_PHOTOS } from './names';
