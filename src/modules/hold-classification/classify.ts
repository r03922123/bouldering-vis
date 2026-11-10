import { makeImageData } from '../../lib/imageData';
import type { HoldMask } from '../hold-segmentation';

export const HOLD_TYPES = [
  'jug',
  'crimp',
  'edge',
  'sloper',
  'pinch',
  'pocket',
  'volume',
  'foot-chip',
] as const;
export type HoldType = (typeof HOLD_TYPES)[number];

/** Below this top probability the label reads "Unsure — X?". */
export const UNSURE_BELOW = 0.35;
const PADDING = 0.2;
const GREY = [0x80, 0x80, 0x80, 255] as const;
/** CLIP's learned logit scale. */
const LOGIT_SCALE = 100;

/** Square crop of the hold's bbox + 20% padding; pixels outside the mask are neutral grey. */
export function cropHold(source: ImageData, hold: HoldMask, size = 224): ImageData {
  const { width: w, height: h, data } = source;
  const { x, y, w: bw, h: bh } = hold.bbox;
  const side = Math.max(bw, bh) * (1 + 2 * PADDING);
  const x0 = x + bw / 2 - side / 2;
  const y0 = y + bh / 2 - side / 2;
  const out = makeImageData(size, size);
  for (let v = 0; v < size; v++) {
    const sy = Math.floor(y0 + ((v + 0.5) * side) / size);
    for (let u = 0; u < size; u++) {
      const sx = Math.floor(x0 + ((u + 0.5) * side) / size);
      const o = (v * size + u) * 4;
      const inside = sx >= 0 && sy >= 0 && sx < w && sy < h && hold.mask[sy * w + sx] === 1;
      if (inside) out.data.set(data.subarray((sy * w + sx) * 4, (sy * w + sx) * 4 + 4), o);
      else out.data.set(GREY, o);
    }
  }
  return out;
}

/** Cosine similarity × CLIP logit scale → softmax over the classes; returns the top `k`. */
export function classifyFromEmbedding(
  imageEmb: Float32Array,
  textEmbs: Record<HoldType, Float32Array>,
  k = 3,
  types: readonly HoldType[] = HOLD_TYPES,
): { type: HoldType; prob: number }[] {
  const norm = Math.hypot(...imageEmb) || 1;
  const logits = types.map((t) => {
    const te = textEmbs[t];
    let dot = 0;
    for (let i = 0; i < imageEmb.length; i++) dot += imageEmb[i]! * te[i]!;
    return (LOGIT_SCALE * dot) / norm;
  });
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const total = exps.reduce((a, b) => a + b, 0);
  return types
    .map((type, i) => ({ type, prob: exps[i]! / total }))
    .sort((a, b) => b.prob - a.prob)
    .slice(0, k);
}

/**
 * Volumes are physically big; CLIP sees only a size-normalized crop and over-predicts them.
 * Below this share of the image a hold can't be a volume (decision D1; on the spray-wall review
 * the only real volume was 1.18% and the smaller "volumes" were holds).
 */
export const MIN_VOLUME_SHARE = 0.008;

/** Removes "volume" for small holds and renormalizes; `areaShare` = hold area / image area. */
export function applySizePrior(
  ranked: { type: HoldType; prob: number }[],
  areaShare: number,
): { type: HoldType; prob: number }[] {
  if (areaShare >= MIN_VOLUME_SHARE) return ranked;
  const rest = ranked.filter((t) => t.type !== 'volume');
  const sum = rest.reduce((s, t) => s + t.prob, 0) || 1;
  return rest.map((t) => ({ ...t, prob: t.prob / sum }));
}
