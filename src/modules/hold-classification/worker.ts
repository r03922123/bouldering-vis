// Worker-safe API of `hold-classification`: pure functions and data, no React or store.
export { classifyFromEmbedding, cropHold, HOLD_TYPES, type HoldType } from './classify';
export { CLIP_MODEL_ID, PROMPTS } from './prompts';
