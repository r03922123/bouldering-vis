import { makeImageData } from '../../lib/imageData';
import type { HoldMask } from './types';

const THICKNESS = 2;

/** Calls `visit(i)` for every pixel within 2 px inside a hold's edge. Scans only each hold's bbox. */
function forEachOutlinePixel(
  holds: readonly HoldMask[],
  w: number,
  h: number,
  visit: (i: number) => void,
): void {
  const inside = (m: Uint8Array, x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && m[y * w + x] === 1;
  for (const { mask, bbox } of holds) {
    for (let y = bbox.y; y < bbox.y + bbox.h; y++) {
      for (let x = bbox.x; x < bbox.x + bbox.w; x++) {
        if (!mask[y * w + x]) continue;
        let edge = false;
        for (let d = -THICKNESS; d <= THICKNESS && !edge; d++) {
          for (let e = -THICKNESS; e <= THICKNESS && !edge; e++) {
            if (!inside(mask, x + d, y + e)) edge = true;
          }
        }
        if (edge) visit(y * w + x);
      }
    }
  }
}

/** 1 where a pixel lies within 2 px inside a hold's edge. */
export function outlinePixels(holds: readonly HoldMask[], w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  forEachOutlinePixel(holds, w, h, (i) => (out[i] = 1));
  return out;
}

/** The outlines as a ready-to-draw layer in one color; everything else stays transparent. */
export function outlineLayer(
  holds: readonly HoldMask[],
  w: number,
  h: number,
  [r, g, b]: readonly [number, number, number],
): ImageData {
  const out = makeImageData(w, h);
  const px = out.data;
  forEachOutlinePixel(holds, w, h, (i) => {
    px[i * 4] = r;
    px[i * 4 + 1] = g;
    px[i * 4 + 2] = b;
    px[i * 4 + 3] = 255;
  });
  return out;
}
