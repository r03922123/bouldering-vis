import type { HandlerContext, Handlers } from './host';
import { lightSamHandlers } from './lightSam';
import { createMaskCache, wallHandlers } from './wallCache';

export interface MlEnv {
  /** An iPhone, an iPad or a ≤ 4 GB device (backend.ts › isLowMemory). */
  lowMemory: boolean;
  /** The later models' loaders, for the background prefetch (depth, then CLIP). */
  load: {
    depth: (ctx: HandlerContext) => Promise<unknown>;
    clip: (ctx: HandlerContext) => Promise<unknown>;
  };
  /** The model handlers (SAM, depth, CLIP). */
  models?: Handlers;
  /** The wall mask (segmentWall by default). */
  segment?: (pixels: ImageData) => Uint8Array;
}

/**
 * The ML worker's handlers. On a low-memory device (SPEC-hold-segmentation › Amendment 2026-11-04)
 * the light hold finder answers the SAM requests and nothing downloads in the background: depth and
 * CLIP still load when first needed (the 3D view, a hold's type).
 */
export function createMlHandlers({ lowMemory, load, models = {}, segment }: MlEnv): Handlers {
  // Route view's mask, the climber's footholds and the light hold finder share one segmentWall run.
  const cache = createMaskCache(segment);
  return {
    ...models,
    ...(lowMemory ? lightSamHandlers(cache) : {}),
    // Load (download + init) the later models in the background, one after the other.
    'models:prefetch': async (_req, ctx) => {
      if (!lowMemory) {
        await load.depth(ctx);
        await load.clip(ctx);
      }
      return { type: 'models:ready' };
    },
    ...wallHandlers(cache),
  };
}
