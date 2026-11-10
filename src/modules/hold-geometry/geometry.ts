import { dilate } from '../../lib/morphology';
import type { DepthMap } from '../depth-estimation';
import type { HoldMask } from '../hold-segmentation';

export type Orientation = 'standard' | 'sidepull' | 'undercling';
export type Facing =
  'up' | 'up-right' | 'right' | 'down-right' | 'down' | 'down-left' | 'left' | 'up-left' | 'out';
type Vec3 = [number, number, number];

export interface HoldGeometry {
  holdId: string;
  /** Mean hold normal n̂, +z toward the viewer. */
  normal: Vec3;
  /** Mean normal of the wall around the hold, ŵ. */
  wallNormal: Vec3;
  /** R = |Σn| / count, 0–1. */
  consistency: number;
  orientation: Orientation;
  /** 'out' when the arrow would be a ⊙ dot. */
  facing: Facing;
  /** The mask's outline shape (second moments): long thin upright holds are sidepulls. */
  shape?: HoldShape;
}

export interface HoldShape {
  /** Long axis over short axis (1 = round). */
  elongation: number;
  /** Long axis from vertical, 0–90°. */
  tiltDeg: number;
  /** Centroid x, image pixels. */
  x: number;
}

/** Shape from the mask's second moments over its bounding box. */
export function holdShape(hold: HoldMask, w: number): HoldShape {
  const { x: bx, y: by, w: bw, h: bh } = hold.bbox;
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (let y = by; y < by + bh; y++) {
    for (let x = bx; x < bx + bw; x++) {
      if (!hold.mask[y * w + x]) continue;
      n++;
      sx += x;
      sy += y;
    }
  }
  if (!n) return { elongation: 1, tiltDeg: 0, x: bx + bw / 2 };
  const mx = sx / n;
  const my = sy / n;
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (let y = by; y < by + bh; y++) {
    for (let x = bx; x < bx + bw; x++) {
      if (!hold.mask[y * w + x]) continue;
      xx += (x - mx) ** 2;
      yy += (y - my) ** 2;
      xy += (x - mx) * (y - my);
    }
  }
  const tr = (xx + yy) / n;
  const det = (xx * yy - xy * xy) / (n * n);
  const gap = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + gap;
  const l2 = Math.max(1e-9, tr / 2 - gap);
  // Long-axis angle from the x axis; tilt is measured from vertical.
  const ang = (0.5 * Math.atan2(2 * xy, xx - yy) * 180) / Math.PI;
  return { elongation: Math.sqrt(l1 / l2), tiltDeg: 90 - Math.abs(ang), x: mx };
}

const STANDARD_MAX_DEG = 20;
const RING_INNER = 6;
const RING_OUTER = 20;
/** Arrow length is 80 px × |n̂xy|; under 12 px it becomes a dot. */
export const ARROW_PX = 80;
export const DOT_BELOW_PX = 12;
export const UNCERTAIN_BELOW = 0.4;
// Normals are computed after a σ = 2 px blur, so a hold's edge contaminates ~3σ px inward.
const EROSION_STEPS = [6, 2, 0];
const MIN_ERODED_PX = 10;

const WORDS: Facing[] = [
  'right',
  'down-right',
  'down',
  'down-left',
  'left',
  'up-left',
  'up',
  'up-right',
];

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l > 0 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 0, 1];
}

export function facingWord(n: Vec3): Facing {
  const len = Math.hypot(n[0], n[1]);
  if (ARROW_PX * len < DOT_BELOW_PX) return 'out';
  const a = Math.atan2(n[1], n[0]); // image coordinates: +y is down
  return WORDS[(Math.round(a / (Math.PI / 4)) + 8) % 8]!;
}

/**
 * Image indices of the ring RING_INNER < d ≤ RING_OUTER (Chebyshev distance) around the hold.
 * Works on a crop around the hold with separable dilation: O(crop area).
 */
function ringAround(hold: HoldMask, w: number, h: number): number[] {
  const { x: bx, y: by, w: bw, h: bh } = hold.bbox;
  const x0 = Math.max(0, bx - RING_OUTER);
  const y0 = Math.max(0, by - RING_OUTER);
  const x1 = Math.min(w - 1, bx + bw - 1 + RING_OUTER);
  const y1 = Math.min(h - 1, by + bh - 1 + RING_OUTER);
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const crop = new Uint8Array(cw * ch);
  for (let y = by; y < by + bh; y++) {
    for (let x = bx; x < bx + bw; x++) crop[(y - y0) * cw + (x - x0)] = hold.mask[y * w + x]!;
  }
  const outer = dilate(crop, cw, ch, 2 * RING_OUTER + 1);
  const inner = dilate(crop, cw, ch, 2 * RING_INNER + 1);
  const ring: number[] = [];
  for (let i = 0; i < crop.length; i++) {
    if (outer[i] && !inner[i]) ring.push((y0 + Math.floor(i / cw)) * w + x0 + (i % cw));
  }
  return ring;
}

function eroded(hold: HoldMask, w: number, h: number, r: number): number[] {
  const { x: bx, y: by, w: bw, h: bh } = hold.bbox;
  const keep: number[] = [];
  for (let y = by; y < by + bh; y++) {
    for (let x = bx; x < bx + bw; x++) {
      if (!hold.mask[y * w + x]) continue;
      let ok = true;
      for (let dy = -r; dy <= r && ok; dy++) {
        for (let dx = -r; dx <= r && ok; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h || !hold.mask[yy * w + xx]) ok = false;
        }
      }
      if (ok) keep.push(y * w + x);
    }
  }
  return keep;
}

function meanNormal(normals: Float32Array, pixels: Iterable<number>): { n: Vec3; r: number } {
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let count = 0;
  for (const i of pixels) {
    sx += normals[i * 3]!;
    sy += normals[i * 3 + 1]!;
    sz += normals[i * 3 + 2]!;
    count++;
  }
  if (!count) return { n: [0, 0, 1], r: 0 };
  return { n: normalize([sx, sy, sz]), r: Math.hypot(sx, sy, sz) / count };
}

/**
 * Hold normal from the eroded mask, wall normal from a 6–20 px ring around it (other
 * selected holds excluded), and the orientation of the hold relative to that wall.
 */
export function holdGeometry(
  hold: HoldMask,
  holds: readonly HoldMask[],
  depth: DepthMap,
  { erode }: { erode?: number } = {},
): HoldGeometry {
  const { width: w, height: h, normals } = depth;

  const steps = erode === undefined ? EROSION_STEPS : [erode];
  let pixels: number[] = [];
  for (const r of steps) {
    pixels = eroded(hold, w, h, r);
    if (pixels.length >= MIN_ERODED_PX || r === 0) break;
  }
  const { n, r: consistency } = meanNormal(normals, pixels);

  const ring = ringAround(hold, w, h).filter((i) => !holds.some((o) => o.mask[i]));
  const wall = meanNormal(normals, ring).n;

  const dot = n[0] * wall[0] + n[1] * wall[1] + n[2] * wall[2];
  const tilt = (Math.acos(Math.min(1, Math.max(-1, dot))) * 180) / Math.PI;
  let orientation: Orientation = 'standard';
  if (tilt >= STANDARD_MAX_DEG) {
    const rel: Vec3 = [n[0] - dot * wall[0], n[1] - dot * wall[1], n[2] - dot * wall[2]];
    const a = (Math.atan2(rel[1], rel[0]) * 180) / Math.PI;
    if (a >= 45 && a <= 135) orientation = 'undercling';
    else if (a <= -45 && a >= -135) orientation = 'standard';
    else orientation = 'sidepull';
  }

  return {
    holdId: hold.id,
    normal: n,
    wallNormal: wall,
    consistency,
    orientation,
    facing: facingWord(n),
    shape: holdShape(hold, w),
  };
}
