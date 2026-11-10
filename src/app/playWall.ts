import type { BetaStep, RouteHold, WallFoot } from '../modules/beta-moves';
import type { Vec3, WallAngle } from '../modules/climber-stance';
import type { Force } from '../modules/hold-geometry';
import { badgeLabels, type HoldMask } from '../modules/hold-segmentation';
import { type WorkingImage } from '../modules/image-input';
import type { PlayWall } from '../modules/play-shell';
import { MY_WALL, type Route } from './route';

// SPEC-play-shell S4 and S9: what the Play screen's referee context is built from, either a baked
// level (static data, shipped with the user's yes) or the route tagged on the photo.

/**
 * Sample walls with a baked level (S9). Wall 2 ships its own (SPEC-launch-wall-2): the setter's
 * route and start, on the owner's photo.
 */
export const LEVELS: Readonly<Record<string, string>> = {
  'wall-b': '/levels/wall-b.json',
};

export { MY_WALL } from './route';

/**
 * Where "Play this wall" goes from the Setting Room: a sample's own bay when it has no baked
 * level, or when it has one and you tagged no route of your own on it (then Play opens the
 * level). Any other photo, or your route on a sample, is "My wall".
 */
export function playRouteFor(image: Pick<WorkingImage, 'sampleId'>, holds: number): Route {
  const sample = image.sampleId;
  const id = sample && (!LEVELS[sample] || holds === 0) ? sample : MY_WALL;
  return { name: 'wall', id };
}

/** The level file's wall: its route holds exactly as recorded, so the referee sees the same input. */
export function wallFromLevel(json: unknown): PlayWall {
  const l = json as Partial<{
    holds: RouteHold[];
    wallFeet: WallFoot[];
    height: number;
    wallAngleDeg: WallAngle;
    photo: { width: number; height: number };
    start: BetaStep;
  }>;
  if (!Array.isArray(l.holds) || !Array.isArray(l.wallFeet) || !l.photo || !l.height) {
    throw new Error('Not a level file');
  }
  return {
    holds: l.holds,
    wallFeet: l.wallFeet,
    height: l.height,
    wallAngleDeg: l.wallAngleDeg ?? 0,
    photo: l.photo,
    ...(l.start ? { start: l.start } : {}),
  };
}

export async function loadLevel(url: string): Promise<PlayWall> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Level ${url}: HTTP ${res.status}`);
  return wallFromLevel(await res.json());
}

/**
 * The tagged route as beta-moves RouteHolds, the way the Studio feeds the solver (S3): the badge
 * label, the effective type, the force with the user's pull and its source, and the wall normal.
 */
export function routeHoldsFrom(
  holds: readonly HoldMask[],
  types: ReadonlyMap<string, string | null>,
  forces: ReadonlyMap<string, Force>,
  wallNormals: ReadonlyMap<string, Vec3>,
): RouteHold[] {
  const labels = badgeLabels(holds);
  return [...holds]
    .sort((a, b) => a.order - b.order)
    .map((h) => {
      const f = forces.get(h.id);
      return {
        id: h.id,
        order: h.order,
        label: labels.get(h.id)!,
        role: h.role,
        centroid: { x: h.centroid.x, y: h.centroid.y },
        type: types.get(h.id) ?? null,
        dir: f?.dir ?? null,
        wallNormal: wallNormals.get(h.id) ?? null,
        ...(f ? { forceSource: f.source } : {}),
      };
    });
}
