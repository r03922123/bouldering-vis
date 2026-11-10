import textEmbeddings from '../../data/clip-text-embeddings.json';
import { classifyFromEmbedding, HOLD_TYPES, type HoldType } from './classify';
import { classifyWithProbe, type Probe } from './probe';

/**
 * Types zero-shot ranks. Not foot-chip: its prompt embedding is within cosine 0.95–0.98 of every
 * other type, so including it made zero-shot call most holds a foot chip (222 of 275 real holds).
 * Foot chip stays available from the picker and from the probe.
 */
export const ZERO_SHOT_TYPES = HOLD_TYPES.filter((t) => t !== 'foot-chip');

const TEXT = Object.fromEntries(
  ZERO_SHOT_TYPES.map((t) => [t, Float32Array.from(textEmbeddings.embeddings[t])]),
) as Record<HoldType, Float32Array>;

const isHoldType = (t: string): t is HoldType => (HOLD_TYPES as readonly string[]).includes(t);

/**
 * Hold types ranked for an image embedding: the trained probe when one ships (D7), otherwise the
 * zero-shot text embeddings.
 */
export function rankEmbedding(
  embedding: Float32Array,
  probe: Probe | null,
): { type: HoldType; prob: number }[] {
  if (!probe)
    return classifyFromEmbedding(embedding, TEXT, ZERO_SHOT_TYPES.length, ZERO_SHOT_TYPES);
  return classifyWithProbe(embedding, probe).flatMap((t) =>
    isHoldType(t.type) ? [{ type: t.type, prob: t.prob }] : [],
  );
}
