import { glyphFor, inPlane, type HoldArrow, type MarkKind } from './hints';

// SPEC-play-shell › Amendment 2026-11-02 (b) T1: the hold annotations are thin, fixed-size marks
// in CSS px, beside the hold and never on it (cartographic label placement), instead of pixel art
// on the climber's art grid (on a wide screen one art pixel is ~8 CSS px, so arrows were blocks
// covering the holds). Pure geometry; ArrowLayer draws it as SVG. The pulls are still exactly
// the referee's `dir` (H1); nothing here changes a referee input.

type Point = { x: number; y: number };
/** A hold's box on screen, CSS px. */
export type Box = { x: number; y: number; w: number; h: number };
type View = { scale: number; tx: number; ty: number };
type Circle = { x: number; y: number; r: number };

/** Shaft and head from the box's edge (gap included), CSS px. */
export const ARROW_LEN = 20;
/** The arrowhead: a triangle this long and this wide at its base, CSS px. */
export const HEAD_LEN = 8;
export const HEAD_W = 8;
/** The white line, and its dark outline on each side: STROKE is the whole visible width. */
export const LINE_W = 1.5;
export const OUTLINE_W = 0.75;
export const STROKE = LINE_W + 2 * OUTLINE_W;
/** The arrow starts this far outside the hold's box, so the hold stays in view. */
export const BOX_GAP = 3;
/**
 * Review 2: the box the arrow's centre line must leave is the hold's box grown by the widest ink
 * either side of that line (the head's half-width and its outline; the shaft's is narrower). A ray
 * leaving a convex box never re-enters it, so no ink of the arrow can touch the hold's box.
 */
export const BOX_CLEAR = Math.max(STROKE / 2, HEAD_W / 2 + 0.75);
/** The ⊙ / ⊗ ring's radius, beside the hold. */
export const RING_R = 5;
/** The plausible-holds marks' radius. */
export const MARK_R = 5;
/** E1 edit mode: the head sits at the 44 px head handle, this far from the grip point. */
export const EDIT_TIP = 56;
/** A badge that begins within this many px of the arrow's start is at its tail (its own). */
export const TAIL_SLACK = 6;
/** The shortest arrow drawn (head included) once it has moved past a badge. */
export const MIN_ARROW = 14;
/** A badge's white stroke, kept clear around it. */
const BADGE_STROKE = 1;
/** What ArrowLayer's mask cuts out round a badge, beyond its radius. */
export const BADGE_MASK = 1.5;

export type Annotation =
  | {
      id: string;
      kind: 'arrow';
      user: boolean;
      /** The shaft runs from `from` to `neck`; the head is the triangle tip, left, right. */
      from: Point;
      neck: Point;
      tip: Point;
      left: Point;
      right: Point;
      /** E1 edit: the grip point's dot. */
      dot?: Point;
    }
  | { id: string; kind: 'out' | 'into'; user: boolean; at: Point; dot?: Point }
  | { id: string; kind: 'none'; user: boolean; dot?: Point };

const add = (p: Point, u: Point, d: number) => ({ x: p.x + d * u.x, y: p.y + d * u.y });

/** How far along the ray from `p` (unit `u`, starting inside `b`) it leaves the box. */
function exitDistance(p: Point, u: Point, b: Box): number {
  const tx = u.x > 1e-9 ? (b.x + b.w - p.x) / u.x : u.x < -1e-9 ? (b.x - p.x) / u.x : Infinity;
  const ty = u.y > 1e-9 ? (b.y + b.h - p.y) / u.y : u.y < -1e-9 ? (b.y - p.y) / u.y : Infinity;
  return Math.max(0, Math.min(tx, ty));
}

/** Where the ray from `p` along `u` enters and leaves a circle grown by `grow`, or null. */
function crossing(p: Point, u: Point, c: Circle, grow: number) {
  const r = c.r + grow;
  const fx = p.x - c.x;
  const fy = p.y - c.y;
  const b = fx * u.x + fy * u.y;
  const disc = b * b - (fx * fx + fy * fy - r * r);
  if (disc <= 0) return null;
  return { enter: -b - Math.sqrt(disc), exit: -b + Math.sqrt(disc) };
}

/**
 * Review 5 and re-review 1, in CSS px: the span of an arrow along its ray that keeps out of the
 * step badges. It may skip one badge at its tail (its own, or a neighbour's within TAIL_SLACK),
 * ends before the next one on its path, and is at least MIN_ARROW long. A second badge at its tail
 * is a chain: past it, the arrow would sit by another hold and read as that hold's, so there is
 * no room (null; the direction map says that pull in words).
 */
function clearSpan(
  p: Point,
  u: Point,
  start: number,
  end: number,
  badges: readonly Circle[],
  /** E1 edit: the tip stays at the head handle (`end`) whenever there is room. */
  keepEnd = false,
) {
  const grow = BADGE_STROKE + STROKE / 2 + 0.5;
  const hits = badges
    .flatMap((c) => crossing(p, u, c, grow) ?? [])
    .filter((h) => h.exit > 0)
    .sort((a, b) => a.enter - b.enter);
  const len = end - start;
  let skipped = 0;
  for (const h of hits) {
    if (h.exit <= start || h.enter > start + TAIL_SLACK) continue;
    if (++skipped > 1) return null;
    start = h.exit;
  }
  end = keepEnd ? Math.max(end, start + MIN_ARROW) : Math.max(start + len, start + MIN_ARROW);
  for (const h of hits) if (h.enter > start && h.enter < end) end = h.enter;
  return end - start >= MIN_ARROW ? { start, end } : null;
}

/** The ring's spot beside the hold: right of its box, or left when a badge is there. */
function ringSpot(b: Point, box: Box, badges: readonly Circle[]): Point {
  const d = RING_R + STROKE / 2 + BOX_GAP;
  const right = { x: box.x + box.w + d, y: b.y };
  const left = { x: box.x - d, y: b.y };
  const clear = (q: Point) =>
    badges.every((c) => Math.hypot(q.x - c.x, q.y - c.y) > c.r + BADGE_STROKE + RING_R + STROKE);
  return clear(right) || !clear(left) ? right : left;
}

/**
 * Every route hold's annotation on screen (H1, E1): an arrow from just outside its box in the
 * pull direction, a ⊙ / ⊗ beside it, or nothing (no single pull). In E1 edit mode each arrow runs
 * to its 44 px head handle (EDIT_TIP from the grip) and the grip point gets a small dot. `dropped`
 * names the holds whose arrow the badges leave no room for (the map says those in words).
 */
export function annotateHolds(
  arrows: readonly HoldArrow[],
  view: View,
  opts: { boxes: (id: string) => Box; badges: readonly Circle[]; edit: boolean },
): { annotations: Annotation[]; dropped: string[] } {
  const dropped: string[] = [];
  const annotations = arrows.map((a): Annotation => {
    const b = { x: a.base.x * view.scale + view.tx, y: a.base.y * view.scale + view.ty };
    const dot = opts.edit ? b : undefined;
    const glyph = glyphFor(a.dir);
    const box = opts.boxes(a.id);
    if (glyph === 'none' || !a.dir) return { id: a.id, kind: 'none', user: a.user, dot };
    if (glyph !== 'arrow') {
      return { id: a.id, kind: glyph, user: a.user, at: ringSpot(b, box, opts.badges), dot };
    }
    const { angle } = inPlane(a.dir);
    const u = { x: Math.cos(angle), y: Math.sin(angle) };
    const grown = {
      x: box.x - BOX_CLEAR,
      y: box.y - BOX_CLEAR,
      w: box.w + 2 * BOX_CLEAR,
      h: box.h + 2 * BOX_CLEAR,
    };
    const start = exitDistance(b, u, grown);
    const span = clearSpan(
      b,
      u,
      start,
      opts.edit ? Math.max(start + ARROW_LEN, EDIT_TIP) : start + ARROW_LEN,
      opts.badges,
      opts.edit,
    );
    if (!span) {
      dropped.push(a.id);
      return { id: a.id, kind: 'none', user: a.user, dot };
    }
    const tip = add(b, u, span.end);
    const neck = add(b, u, span.end - HEAD_LEN);
    const perp = { x: -u.y, y: u.x };
    return {
      id: a.id,
      kind: 'arrow',
      user: a.user,
      from: add(b, u, span.start),
      neck,
      tip,
      left: add(neck, perp, HEAD_W / 2),
      right: add(neck, perp, -HEAD_W / 2),
      dot,
    };
  });
  return { annotations, dropped };
}

const distToSeg = (p: Point, a: Point, c: Point) => {
  const dx = c.x - a.x;
  const dy = c.y - a.y;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};

/** A mark's clearance from an arrow: its radius, outline, the arrow's half stroke and a 1 px gap. */
const MARK_CLEAR = MARK_R + 1 + STROKE / 2 + 1;

/**
 * Review 6 and private PR #15 review 4: a plausible-holds mark at `at` moves to the nearest spot that
 * touches no arrow and no step badge (so it is never half hidden by the badge mask). It stays on
 * its point when that is clear; otherwise it tries directions away from what it touches first,
 * then all around, a little further each time.
 */
export function markSpot(
  at: Point,
  annotations: readonly Annotation[],
  badges: readonly Circle[],
): Point {
  const arrows = annotations.filter((a) => a.kind === 'arrow') as Extract<
    Annotation,
    { kind: 'arrow' }
  >[];
  const touchesArrow = (q: Point) =>
    arrows.some(
      (a) =>
        distToSeg(q, a.from, a.neck) < MARK_CLEAR ||
        Math.hypot(q.x - a.tip.x, q.y - a.tip.y) < MARK_CLEAR + HEAD_W / 2,
    );
  const touchesBadge = (q: Point) =>
    badges.some((c) => Math.hypot(q.x - c.x, q.y - c.y) <= c.r + BADGE_MASK + MARK_R + 1);
  const clear = (q: Point) => !touchesArrow(q) && !touchesBadge(q);
  if (clear(at)) return at;
  // Away from the nearest badge, or square to the nearest arrow, comes first.
  const badge = badges.reduce<Circle | null>(
    (best, c) =>
      !best ||
      Math.hypot(at.x - c.x, at.y - c.y) - c.r < Math.hypot(at.x - best.x, at.y - best.y) - best.r
        ? c
        : best,
    null,
  );
  const arrow = arrows.find((a) => distToSeg(at, a.from, a.neck) < MARK_CLEAR);
  let lead = 0;
  if (badge && touchesBadge(at)) lead = Math.atan2(at.y - badge.y, at.x - badge.x);
  else if (arrow) lead = Math.atan2(arrow.tip.x - arrow.from.x, -(arrow.tip.y - arrow.from.y));
  for (let d = 2; d <= 60; d += 2) {
    for (let k = 0; k < 16; k++) {
      // lead, then alternately either side of it, all round.
      const turn = (Math.ceil(k / 2) * (k % 2 ? 1 : -1) * Math.PI) / 8;
      const q = { x: at.x + d * Math.cos(lead + turn), y: at.y + d * Math.sin(lead + turn) };
      if (clear(q)) return q;
    }
  }
  return at;
}

/** The marks' colours: green holds, yellow deadpoint, orange falls (traffic-light coding). */
export const MARK_FILL: Readonly<Record<MarkKind, string>> = {
  holds: '#7ee88f',
  deadpoint: '#ffd94a',
  falls: '#ffab57',
};

/**
 * Private PR #15 review 3, E1 edit mode: a hold's two 44 px handles, from the same annotation the layer
 * draws. The base handle is on the grip point; the head handle on the drawn arrow's tip, wherever
 * the box or the badges put it. A hold with no arrow drawn (no pull, a ⊙ / ⊗, or no room) keeps
 * its head handle EDIT_TIP from the grip, along its pull (straight down when it has none).
 */
export function handlesOf(
  a: Annotation | undefined,
  hold: HoldArrow,
  view: View,
): { base: Point; head: Point } {
  const base = { x: hold.base.x * view.scale + view.tx, y: hold.base.y * view.scale + view.ty };
  if (a?.kind === 'arrow') return { base, head: { x: a.tip.x, y: a.tip.y } };
  const t =
    hold.dir && Math.hypot(hold.dir[0], hold.dir[1]) > 1e-6 ? inPlane(hold.dir).angle : Math.PI / 2;
  return { base, head: add(base, { x: Math.cos(t), y: Math.sin(t) }, EDIT_TIP) };
}
