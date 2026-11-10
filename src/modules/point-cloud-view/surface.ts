import type { DepthMap } from '../depth-estimation';
import { FLYING_PIXEL_JUMP, intrinsics } from './build';

/** One soft light from the upper left, in front of the wall (image frame: +y down, +z out). */
const L = [-0.35, -0.55, 0.76];
const LEN = Math.hypot(L[0]!, L[1]!, L[2]!);
export const LIGHT: [number, number, number] = [L[0]! / LEN, L[1]! / LEN, L[2]! / LEN];
const AMBIENT = 0.5;

/**
 * Lambert shading so relief reads as shape: each color is scaled by ambient + diffuse·max(0, n·L).
 * `normals` is per source pixel (3 per pixel); `indices` maps each color to its pixel.
 */
export function shade(
  colors: Float32Array,
  indices: Int32Array,
  normals: Float32Array,
): Float32Array {
  const out = new Float32Array(colors.length);
  indices.forEach((i, p) => {
    const d =
      normals[i * 3]! * LIGHT[0] + normals[i * 3 + 1]! * LIGHT[1] + normals[i * 3 + 2]! * LIGHT[2];
    const k = AMBIENT + (1 - AMBIENT) * Math.max(0, d);
    out[p * 3] = colors[p * 3]! * k;
    out[p * 3 + 1] = colors[p * 3 + 1]! * k;
    out[p * 3 + 2] = colors[p * 3 + 2]! * k;
  });
  return out;
}

export interface Surface {
  colors: Float32Array;
  index: Uint32Array;
  vertexCount: number;
}

/** The stride grid: its size and the source pixel of each vertex. */
function grid(w: number, h: number, stride: number) {
  const cols = Math.floor((w - 1) / stride) + 1;
  const rows = Math.floor((h - 1) / stride) + 1;
  const pix = new Int32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) pix[r * cols + c] = r * stride * w + c * stride;
  }
  return { cols, rows, pix };
}

/**
 * The depth map as a triangle mesh on a stride grid, colored from `image` and shaded. Triangles that
 * touch a depth discontinuity or span a steep slope are dropped, so edges don't smear into sheets.
 * Relief is not an input: positions come from `surfacePositions`, so moving the Relief slider
 * never rebuilds the triangles.
 */
export function buildSurface(depth: DepthMap, image: ImageData, stride: number): Surface {
  const { cols, rows, pix } = grid(depth.width, depth.height, stride);
  const raw = new Float32Array(pix.length * 3);
  pix.forEach((i, v) => {
    raw[v * 3] = image.data[i * 4]! / 255;
    raw[v * 3 + 1] = image.data[i * 4 + 1]! / 255;
    raw[v * 3 + 2] = image.data[i * 4 + 2]! / 255;
  });
  const d = depth.depth;
  const jump = depth.discontinuities;
  const ok = (v: number) => !jump || !jump[pix[v]!];
  // A cell can span a slope that is gradual per pixel but steep across the stride: drop it too.
  const flat = (a: number, b: number, c: number) => {
    const da = d[pix[a]!]!;
    const db = d[pix[b]!]!;
    const dc = d[pix[c]!]!;
    return Math.max(da, db, dc) - Math.min(da, db, dc) <= FLYING_PIXEL_JUMP;
  };
  const tris: number[] = [];
  for (let r = 0; r + 1 < rows; r++) {
    for (let c = 0; c + 1 < cols; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const e = a + cols;
      const f = e + 1;
      if (ok(a) && ok(b) && ok(e) && flat(a, b, e)) tris.push(a, e, b);
      if (ok(b) && ok(e) && ok(f) && flat(b, e, f)) tris.push(b, e, f);
    }
  }
  return {
    colors: shade(raw, pix, depth.normals),
    index: Uint32Array.from(tris),
    vertexCount: pix.length,
  };
}

/**
 * Vertex positions of `buildSurface`'s grid for a relief. Runs on every Relief tick, so it writes
 * `unproject`'s formula straight into the buffer (no array per vertex); the test pins it to `unproject`.
 */
export function surfacePositions(depth: DepthMap, relief: number, stride: number): Float32Array {
  const { width: w, height: h } = depth;
  const { f, cx, cy } = intrinsics(w, h);
  const cols = Math.floor((w - 1) / stride) + 1;
  const rows = Math.floor((h - 1) / stride) + 1;
  const out = new Float32Array(cols * rows * 3);
  let o = 0;
  for (let y = 0; y < rows * stride; y += stride) {
    for (let x = 0; x < cols * stride; x += stride) {
      const z = 1 - relief * depth.depth[y * w + x]!;
      out[o++] = ((x + 0.5 - cx) * z) / f;
      out[o++] = (-(y + 0.5 - cy) * z) / f;
      out[o++] = -z;
    }
  }
  return out;
}
