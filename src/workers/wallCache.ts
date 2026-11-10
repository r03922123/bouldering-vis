import { wallFootholds } from '../modules/climber-stance/worker';
import { segmentWall } from '../modules/route-compositor/worker';
import type { Handlers } from './host';

export interface MaskCache {
  /** The image's wall mask (segmentWall), computed at most once per image. A fresh copy per call. */
  mask(imageId: string, pixels: ImageData): Uint8Array;
}

/**
 * One-entry cache, keyed by image, so Route view's wall:segment and the climber's wall:footholds
 * share one segmentWall run in either order. It keeps its own copy: the host transfers every
 * response buffer, so a shared array would come back detached and empty on the next request.
 */
export function createMaskCache(
  segment: (pixels: ImageData) => Uint8Array = segmentWall,
): MaskCache {
  let cached: { imageId: string; mask: Uint8Array } | null = null;
  return {
    mask(imageId, pixels) {
      if (cached?.imageId !== imageId) cached = { imageId, mask: segment(pixels) };
      return cached.mask.slice();
    },
  };
}

/** The two wall requests, answered from one cache (used by the real and the fake worker). */
export function wallHandlers(
  cache: MaskCache,
): Pick<Required<Handlers>, 'wall:segment' | 'wall:footholds'> {
  return {
    'wall:segment': async (req) => ({
      type: 'wall:mask',
      imageId: req.imageId,
      mask: cache.mask(req.imageId, req.pixels),
    }),
    'wall:footholds': async (req) => {
      const { width, height } = req.pixels;
      const mask = cache.mask(req.imageId, req.pixels);
      return {
        type: 'wall:blobs',
        imageId: req.imageId,
        footholds: wallFootholds(mask, width, height, req.imageId),
      };
    },
  };
}
