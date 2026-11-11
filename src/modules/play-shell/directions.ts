import { POINT_QUANTUM, type RouteHold } from '../beta-moves';
import type { Vec3 } from '../climber-stance';
import { glyphFor, MIN_IN_PLANE } from './hints';
import type { PlayWall } from './play';

// SPEC-play-shell › Amendment 2026-11-02 E1: the direction map's edits. Rotation is the Studio's
// approved user override, a custom pull `{ custom: Vec3 }` (hold-geometry's PullOverride shape),
// with forceSource 'user'. Translation is RouteHold.grip, the contact point (beta-moves' grip
// amendment). Both live only in Play's in-memory copy of the holds: a baked level file never
// changes, and nothing here touches the Studio's store.

type Point = { x: number; y: number };

/** One hold's edits: a custom pull and/or a grip point. */
export interface HoldEdit {
  readonly custom?: Vec3;
  readonly grip?: Point;
}
export type Edits = Readonly<Record<string, HoldEdit>>;

/** The edited holds: a custom pull becomes the hold's dir with forceSource 'user'. */
export function applyEdits(wall: PlayWall, edits: Edits): PlayWall {
  if (!Object.keys(edits).length) return wall;
  const holds = wall.holds.map((h): RouteHold => {
    const e = edits[h.id];
    if (!e) return h;
    return {
      ...h,
      ...(e.custom ? { dir: e.custom, forceSource: 'user' as const } : {}),
      ...(e.grip ? { grip: e.grip } : {}),
    };
  });
  return { ...wall, holds };
}

/**
 * SPEC-play-shell › Amendment 2026-11-03 R0-3 (b): the Down preset, straight down the photo, as
 * the Studio's hold inspector has it (hold-geometry's PRESET_DIR.down). The setter's fix for a
 * sloper whose top faces up (the earlier sample route's 1S).
 */
export const DOWN_PULL: Vec3 = [0, 1, 0];

/** A pull within this many degrees of a preset is that preset (the Studio's SNAP_DEG). */
export const DOWN_SNAP_DEG = 12;

/** The pull is straight down already, within the editor's snap: Down wouldn't change it. */
export function isStraightDown(dir: Vec3 | null): boolean {
  if (!dir) return false;
  const n = Math.hypot(...dir);
  return n > 0 && dir[1] / n >= Math.cos((DOWN_SNAP_DEG * Math.PI) / 180);
}

/**
 * A pull in words for advice, no degree numbers (the hold-geometry rule): "pulls mostly into the
 * wall", "pulls mostly out from the wall", else its in-plane way, "pulls down-left".
 */
export function pullPhrase(dir: Vec3 | null): string {
  if (!dir) return 'has no single pull';
  const n = Math.hypot(...dir) || 1;
  if (dir[2] / n < -0.5) return 'pulls mostly into the wall';
  if (dir[2] / n > 0.5) return 'pulls mostly out from the wall';
  const b = bearingOf(dir);
  return b === null ? 'pulls into the wall' : `pulls ${WORDS[Math.round(b / 45) % 8]}`;
}

/** The Down preset as an edit: a custom pull, so the referee gets it with forceSource 'user'. */
export const downPreset = (): HoldEdit => ({ custom: [...DOWN_PULL] });

/** Edits without a hold's rotation or grip (Reset), dropping holds left with no edit. */
export function withoutEdit(edits: Edits, id: string, part: keyof HoldEdit | 'all'): Edits {
  const cur = edits[id];
  if (!cur) return edits;
  const next: { custom?: Vec3; grip?: Point } = part === 'all' ? {} : { ...cur };
  if (part !== 'all') delete next[part];
  const out = { ...edits };
  if (next.custom || next.grip) out[id] = next;
  else delete out[id];
  return out;
}

const DECIMALS = 4;
const round = (v: number) => Math.round(v * 10 ** DECIMALS) / 10 ** DECIMALS + 0;

/**
 * The pull turned to an in-plane `angle` (radians in the image frame: 0 right, π/2 down), keeping
 * its out-of-wall part (z) as it is. No pull yet: a pull along the wall. Builder's call: a pull
 * mostly into (or out of) the wall, drawn as ⊗ or ⊙ (in-plane share under MIN_IN_PLANE), has no
 * in-plane angle to turn, so turning it first gives it the smallest in-plane share that is drawn
 * as an arrow, keeping z's sign. The result is unit length.
 */
export function rotateTo(dir: Vec3 | null, angle: number): Vec3 {
  if (!dir) return [round(Math.cos(angle)), round(Math.sin(angle)), 0];
  const all = Math.hypot(...dir) || 1;
  const z = dir[2] / all;
  let r = Math.hypot(dir[0], dir[1]) / all;
  let zz = z;
  if (glyphFor(dir) !== 'arrow') {
    r = LIFTED_SHARE;
    zz = (z < 0 ? -1 : 1) * Math.sqrt(1 - r * r);
  }
  const v: Vec3 = [r * Math.cos(angle), r * Math.sin(angle), zz];
  const n = Math.hypot(...v) || 1;
  return [round(v[0] / n), round(v[1] / n), round(v[2] / n)];
}

/** The in-plane share a turned ⊗ / ⊙ pull gets: just over the arrow threshold, after rounding. */
export const LIFTED_SHARE = MIN_IN_PLANE + 0.01;

/** Compass bearing in whole degrees (0 up, 90 right, 180 down) of a pull's in-plane part. */
export function bearingOf(dir: Vec3 | null): number | null {
  if (!dir || Math.hypot(dir[0], dir[1]) < 1e-6) return null;
  const deg = (Math.atan2(dir[0], -dir[1]) * 180) / Math.PI;
  return Math.round((deg + 360) % 360) % 360;
}

/** The image-frame angle (radians) for a compass bearing. */
export const angleOfBearing = (bearing: number) => ((bearing - 90) * Math.PI) / 180;

const WORDS = ['up', 'up-right', 'right', 'down-right', 'down', 'down-left', 'left', 'up-left'];

/** A pull in words for the hold list and the slider: "Pulls down-left (225°), into the wall". */
export function pullWords(dir: Vec3 | null): string {
  if (!dir) return 'No single pull';
  const b = bearingOf(dir);
  const out =
    dir[2] < -0.5 ? ', mostly into the wall' : dir[2] > 0.5 ? ', mostly out from the wall' : '';
  if (b === null || glyphFor(dir) !== 'arrow') {
    return dir[2] > 0 ? 'Pulls out from the wall' : 'Pushes into the wall';
  }
  return `Pulls ${WORDS[Math.round(b / 45) % 8]} (${b}°)${out}`;
}

/** A hold's shape for clamping its grip: its box, and its mask when there is one. */
export interface HoldShape {
  bbox: { x: number; y: number; w: number; h: number };
  /** 0/1 per working-image px, row-major, `width` wide. */
  mask?: Uint8Array;
  width?: number;
}

/**
 * E1 translate: the grip point kept on the hold. Inside the box it stays where it was put (to
 * POINT_QUANTUM, the referee's own rounding), so a point that doesn't move can't become a new
 * one (review finding 3). Past the box's edge it stops on the box's last pixel; with a mask, a
 * point off the mask goes onto the nearest mask pixel.
 */
export function clampGrip(p: Point, shape: HoldShape): Point {
  const { x, y, w, h } = shape.bbox;
  const per = Math.round(1 / POINT_QUANTUM);
  const q = (v: number) => Math.round(v * per) / per + 0;
  const cx = q(Math.min(Math.max(p.x, Math.ceil(x)), Math.floor(x + w - 1e-9)));
  const cy = q(Math.min(Math.max(p.y, Math.ceil(y)), Math.floor(y + h - 1e-9)));
  const { mask, width } = shape;
  if (!mask || !width || mask[Math.round(cy) * width + Math.round(cx)]) return { x: cx, y: cy };
  let best: Point | null = null;
  let bestD = Infinity;
  for (let yy = Math.floor(y); yy < Math.ceil(y + h); yy++) {
    for (let xx = Math.floor(x); xx < Math.ceil(x + w); xx++) {
      if (!mask[yy * width + xx]) continue;
      const d = (xx - p.x) ** 2 + (yy - p.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { x: xx, y: yy };
      }
    }
  }
  return best ?? { x: cx, y: cy };
}

/** Two sets of edits are the same input to the referee. */
export const sameEdits = (a: Edits, b: Edits) => JSON.stringify(a) === JSON.stringify(b);

/**
 * One hold's edit merged in. A grip within POINT_QUANTUM of the centroid is the default contact
 * point, so it is dropped rather than stored as a new one (review finding 3).
 */
export function withEdit(edits: Edits, id: string, e: HoldEdit, centroid: Point): Edits {
  const next = { ...edits, [id]: { ...edits[id], ...e } };
  const g = next[id]!.grip;
  if (
    g &&
    Math.abs(g.x - centroid.x) < POINT_QUANTUM &&
    Math.abs(g.y - centroid.y) < POINT_QUANTUM
  ) {
    return withoutEdit(next, id, 'grip');
  }
  return next;
}
