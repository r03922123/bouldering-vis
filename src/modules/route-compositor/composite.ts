import { makeImageData } from '../../lib/imageData';
import type { HoldMask } from '../hold-segmentation';

export const WALL_COLOR = { r: 0x2b, g: 0x2b, b: 0x2b } as const;
export const OTHER_HOLD_COLOR = { r: 0x8a, g: 0x8a, b: 0x8a } as const;

/**
 * Per pixel, first match wins: selected hold → source pixel unchanged;
 * other hold (when shown) → #8A8A8A; everything else → #2B2B2B.
 */
export function compositeRoute(
  source: ImageData,
  selected: readonly HoldMask[],
  otherHoldsMask: Uint8Array,
  opts: { showOtherHolds: boolean },
): ImageData {
  const { width, height } = source;
  const out = makeImageData(width, height);
  const src = source.data;
  const dst = out.data;
  const keep = new Uint8Array(width * height);
  for (const h of selected) for (let i = 0; i < keep.length; i++) keep[i]! |= h.mask[i]!;

  for (let i = 0, o = 0; i < keep.length; i++, o += 4) {
    if (keep[i]) {
      dst[o] = src[o]!;
      dst[o + 1] = src[o + 1]!;
      dst[o + 2] = src[o + 2]!;
      dst[o + 3] = src[o + 3]!;
      continue;
    }
    const c = opts.showOtherHolds && otherHoldsMask[i] ? OTHER_HOLD_COLOR : WALL_COLOR;
    dst[o] = c.r;
    dst[o + 1] = c.g;
    dst[o + 2] = c.b;
    dst[o + 3] = 255;
  }
  return out;
}
