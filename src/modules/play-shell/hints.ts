import type { MoveContext } from '../beta-moves';
import type { Vec3 } from '../climber-stance';

// SPEC-play-shell › Amendment 2026-11-02 H1, H3 and E1: what the hold annotations show. Pure: the
// pulls are the referee's own `dir` for each route hold (as the context holds it), and the
// plausible-holds marks are checkMove's verdicts. How they are drawn: annotate.ts (Amendment (b)
// T1, thin and in CSS px). Nothing here computes a new number.

type Point = { x: number; y: number };

/** One route hold's pull, exactly as the referee's context has it. */
export interface HoldArrow {
  id: string;
  label: string;
  /** The contact point the referee uses: the grip point when set, else the centroid. */
  base: Point;
  /** RouteHold.dir: image frame, +x right, +y down, +z out of the wall. Null: no single pull. */
  dir: Vec3 | null;
  /** The player set this pull (E1), or it came set by the user (forceSource 'user'). */
  user: boolean;
}

/** H1 / E1: one arrow per route hold, from the referee's context (never a recomputed force). */
export function holdArrows(ctx: MoveContext): HoldArrow[] {
  return ctx.holds.map((h) => ({
    id: h.id,
    label: h.label,
    base: h.grip ? { x: h.grip.x, y: h.grip.y } : { x: h.centroid.x, y: h.centroid.y },
    dir: h.dir ? [h.dir[0], h.dir[1], h.dir[2]] : null,
    user: h.forceSource === 'user',
  }));
}

/**
 * Under this share of |dir| in the wall's plane, a pull is mostly into or out of the wall, and it
 * is drawn as a vector through the page (⊗ into, ⊙ out), not as an arrow.
 */
export const MIN_IN_PLANE = 0.35;

/** How a pull is drawn: an arrow along the wall, ⊙ out of it, ⊗ into it, or (no pull) a dot. */
export type Glyph = 'arrow' | 'out' | 'into' | 'none';

/** The glyph for a pull, by its in-plane share of |dir| (MIN_IN_PLANE) and the sign of z. */
export function glyphFor(dir: Vec3 | null): Glyph {
  if (!dir) return 'none';
  const all = Math.hypot(dir[0], dir[1], dir[2]);
  if (!all) return 'none';
  if (Math.hypot(dir[0], dir[1]) / all >= MIN_IN_PLANE) return 'arrow';
  return dir[2] > 0 ? 'out' : 'into';
}

/** The in-plane part of a pull: its length (0–1) and its angle (radians, 0 = right, +y down). */
export function inPlane(dir: Vec3): { length: number; angle: number } {
  return { length: Math.hypot(dir[0], dir[1]), angle: Math.atan2(dir[1], dir[0]) };
}

/** H3's three verdict marks: holds (static), holds as a deadpoint, falls. */
export type MarkKind = 'holds' | 'deadpoint' | 'falls';
