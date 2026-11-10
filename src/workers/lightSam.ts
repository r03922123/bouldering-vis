import { keepComponentAt } from '../lib/components';
import { HoldLedger } from '../modules/hold-segmentation/worker';
import type { Handlers } from './host';
import type { Point } from './protocol';
import type { MaskCache } from './wallCache';

// SPEC-hold-segmentation › Amendment 2026-11-04: the light hold finder, for a device that can't hold
// SAM's encoder (~2.4 GB at its peak on the iPhone 12 twin). A tap takes the wall mask's hold under
// it (segmentWall, the color heuristic Route view already runs), so nothing is downloaded and the
// page stays small. The same ledger as SAM's keeps two holds from ever overlapping.

/** How far a tap may land off a hold and still take it, as a share of the photo's short side. */
export const SNAP_FRACTION = 0.015;

/** `p` when it is on a hold, else the nearest hold pixel within `r` px, else null. */
export function snapToHold(
  mask: Uint8Array,
  w: number,
  h: number,
  p: Point,
  r: number,
): Point | null {
  const x0 = Math.round(p.x);
  const y0 = Math.round(p.y);
  if (mask[y0 * w + x0]) return { x: x0, y: y0 };
  const ri = Math.floor(r);
  let best: Point | null = null;
  let bestD = Infinity;
  for (let y = Math.max(0, y0 - ri); y <= Math.min(h - 1, y0 + ri); y++) {
    for (let x = Math.max(0, x0 - ri); x <= Math.min(w - 1, x0 + ri); x++) {
      if (!mask[y * w + x]) continue;
      const d = (x - x0) ** 2 + (y - y0) ** 2;
      if (d <= r * r && d < bestD) {
        best = { x, y };
        bestD = d;
      }
    }
  }
  return best;
}

interface Current {
  imageId: string;
  width: number;
  height: number;
  mask: Uint8Array;
  ledger: HoldLedger;
}

/** The SAM requests, answered from the wall mask. */
export function lightSamHandlers(
  cache: MaskCache,
): Pick<Required<Handlers>, 'sam:embed' | 'sam:decode' | 'sam:candidates'> {
  let current: Current | null = null;
  const photo = (imageId: string): Current => {
    if (current?.imageId !== imageId) throw new Error(`no embedding for image ${imageId}`);
    return current;
  };
  /** The hold under (or just beside) the tap, and the point inside it the ledger should use. */
  const under = ({ mask, width: w, height: h }: Current, tap: Point) => {
    const at = snapToHold(mask, w, h, tap, SNAP_FRACTION * Math.min(w, h));
    return at
      ? { masks: [keepComponentAt(mask, w, h, at)], scores: [1], at }
      : { masks: [], scores: [], at: tap };
  };
  return {
    'sam:embed': async (req) => {
      if (current?.imageId !== req.imageId) {
        const { width, height } = req.pixels;
        current = {
          imageId: req.imageId,
          width,
          height,
          mask: cache.mask(req.imageId, req.pixels),
          ledger: new HoldLedger(width, height),
        };
      }
      return { type: 'sam:ready', imageId: req.imageId };
    },
    'sam:decode': async (req) => {
      const c = photo(req.imageId);
      c.ledger.prune(req.selected, req.seen);
      const { masks, scores, at } = under(c, req.point);
      return { type: 'sam:hold', imageId: req.imageId, ...c.ledger.finish(masks, scores, at) };
    },
    'sam:candidates': async (req) => {
      const { masks, scores } = under(photo(req.imageId), req.point);
      return { type: 'sam:masks', imageId: req.imageId, masks, scores };
    },
  };
}
