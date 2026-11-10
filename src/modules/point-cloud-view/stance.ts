import { SMEAR, type StanceContacts } from '../climber-stance';
import type { DepthMap } from '../depth-estimation';
import { intrinsics, unproject } from './build';

// SPEC-climber-stance › T54: the climber in the point cloud. The body hangs in front of a flat wall
// plane at the holds' mean depth, so depth noise under the body doesn't bend the figure.

type Vec3 = [number, number, number];

const depthAt = (depth: DepthMap, x: number, y: number) => {
  const xi = Math.min(depth.width - 1, Math.max(0, Math.round(x)));
  const yi = Math.min(depth.height - 1, Math.max(0, Math.round(y)));
  return depth.depth[yi * depth.width + xi]!;
};

/**
 * Wall frame (image pixels; +z out of the wall, in pixels) → three.js world. A point z pixels out
 * of the wall moves toward the camera by z pixels at the wall plane's scale.
 */
export function wallToWorld(
  depth: DepthMap,
  relief: number,
  contacts: StanceContacts,
): (p: Vec3) => Vec3 {
  const k = intrinsics(depth.width, depth.height);
  // Holds only: a smearing foot sits low in the photo, often on the mats.
  const ds = Object.values(contacts).flatMap((c) =>
    c && c.holdId !== SMEAR ? [depthAt(depth, c.point[0], c.point[1])] : [],
  );
  const d = ds.length
    ? ds.reduce((s, v) => s + v, 0) / ds.length
    : depthAt(depth, depth.width / 2, depth.height / 2);
  const zWall = 1 - relief * d;
  return (p) => {
    const w = unproject(p[0], p[1], d, k, relief);
    return [w[0], w[1], w[2] + (p[2] * zWall) / k.f];
  };
}
