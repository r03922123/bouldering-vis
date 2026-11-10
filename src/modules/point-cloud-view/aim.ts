import type { OverlayItem } from './overlay';

// SPEC-point-cloud-view › Amendment: Draw a Hold's Direction in 3D. Pure aiming math.

type V3 = [number, number, number];

/** Image frame (+y down) ↔ three.js frame (+y up); x and z are shared. */
export const imageToThree = (d: V3): V3 => [d[0], -d[1], d[2]];
export const threeToImage = imageToThree;

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * The direction from `hold` to where the pointer's ray meets the plane through the hold that faces
 * the camera (normal = camera forward): what you see is what you set. Turning the camera changes
 * which directions a drag can reach (a side view aims into the wall). Null when the ray is parallel
 * to the plane or the pointer is on the hold.
 */
export function aimOnViewPlane(camera: V3, forward: V3, ray: V3, hold: V3): V3 | null {
  const denom = dot(ray, forward);
  if (Math.abs(denom) < 1e-9) return null;
  const t = dot([hold[0] - camera[0], hold[1] - camera[1], hold[2] - camera[2]], forward) / denom;
  if (t <= 0) return null;
  const d: V3 = [
    camera[0] + ray[0] * t - hold[0],
    camera[1] + ray[1] * t - hold[1],
    camera[2] + ray[2] * t - hold[2],
  ];
  const l = Math.hypot(...d);
  return l < 1e-9 ? null : [d[0] / l, d[1] / l, d[2] / l];
}

/** Below a hold without a direction, where its dashed "draw one" handle sits. */
const DRAW_OFFSET = 34;
/** Half of the 44 px touch target. */
export const HANDLE_HIT = 22;

/** Where a hold's grab handle is: the arrowhead, the hold itself for ⊗, or below it when there's no arrow. */
export function handleAt(it: OverlayItem): { x: number; y: number; kind: 'arrow' | 'draw' } {
  const a = it.arrow;
  if (!a) return { x: it.x, y: it.y + DRAW_OFFSET, kind: 'draw' };
  if (a.intoView) return { x: it.x, y: it.y, kind: 'arrow' };
  return { x: it.x + a.ux * a.length, y: it.y + a.uy * a.length, kind: 'arrow' };
}

/** The hold whose handle is nearest the point, within HANDLE_HIT. */
export function hitHandle(items: readonly OverlayItem[], x: number, y: number): string | null {
  let best: string | null = null;
  let bestD = HANDLE_HIT;
  for (const it of items) {
    const h = handleAt(it);
    const d = Math.hypot(h.x - x, h.y - y);
    if (d <= bestD) {
      best = it.holdId;
      bestD = d;
    }
  }
  return best;
}
