import { DEFAULT_HFOV_DEG, SELECTED_SIZE } from './build';

const DEG = Math.PI / 180;

/** three.js cameras take a vertical FOV; ours is defined horizontally (60°). */
export function verticalFovDeg(w: number, h: number, hfovDeg = DEFAULT_HFOV_DEG): number {
  return (2 * Math.atan(Math.tan((hfovDeg / 2) * DEG) * (h / w))) / DEG;
}

export function pointBudget(coarsePointer: boolean): number {
  return coarsePointer ? 120_000 : 300_000;
}

/** World-space point size: grid spacing at z = 1, with 50% overlap so the surface looks closed. */
export function pointSize(stride: number, f: number): number {
  return (stride / f) * 1.5;
}

/**
 * Orbit target: on the optical axis at the mean depth of the selected (enlarged) points, else
 * z = −1. Keeping it on the axis means the camera at the origin still looks straight ahead, so
 * the first frame matches the photo; orbiting then pivots at the route's distance.
 */
export function routeTarget(
  positions: Float32Array,
  sizes: Float32Array,
): [number, number, number] {
  let n = 0;
  let z = 0;
  sizes.forEach((s, i) => {
    if (s < SELECTED_SIZE - 1e-3) return;
    n++;
    z += positions[i * 3 + 2]!;
  });
  return [0, 0, n ? z / n : -1];
}

/**
 * Camera for a canvas box of any shape: aspect = the box's (so pixels stay square) and a vertical
 * FOV that "contains" the photo: its height fits in wider boxes, its 60° width in narrower ones.
 */
export function fitCamera(
  imgW: number,
  imgH: number,
  boxW: number,
  boxH: number,
): { aspect: number; vfovDeg: number } {
  const aspect = boxW / boxH;
  if (aspect >= imgW / imgH) return { aspect, vfovDeg: verticalFovDeg(imgW, imgH) };
  return {
    aspect,
    vfovDeg: (2 * Math.atan(Math.tan((DEFAULT_HFOV_DEG / 2) * DEG) / aspect)) / DEG,
  };
}
