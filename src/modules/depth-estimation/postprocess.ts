import { makeImageData } from '../../lib/imageData';

// Pure post-processing of Depth Anything's relative inverse depth (SPEC-depth-estimation).

export function upsampleBilinear(
  src: Float32Array,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): Float32Array {
  const out = new Float32Array(dw * dh);
  const fx = dw > 1 ? (sw - 1) / (dw - 1) : 0;
  const fy = dh > 1 ? (sh - 1) / (dh - 1) : 0;
  for (let y = 0; y < dh; y++) {
    const sy = y * fy;
    const y0 = Math.floor(sy);
    const y1 = Math.min(sh - 1, y0 + 1);
    const ty = sy - y0;
    for (let x = 0; x < dw; x++) {
      const sx = x * fx;
      const x0 = Math.floor(sx);
      const x1 = Math.min(sw - 1, x0 + 1);
      const tx = sx - x0;
      const top = src[y0 * sw + x0]! * (1 - tx) + src[y0 * sw + x1]! * tx;
      const bottom = src[y1 * sw + x0]! * (1 - tx) + src[y1 * sw + x1]! * tx;
      out[y * dw + x] = top * (1 - ty) + bottom * ty;
    }
  }
  return out;
}

/** Clips to the [lowPct, highPct] percentiles and rescales to 0–1 (1 = nearest). */
export function normalizeDepth(d: Float32Array, lowPct = 1, highPct = 99): Float32Array {
  const sorted = Float32Array.from(d).sort();
  const n = sorted.length;
  const lo = sorted[Math.min(n - 1, Math.floor((n * lowPct) / 100))]!;
  const hi = sorted[Math.min(n - 1, Math.floor((n * highPct) / 100))]!;
  const span = hi - lo;
  if (!(span > 0)) return new Float32Array(n);
  return d.map((v) => Math.min(1, Math.max(0, (v - lo) / span)));
}

function blur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const r = Math.ceil(sigma * 3);
  const k = Float32Array.from({ length: 2 * r + 1 }, (_, i) =>
    Math.exp(-((i - r) ** 2) / (2 * sigma * sigma)),
  );
  const sum = k.reduce((a, b) => a + b, 0);
  for (let i = 0; i < k.length; i++) k[i]! /= sum;
  const pass = (input: Float32Array, horizontal: boolean) => {
    const out = new Float32Array(input.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let acc = 0;
        for (let j = -r; j <= r; j++) {
          const sx = horizontal ? Math.min(w - 1, Math.max(0, x + j)) : x;
          const sy = horizontal ? y : Math.min(h - 1, Math.max(0, y + j));
          acc += input[sy * w + sx]! * k[j + r]!;
        }
        out[y * w + x] = acc;
      }
    }
    return out;
  };
  return pass(pass(src, true), false);
}

/** Depth units per pixel, 90th percentile of |∇d|, sampled on a 3-px grid. */
function p90Gradient(gx: Float32Array, gy: Float32Array, w: number, h: number): number {
  const mags: number[] = [];
  for (let y = 0; y < h; y += 3)
    for (let x = 0; x < w; x += 3) mags.push(Math.hypot(gx[y * w + x]!, gy[y * w + x]!));
  mags.sort((a, b) => a - b);
  return mags[Math.floor(0.9 * (mags.length - 1))] ?? 0;
}

const AUTO_GAIN_MIN = 40;
const AUTO_GAIN_MAX = 2000;

/**
 * Per-pixel unit normals from a depth map treated as a height field (+x right, +y down,
 * +z toward the viewer). Depth is relative, so `gain` sets how strong relief looks. 'auto'
 * picks gain = 1 / p90(|∇d|): the steepest 10% of the surface reads as ≥ 45° on any photo
 * (fixed gain 40 left real holds nearly flat, see SPEC-hold-geometry › Check Results).
 */
export function computeNormals(
  depth: Float32Array,
  w: number,
  h: number,
  { sigma = 2, gain = 40 }: { sigma?: number; gain?: number | 'auto' } = {},
): Float32Array {
  const d = blur(depth, w, h, sigma);
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const xl = Math.max(0, x - 1);
      const xr = Math.min(w - 1, x + 1);
      const yu = Math.max(0, y - 1);
      const yd = Math.min(h - 1, y + 1);
      gx[y * w + x] = (d[y * w + xr]! - d[y * w + xl]!) / Math.max(1, xr - xl);
      gy[y * w + x] = (d[yd * w + x]! - d[yu * w + x]!) / Math.max(1, yd - yu);
    }
  }
  let k = typeof gain === 'number' ? gain : AUTO_GAIN_MIN;
  if (gain === 'auto') {
    const g90 = p90Gradient(gx, gy, w, h);
    k = g90 > 0 ? Math.min(AUTO_GAIN_MAX, Math.max(AUTO_GAIN_MIN, 1 / g90)) : AUTO_GAIN_MIN;
  }
  const out = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = -k * gx[y * w + x]!;
      const ny = -k * gy[y * w + x]!;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * w + x) * 3;
      out[i] = nx / len;
      out[i + 1] = ny / len;
      out[i + 2] = 1 / len;
    }
  }
  return out;
}

// Viridis (matplotlib) at every 1/8, linearly interpolated: perceptually uniform, colorblind-safe.
const STOPS = [
  '#440154',
  '#482878',
  '#3e4989',
  '#31688e',
  '#26828e',
  '#1f9e89',
  '#35b779',
  '#6ece58',
  '#fde725',
].map((hex) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)));
const VIRIDIS = Array.from({ length: 256 }, (_, i) => {
  const t = (i / 255) * (STOPS.length - 1);
  const k = Math.min(STOPS.length - 2, Math.floor(t));
  const f = t - k;
  return [0, 1, 2].map((ch) => Math.round(STOPS[k]![ch]! * (1 - f) + STOPS[k + 1]![ch]! * f));
});

/** Depth 0 (far) → dark purple … 1 (near) → yellow. */
export function depthToColormap(depth: Float32Array, w: number, h: number): ImageData {
  const out = makeImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const c = VIRIDIS[Math.round(Math.min(1, Math.max(0, depth[i]!)) * 255)]!;
    out.data.set([c[0]!, c[1]!, c[2]!, 255], i * 4);
  }
  return out;
}
