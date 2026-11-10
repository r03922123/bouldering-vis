import { fillHoles, keepComponentAt } from '../../lib/components';
import type { Point } from '../../workers/protocol';
import type { HoldMask } from './types';

/** A SAM candidate larger than this is the wall or a cluster, not one hold. */
export const MAX_HOLD_AREA_FRACTION = 0.08;
/** Holes smaller than this fraction of the mask's area are filled. */
const HOLE_FILL_FRACTION = 0.01;

const sum = (m: Uint8Array) => {
  let n = 0;
  for (const v of m) n += v;
  return n;
};

/** Highest-scoring candidate that contains the tap and covers ≤ 8% of the image, else null. */
export function pickMask(
  candidates: readonly Uint8Array[],
  scores: readonly number[],
  tap: Point,
  w: number,
  h: number,
): Uint8Array | null {
  const at = Math.round(tap.y) * w + Math.round(tap.x);
  const maxArea = MAX_HOLD_AREA_FRACTION * w * h;
  let best: Uint8Array | null = null;
  let bestScore = -Infinity;
  candidates.forEach((m, i) => {
    const score = scores[i] ?? -Infinity;
    if (m[at] === 1 && score > bestScore && sum(m) <= maxArea) {
      best = m;
      bestScore = score;
    }
  });
  return best;
}

/**
 * Keeps the blob under the tap, fills small holes, then removes pixels owned by
 * already-selected holds (the earlier selection wins, so masks never overlap).
 */
export function cleanMask(
  mask: Uint8Array,
  tap: Point,
  w: number,
  h: number,
  taken: Uint8Array,
): Uint8Array {
  const blob = keepComponentAt(mask, w, h, tap);
  const filled = fillHoles(blob, w, h, Math.ceil(HOLE_FILL_FRACTION * sum(blob)) - 1);
  for (let i = 0; i < filled.length; i++) if (taken[i]) filled[i] = 0;
  // Subtracting a neighbour can split the mask; keep the tapped side.
  return keepComponentAt(filled, w, h, tap);
}

export function maskStats(
  mask: Uint8Array,
  w: number,
  h: number,
): Pick<HoldMask, 'bbox' | 'centroid' | 'area'> {
  let area = 0;
  let sx = 0;
  let sy = 0;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      area++;
      sx += x;
      sy += y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (!area) return { area: 0, bbox: { x: 0, y: 0, w: 0, h: 0 }, centroid: { x: 0, y: 0 } };
  return {
    area,
    bbox: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 },
    centroid: { x: sx / area, y: sy / area },
  };
}
