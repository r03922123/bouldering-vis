import type { DepthMap } from '../depth-estimation';
import type { Force, HoldGeometry } from '../hold-geometry';
import { badgeLabels, type HoldMask } from '../hold-segmentation';
import { intrinsics, unproject } from './build';

/** Force arrows are a bit longer so they read as the hand's push. */
export const FORCE_LENGTH = 0.16;

export interface Annotation {
  holdId: string;
  origin: [number, number, number];
  /** Numbered badge label (1S, 2, 3F…). */
  label?: string;
  /** Recommended force: an arrow from `tail` along `dir` that ends at the hold. */
  force?: { tail: [number, number, number]; dir: [number, number, number]; length: number };
}

/** 3D force arrows and numbered badges for the selected holds. */
export function annotations(
  holds: readonly HoldMask[],
  geometry: ReadonlyMap<string, HoldGeometry>,
  depth: DepthMap,
  relief: number,
  /** The force per hold id, computed once by the app (hold-geometry's forceDirection). */
  forces: ReadonlyMap<string, Force> = new Map(),
): Annotation[] {
  const k = intrinsics(depth.width, depth.height);
  const labels = badgeLabels(holds);
  const out: Annotation[] = [];
  for (const h of holds) {
    const g = geometry.get(h.id);
    if (!g) continue;
    const x = Math.min(depth.width - 1, Math.max(0, Math.round(h.centroid.x)));
    const y = Math.min(depth.height - 1, Math.max(0, Math.round(h.centroid.y)));
    const origin = unproject(
      h.centroid.x,
      h.centroid.y,
      depth.depth[y * depth.width + x]!,
      k,
      relief,
    );
    const f = forces.get(h.id)?.dir ?? null;
    // Image frame (+y down) → three.js frame (+y up).
    const fd: [number, number, number] | null = f ? [f[0], -f[1], f[2]] : null;
    out.push({
      holdId: h.id,
      origin,
      force: fd
        ? {
            tail: [
              origin[0] - fd[0] * FORCE_LENGTH,
              origin[1] - fd[1] * FORCE_LENGTH,
              origin[2] - fd[2] * FORCE_LENGTH,
            ],
            dir: fd,
            length: FORCE_LENGTH,
          }
        : undefined,
      label: labels.get(h.id),
    });
  }
  return out;
}
