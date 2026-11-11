import type { MoveContext } from '../beta-moves';
import type { Vec3 } from '../climber-stance';
import {
  annotateHolds,
  ARROW_LEN,
  BOX_CLEAR,
  EDIT_TIP,
  HEAD_W,
  markSpot,
  MARK_R,
  RING_R,
  STROKE,
  type Annotation,
  type Box,
} from './annotate';
import { SYNTHETIC } from './synthetic.fixture';
import { holdArrows } from './hints';
import { badgeSpots, boxAt, contextFor } from './play';

// SPEC-play-shell › Amendment 2026-11-02 (b) T1 and acceptance 2: thin, screen-space direction
// arrows, in CSS px, starting just outside the hold's box; ≤ 3 px thick at every zoom; no cross
// shape; out of the step badges; the plausible-holds marks off the arrows.

type Point = { x: number; y: number };
const ctx = (contextFor(SYNTHETIC) as { value: MoveContext }).value;

/** The desktop (1280 wide) and phone (375 wide) scales of the route's photo (1536 px wide). */
const SCALES = { desktop: 0.546875, phone: 0.2233 };

/** Every point an annotation inks, sampled on a 0.25 CSS px grid (stroke and fills included). */
function inked(a: Annotation, step = 0.25): Point[] {
  const out: Point[] = [];
  const near = (p: Point) => {
    if (a.kind === 'arrow') {
      const { from, neck, tip, left, right } = a;
      if (distToSeg(p, from, neck) <= STROKE / 2) return true;
      return inTriangle(p, tip, left, right, STROKE / 2 - 0.75);
    }
    if (a.kind === 'out' || a.kind === 'into') {
      return Math.hypot(p.x - a.at.x, p.y - a.at.y) <= RING_R + STROKE / 2;
    }
    return false;
  };
  const bb = bounds(a);
  for (let y = bb.y0; y <= bb.y1; y += step)
    for (let x = bb.x0; x <= bb.x1; x += step) if (near({ x, y })) out.push({ x, y });
  return out;
}
function bounds(a: Annotation) {
  const pts =
    a.kind === 'arrow'
      ? [a.from, a.neck, a.tip, a.left, a.right]
      : a.kind === 'out' || a.kind === 'into'
        ? [
            { x: a.at.x - RING_R - 3, y: a.at.y - RING_R - 3 },
            { x: a.at.x + RING_R + 3, y: a.at.y + RING_R + 3 },
          ]
        : [];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return {
    x0: Math.min(...xs) - 3,
    x1: Math.max(...xs) + 3,
    y0: Math.min(...ys) - 3,
    y1: Math.max(...ys) + 3,
  };
}
function distToSeg(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function inTriangle(p: Point, a: Point, b: Point, c: Point, grow: number) {
  const s = (q: Point, r: Point) => (r.x - q.x) * (p.y - q.y) - (r.y - q.y) * (p.x - q.x);
  const area = s(a, b) === 0 ? 0 : Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  const e = [s(a, b), s(b, c), s(c, a)].map((v) => v * area);
  if (e.every((v) => v >= 0)) return true;
  return [distToSeg(p, a, b), distToSeg(p, b, c), distToSeg(p, c, a)].some((d) => d <= grow);
}
const inBox = (p: Point, b: Box) => p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h;

/** One hold, centred at (100, 100), with a box and a pull, on its own (no badges). */
function one(dir: Vec3 | null, box: Box = { x: 94, y: 95, w: 12, h: 10 }, edit = false) {
  const hold = { id: 'h', label: '1', base: { x: 100, y: 100 }, dir, user: false };
  const view = { scale: 1, tx: 0, ty: 0 };
  return annotateHolds([hold], view, { boxes: () => box, badges: [], edit }).annotations[0]!;
}

describe('thin arrows (T1, acceptance 2)', () => {
  it('start just outside the hold’s box, so no arrow pixel is inside it, in every direction', () => {
    const box = { x: 94, y: 95, w: 12, h: 10 };
    for (let k = 0; k < 16; k++) {
      const t = (k * Math.PI) / 8;
      const a = one([Math.cos(t), Math.sin(t), 0], box);
      expect(a.kind).toBe('arrow');
      for (const p of inked(a)) expect(inBox(p, box), `${k * 22.5}°`).toBe(false);
    }
  });

  it('on the route at the desktop and phone scales: outside every hold’s box (thickness: ArrowLayer.test)', () => {
    for (const [name, scale] of Object.entries(SCALES)) {
      const view = { scale, tx: 0, ty: 0 };
      const boxOf = (id: string) => {
        const h = ctx.holds.find((x) => x.id === id)!;
        const b = boxAt(ctx, h.centroid);
        return { x: b.x * scale, y: b.y * scale, w: b.w * scale, h: b.h * scale };
      };
      const { annotations } = annotateHolds(holdArrows(ctx), view, {
        boxes: boxOf,
        badges: [],
        edit: false,
      });
      for (const a of annotations) {
        if (a.kind !== 'arrow') continue;
        for (const p of inked(a)) expect(inBox(p, boxOf(a.id)), `${name} ${a.id}`).toBe(false);
      }
    }
    expect(STROKE).toBeLessThanOrEqual(3);
  });

  it('review 2: the shaft’s and head’s width stay out of a long thin box and an off-centre grip', () => {
    const thin = { x: 98, y: 80, w: 4, h: 40 };
    const t80 = (80 * Math.PI) / 180;
    const a = one([Math.cos(t80), Math.sin(t80), 0], thin);
    expect(a.kind).toBe('arrow');
    const inside = inked(a).filter((p) => inBox(p, thin));
    expect(inside.length, '4 × 40 box, 80°').toBe(0);
    // A 22 × 40 box with the grip 0.5 px from its right edge, pulled at 75°.
    const wide = { x: 78.5, y: 80, w: 22, h: 40 };
    const t75 = (75 * Math.PI) / 180;
    const hold = {
      id: 'h',
      label: '1',
      base: { x: 100, y: 100 },
      dir: [Math.cos(t75), Math.sin(t75), 0] as Vec3,
      user: false,
    };
    const b = annotateHolds(
      [hold],
      { scale: 1, tx: 0, ty: 0 },
      { boxes: () => wide, badges: [], edit: false },
    ).annotations[0]!;
    expect(
      inked(b).filter((p) => inBox(p, wide)).length,
      '22 × 40 box, grip at the edge, 75°',
    ).toBe(0);
  });

  it('are about 20 px long with an 8 px head, at any zoom (screen size, not the art grid)', () => {
    const a = one([0, 1, 0]) as Extract<Annotation, { kind: 'arrow' }>;
    expect(Math.hypot(a.tip.x - a.from.x, a.tip.y - a.from.y)).toBeCloseTo(ARROW_LEN, 5);
    expect(Math.hypot(a.left.x - a.right.x, a.left.y - a.right.y)).toBeCloseTo(HEAD_W, 5);
    // From the box's bottom edge (y 105) plus the widest ink's half-width (review 2).
    expect(a.from.y).toBeCloseTo(105 + BOX_CLEAR, 5);
  });

  it('no crossbar: nothing behind the tail, and a triangular head (the stroke: ArrowLayer.test)', () => {
    for (let k = 0; k < 16; k++) {
      const t = (k * Math.PI) / 8;
      const a = one([Math.cos(t), Math.sin(t), 0]) as Extract<Annotation, { kind: 'arrow' }>;
      const u = { x: Math.cos(t), y: Math.sin(t) };
      for (const p of inked(a)) {
        const along = (p.x - a.from.x) * u.x + (p.y - a.from.y) * u.y;
        expect(along, `${k * 22.5}°: behind the tail`).toBeGreaterThanOrEqual(-STROKE / 2 - 0.01);
      }
      // The head is a triangle: widest at its base, narrowing to the tip.
      const across = (d: number) => {
        const c = { x: a.tip.x - d * u.x, y: a.tip.y - d * u.y };
        let n = 0;
        for (let o = -8; o <= 8; o += 0.25) {
          const q = { x: c.x - o * u.y, y: c.y + o * u.x };
          if (inTriangle(q, a.tip, a.left, a.right, 0)) n++;
        }
        return n / 4;
      };
      expect(across(7.5)).toBeGreaterThan(across(4));
      expect(across(4)).toBeGreaterThan(across(1));
    }
  });

  it('a pull mostly into or out of the wall is a ⊗ or ⊙ beside the hold, not on it; no pull is nothing', () => {
    const box = { x: 94, y: 95, w: 12, h: 10 };
    const into = one([0, 0.1, -0.99], box);
    const out = one([0, 0.1, 0.99], box);
    expect(into.kind).toBe('into');
    expect(out.kind).toBe('out');
    for (const a of [into, out]) for (const p of inked(a)) expect(inBox(p, box)).toBe(false);
    expect(one(null, box).kind).toBe('none');
  });

  it('edit mode: the arrow runs from the box to the 44 px head handle, and the grip dot shows', () => {
    const a = one([0, 1, 0], undefined, true) as Extract<Annotation, { kind: 'arrow' }>;
    expect(a.tip.y).toBeCloseTo(100 + 56, 5);
    expect(a.dot).toEqual({ x: 100, y: 100 });
    expect(one(null, undefined, true)).toMatchObject({ kind: 'none', dot: { x: 100, y: 100 } });
  });
});

describe('badges and marks (review 5, 6, re-review 1, ported to CSS px)', () => {
  const view = { scale: SCALES.phone, tx: 0, ty: 0 };
  const boxOf = (id: string) => {
    const h = ctx.holds.find((x) => x.id === id)!;
    const b = boxAt(ctx, h.centroid);
    return { x: b.x * view.scale, y: b.y * view.scale, w: b.w * view.scale, h: b.h * view.scale };
  };
  const badges = badgeSpots(ctx, view, (h) => boxAt(ctx, h.centroid));

  it('no arrow ink inside a step badge (with its stroke), on the route at the phone scale', () => {
    const { annotations } = annotateHolds(holdArrows(ctx), view, {
      boxes: boxOf,
      badges,
      edit: false,
    });
    for (const a of annotations)
      for (const p of inked(a))
        for (const b of badges)
          expect(Math.hypot(p.x - b.x, p.y - b.y), a.id).toBeGreaterThan(b.r + 1);
  });

  it('names the arrows the badges leave no room for (re-review 1), and draws them as nothing', () => {
    const all = annotateHolds(holdArrows(ctx), view, { boxes: boxOf, badges, edit: false });
    // On the synthetic route at the phone scale: 7F's down arrow runs into hold 6's badge.
    expect(all.dropped).toEqual(['synthetic-7']);
    for (const id of all.dropped) {
      const a = all.annotations.find((x) => x.id === id)!;
      expect(a.kind, id).toBe('none');
    }
    // With no badges, nothing is dropped.
    expect(
      annotateHolds(holdArrows(ctx), view, { boxes: boxOf, badges: [], edit: false }).dropped,
    ).toEqual([]);
  });

  // Invented holds: on the synthetic route 7F's down arrow runs into hold 6's badge at the phone
  // scale, so the own-badge skip is shown here, on a finish at the top whose badge goes below it,
  // next to a hold whose own badge is followed by a neighbour's (a chain).
  describe('a down pull past badges below the hold', () => {
    const box = (x: number): Box => ({ x: x - 10, y: 10, w: 20, h: 20 });
    const holds = [
      { id: 'top', label: '7F', base: { x: 100, y: 20 }, dir: [0, 1, 0] as Vec3, user: true },
      { id: 'chain', label: '5', base: { x: 300, y: 20 }, dir: [0, 1, 0] as Vec3, user: true },
    ];
    const badges = [
      { id: 'top', label: '7F', x: 100, y: 45, r: 12 },
      { id: 'chain', label: '5', x: 300, y: 45, r: 12 },
      { id: 'next', label: '6', x: 300, y: 70, r: 12 },
    ];
    const at = (edit: boolean) =>
      annotateHolds(
        holds,
        { scale: 1, tx: 0, ty: 0 },
        {
          boxes: (id) => box(id === 'top' ? 100 : 300),
          badges,
          edit,
        },
      );

    it('skips its own badge and shows; one down a chain of badges is dropped', () => {
      const { annotations, dropped } = at(false);
      const f = annotations.find((a) => a.id === 'top')!;
      expect(f.kind).toBe('arrow');
      if (f.kind === 'arrow') expect(f.from.y).toBeGreaterThan(badges[0]!.y + badges[0]!.r);
      expect(dropped).toEqual(['chain']);
    });

    it('edit mode: past its own badge, the arrow still ends at its head handle', () => {
      const f = at(true).annotations.find((a) => a.id === 'top')!;
      expect(f.kind).toBe('arrow');
      if (f.kind === 'arrow') {
        expect(f.from.y).toBeGreaterThan(badges[0]!.y + badges[0]!.r);
        expect(f.tip.y).toBeCloseTo(20 + EDIT_TIP, 5);
      }
    });
  });

  it('review 4: a mark that would touch a badge moves off it whole, never half hidden (both scales)', () => {
    for (const [name, scale] of Object.entries(SCALES)) {
      const v = { scale, tx: 0, ty: 0 };
      const bx = (id: string) => {
        const h = ctx.holds.find((x) => x.id === id)!;
        const b = boxAt(ctx, h.centroid);
        return { x: b.x * scale, y: b.y * scale, w: b.w * scale, h: b.h * scale };
      };
      const bs = badgeSpots(ctx, v, (h) => boxAt(ctx, h.centroid));
      const { annotations } = annotateHolds(holdArrows(ctx), v, {
        boxes: bx,
        badges: bs,
        edit: false,
      });
      for (const h of ctx.holds) {
        const m = markSpot({ x: h.centroid.x * scale, y: h.centroid.y * scale }, annotations, bs);
        for (const b of bs) {
          // Clear of the badge's masked circle (r + 1.5): the whole mark and its outline show.
          expect(
            Math.hypot(m.x - b.x, m.y - b.y),
            `${name}: ${h.label}'s mark by badge ${b.label}`,
          ).toBeGreaterThan(b.r + 1.5 + MARK_R + 1);
        }
      }
    }
  });

  it('a plausible-holds mark on a hold with an arrow sits off it, never touching (review 6)', () => {
    for (let k = 0; k < 8; k++) {
      const t = (k * Math.PI) / 4;
      const a = one([Math.cos(t), Math.sin(t), 0], { x: 98, y: 98, w: 4, h: 4 }) as Extract<
        Annotation,
        { kind: 'arrow' }
      >;
      const m = markSpot({ x: 100, y: 100 }, [a], []);
      const gap = distToSeg(m, a.from, a.neck) - MARK_R - 1 - STROKE / 2;
      expect(gap, `${k * 45}°`).toBeGreaterThanOrEqual(1);
      expect(Math.hypot(m.x - a.tip.x, m.y - a.tip.y)).toBeGreaterThan(MARK_R + HEAD_W / 2);
    }
    // A mark on a point with no arrow stays on it.
    expect(markSpot({ x: 10, y: 10 }, [], [])).toEqual({ x: 10, y: 10 });
  });
});
