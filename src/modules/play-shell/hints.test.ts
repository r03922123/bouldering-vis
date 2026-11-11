import type { MoveContext } from '../beta-moves';
import { SYNTHETIC } from './synthetic.fixture';
import { glyphFor, holdArrows, inPlane, MIN_IN_PLANE } from './hints';
import { BADGE_GAP, badgeSpots, boxAt, contextFor } from './play';

// SPEC-play-shell › Amendment 2026-11-02 H1 and acceptance 3: the hold-direction arrows are the
// referee's own RouteHold.dir, as its context holds it. How they are drawn (thin, in CSS px,
// Amendment (b) T1) is tested in annotate.test.ts and ArrowLayer.test.tsx.

const ctx = (contextFor(SYNTHETIC) as { value: MoveContext }).value;
const hold7F = () => ctx.holds.find((h) => h.label === '7F')!;

describe('holdArrows (acceptance 3)', () => {
  it('gives one arrow per route hold with exactly the dir the referee was given', () => {
    const arrows = holdArrows(ctx);
    expect(arrows.map((a) => a.id)).toEqual(ctx.holds.map((h) => h.id));
    arrows.forEach((a, i) => {
      const h = ctx.holds[i]!;
      expect(a.dir).toEqual(h.dir === null ? null : [...h.dir]);
      expect(a.base).toEqual({ x: h.centroid.x, y: h.centroid.y });
      expect(a.label).toBe(h.label);
    });
    // The synthetic route: 1S and 7F pull down (set by the user), the pinches have no single pull.
    const by = (label: string) => arrows.find((a) => a.label === label)!;
    expect(by('1S')).toMatchObject({ dir: [0, 1, 0], user: true });
    expect(by('2')).toMatchObject({ dir: null, user: false });
    expect(by('5').dir).toEqual(SYNTHETIC.holds.find((h) => h.label === '5')!.dir);
  });

  it('starts at the grip point when the hold has one (E1 translate), else the centroid', () => {
    const h = ctx.holds[0]!;
    const withGrip = { ...ctx, holds: [{ ...h, grip: { x: h.centroid.x + 4, y: h.centroid.y } }] };
    expect(holdArrows(withGrip)[0]!.base).toEqual({ x: h.centroid.x + 4, y: h.centroid.y });
  });
});

describe('the pull glyph', () => {
  it('inPlane is the length and angle of (x, y)', () => {
    expect(inPlane([3 / 5, 4 / 5, 0]).length).toBeCloseTo(1);
    expect(inPlane([0, -1, 0]).angle).toBeCloseTo(-Math.PI / 2);
  });

  it('the glyph follows the threshold: an arrow at MIN_IN_PLANE of |dir| and above, a ring below', () => {
    const at = (share: number, zSign: 1 | -1) =>
      [share, 0, zSign * Math.sqrt(1 - share * share)] as [number, number, number];
    expect(MIN_IN_PLANE).toBe(0.35);
    expect(glyphFor(at(0.34, -1))).toBe('into');
    expect(glyphFor(at(0.34, 1))).toBe('out');
    expect(glyphFor(at(0.36, -1))).toBe('arrow');
    expect(glyphFor(at(0.36, 1))).toBe('arrow');
    expect(glyphFor([0, 0, -1])).toBe('into');
    expect(glyphFor([0, 1, 0])).toBe('arrow');
    expect(glyphFor(null)).toBe('none');
    // Relative to |dir|, so a vector that isn't unit length gets the same glyph.
    expect(glyphFor([0.34 * 2, 0, -Math.sqrt(1 - 0.34 ** 2) * 2])).toBe('into');
  });
});

describe('badgeSpots (review 5: the circles the hint layer keeps out of)', () => {
  it('places each badge above its box, or below it near the top, as the Studio does', () => {
    // Panned up 12 px, so 7F sits at the view's top edge.
    const view = { scale: 0.25, tx: 10, ty: -12 };
    const spots = badgeSpots(ctx, view, (h) => boxAt(ctx, h.centroid));
    expect(spots.map((b) => b.label)).toEqual(ctx.holds.map((h) => h.label));
    for (const b of spots) {
      const h = ctx.holds.find((x) => x.id === b.id)!;
      const box = boxAt(ctx, h.centroid);
      expect(b.r).toBe(h.label.length > 2 ? 15 : 12);
      expect(b.x).toBeCloseTo(h.centroid.x * 0.25 + 10);
      const above = box.y * 0.25 - 12 - b.r - BADGE_GAP;
      expect(b.y).toBeCloseTo(above >= b.r ? above : (box.y + box.h) * 0.25 - 12 + b.r + BADGE_GAP);
    }
    // 7F, at the top of the view: its badge goes below the hold, where a down pull points; the
    // others stay above theirs.
    const top = spots.find((b) => b.label === '7F')!;
    expect(top.y).toBeGreaterThan(hold7F().centroid.y * 0.25 - 12);
    for (const b of spots.filter((x) => x.label !== '7F')) {
      const h = ctx.holds.find((x) => x.id === b.id)!;
      expect(b.y, b.label).toBeLessThan(h.centroid.y * 0.25 - 12);
    }
  });
});
