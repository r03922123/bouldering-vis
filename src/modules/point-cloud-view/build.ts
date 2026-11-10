import type { DepthMap } from '../depth-estimation';
import type { HoldMask } from '../hold-segmentation';

// SPEC-point-cloud-view › How It Works. Pure: runs on whichever thread calls it.

export interface Intrinsics {
  f: number;
  cx: number;
  cy: number;
}

export const DEFAULT_HFOV_DEG = 60;
export const DEFAULT_RELIEF = 0.35;
export const FLYING_PIXEL_JUMP = 0.08;
export const SELECTED_SIZE = 1.6;

export function intrinsics(w: number, h: number, hfovDeg = DEFAULT_HFOV_DEG): Intrinsics {
  return { f: w / 2 / Math.tan((hfovDeg * Math.PI) / 360), cx: w / 2, cy: h / 2 };
}

/**
 * Pinhole unprojection. Depth is relative, so z = 1 − relief·d is a display mapping
 * (d = 1 is nearest). three.js frame: +y up, the camera looks toward −z.
 */
export function unproject(
  u: number,
  v: number,
  d: number,
  k: Intrinsics,
  relief: number,
): [number, number, number] {
  const z = 1 - relief * d;
  return [((u - k.cx) * z) / k.f, (-(v - k.cy) * z) / k.f, -z];
}

/** Smallest stride whose grid plus the selected pixels fits the budget. */
export function pickStride(w: number, h: number, budget: number, selectedPixels: number): number {
  let s = 1;
  while (Math.ceil(w / s) * Math.ceil(h / s) + selectedPixels > budget && s < Math.max(w, h)) s++;
  return s;
}

/** 1 where a pixel's depth differs from a neighbour by more than `jump` (hold/wall edges). */
export function flyingPixels(
  depth: Float32Array,
  w: number,
  h: number,
  jump = FLYING_PIXEL_JUMP,
): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = depth[y * w + x]!;
      let max = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          max = Math.max(max, Math.abs(depth[yy * w + xx]! - d));
        }
      }
      if (max > jump) out[y * w + x] = 1;
    }
  }
  return out;
}

export function recolor(indices: Int32Array, image: ImageData): Float32Array {
  const out = new Float32Array(indices.length * 3);
  indices.forEach((i, p) => {
    out[p * 3] = image.data[i * 4]! / 255;
    out[p * 3 + 1] = image.data[i * 4 + 1]! / 255;
    out[p * 3 + 2] = image.data[i * 4 + 2]! / 255;
  });
  return out;
}

export function reposition(indices: Int32Array, depth: DepthMap, relief: number): Float32Array {
  const { width: w, height: h } = depth;
  const k = intrinsics(w, h);
  const out = new Float32Array(indices.length * 3);
  indices.forEach((i, p) => {
    const x = i % w;
    const y = (i - x) / w;
    out.set(unproject(x + 0.5, y + 0.5, depth.depth[i]!, k, relief), p * 3);
  });
  return out;
}

export interface PointCloudData {
  /** Source pixel of each point, so colors/positions can be rebuilt without re-sampling. */
  indices: Int32Array;
  positions: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  count: number;
}

export function buildPointCloud(input: {
  depth: DepthMap;
  source: ImageData;
  composite: ImageData;
  holds: readonly HoldMask[];
  colorMode: 'photo' | 'route';
  relief: number;
  budget: number;
}): PointCloudData {
  const { depth, holds, budget } = input;
  const { width: w, height: h } = depth;
  const n = w * h;
  const selected = new Uint8Array(n);
  for (const hold of holds) {
    const b = hold.bbox ?? { x: 0, y: 0, w, h };
    for (let y = b.y; y < b.y + b.h; y++) {
      for (let x = b.x; x < b.x + b.w; x++) selected[y * w + x]! |= hold.mask[y * w + x]!;
    }
  }
  // Precomputed by the depth worker when available (keeps this pass off the main thread).
  const flying = depth.discontinuities ?? flyingPixels(depth.depth, w, h);

  // Selected holds at full resolution, everything else on a stride grid.
  const picked: number[] = [];
  for (let i = 0; i < n; i++) if (selected[i] && !flying[i]) picked.push(i);
  const stride = pickStride(w, h, budget, picked.length);
  for (let y = 0; y < h; y += stride) {
    for (let x = 0; x < w; x += stride) {
      const i = y * w + x;
      if (!selected[i] && !flying[i]) picked.push(i);
    }
  }

  const indices = Int32Array.from(picked);
  const sizes = Float32Array.from(indices, (i) => (selected[i] ? SELECTED_SIZE : 1));
  return {
    indices,
    positions: reposition(indices, depth, input.relief),
    colors: recolor(indices, input.colorMode === 'route' ? input.composite : input.source),
    sizes,
    count: indices.length,
  };
}
