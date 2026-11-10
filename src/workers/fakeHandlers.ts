import { flyingPixels } from '../modules/point-cloud-view/worker';
import { computeNormals } from '../modules/depth-estimation/worker';
import { HoldLedger } from '../modules/hold-segmentation/worker';
import type { Handlers } from './host';
import type { Point } from './protocol';
import { createMaskCache, wallHandlers } from './wallCache';

// Deterministic stand-ins for the real models, used by E2E tests and CI.

/** The synthetic wall's color: a tap here gets only wall-sized masks, like real SAM on bare wall. */
const WALL_RGB = [207, 210, 204] as const;
const isWall = (img: ImageData, p: Point) => {
  const i = (p.y * img.width + p.x) * 4;
  return WALL_RGB.every((c, k) => Math.abs(img.data[i + k]! - c) <= 25);
};

function disc(width: number, height: number, c: Point, r: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let y = Math.max(0, c.y - r); y <= Math.min(height - 1, c.y + r); y++) {
    for (let x = Math.max(0, c.x - r); x <= Math.min(width - 1, c.x + r); x++) {
      if ((x - c.x) ** 2 + (y - c.y) ** 2 <= r * r) mask[y * width + x] = 1;
    }
  }
  return mask;
}

function seededUnitVector(seedText: string, dims: number): Float32Array {
  let seed = 2166136261;
  for (const ch of seedText) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0;
  const v = new Float32Array(dims);
  for (let i = 0; i < dims; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    v[i] = seed / 2 ** 32 - 0.5;
  }
  const norm = Math.hypot(...v);
  return v.map((x) => x / norm);
}

/**
 * A fresh set of fake handlers with its own state, like one Worker. Unit tests get one per client
 * so holds never leak between tests; the E2E fake worker uses one for the page.
 */
export function createFakeHandlers(): Required<Handlers> {
  const images = new Map<string, { pixels: ImageData; ledger: HoldLedger }>();

  /** Three candidates for a tap: part / whole / surroundings like SAM's, or only wall-sized ones on bare wall. */
  function candidates(imageId: string, tap: Point) {
    const entry = images.get(imageId);
    if (!entry) throw new Error(`fake sam: no embedding for ${imageId}`);
    const img = entry.pixels;
    const point = { x: Math.round(tap.x), y: Math.round(tap.y) };
    const masks = isWall(img, point)
      ? [0, 1, 2].map(() => new Uint8Array(img.width * img.height).fill(1))
      : [6, 14, 40].map((r) => disc(img.width, img.height, point, r));
    return { ledger: entry.ledger, masks, scores: [0.8, 0.95, 0.7], point };
  }

  return {
    'sam:embed': async (req) => {
      // Like the real worker: the same image again keeps its ledger. Only the latest image is kept.
      const same = images.get(req.imageId);
      images.clear();
      const { width, height } = req.pixels;
      images.set(
        req.imageId,
        same ?? { pixels: req.pixels, ledger: new HoldLedger(width, height) },
      );
      return { type: 'sam:ready', imageId: req.imageId };
    },
    'sam:decode': async (req) => {
      const { ledger, masks, scores, point } = candidates(req.imageId, req.point);
      ledger.prune(req.selected, req.seen);
      return { type: 'sam:hold', imageId: req.imageId, ...ledger.finish(masks, scores, point) };
    },
    'sam:candidates': async (req) => {
      const { masks, scores } = candidates(req.imageId, req.point);
      return { type: 'sam:masks', imageId: req.imageId, masks, scores };
    },
    'depth:run': async (req) => {
      const { width, height } = req.pixels;
      const depth = new Float32Array(width * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) depth[y * width + x] = width > 1 ? x / (width - 1) : 0;
      }
      const normals = computeNormals(depth, width, height, { gain: 'auto' });
      const discontinuities = flyingPixels(depth, width, height);
      return {
        type: 'depth:result',
        imageId: req.imageId,
        depth,
        normals,
        discontinuities,
        width,
        height,
      };
    },
    'clip:embed': async (req) => ({
      type: 'clip:embedding',
      holdId: req.holdId,
      embedding: seededUnitVector(req.holdId, 512),
    }),
    'models:prefetch': async (_req, { progress }) => {
      progress({ model: 'depth', file: 'model.onnx', loaded: 1, total: 1 });
      progress({ model: 'clip', file: 'vision_model.onnx', loaded: 1, total: 1 });
      return { type: 'models:ready' };
    },
    // The real heuristic: pure, fast and deterministic, so E2E can check the gray holds and the
    // wall footholds. Each fake worker has its own mask cache, so tests never share one.
    ...wallHandlers(createMaskCache()),
  };
}

/** One shared instance (for tests of the handlers themselves). */
export const fakeHandlers = createFakeHandlers();
