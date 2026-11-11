import type { HoldMask, HoldRole } from '../hold-segmentation';
import { claimedBlobs, footCandidates, type FootCandidates } from './anyFeet';
import { autoAssign, contactsFor, EMPTY_ASSIGNMENT, SMEAR, type AutoAssignOptions } from './assign';
import { DEFAULT_PRIOR, solveStance } from './stance';
import { unit, type Vec3 } from './vec';
import { wallFootholds, type WallFootholds } from './wallFootholds';

// SPEC-climber-stance › Amendment 2026-10-31 (b), AC 20–26b and 33 (rules 4–9). H = 1000 px;
// hands are jugs at (900, 300) and (1100, 300), so the lower hand is at y 300 and x_m = 1000.

const H = 1000;
const W = 2000;
const IH = 1600;
const DOWN: Vec3 = [0, 1, 0];

const blank = () => new Uint8Array(W * IH);

function rect(mask: Uint8Array, x: number, y: number, w: number, h: number, value = 1) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) mask[yy * W + xx] = value;
  return mask;
}

function ellipse(mask: Uint8Array, x: number, y: number, w: number, h: number) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const u = (xx + 0.5 - x - w / 2) / (w / 2);
      const v = (yy + 0.5 - y - h / 2) / (h / 2);
      if (u * u + v * v <= 1) mask[yy * W + xx] = 1;
    }
  }
  return mask;
}

/** The toe column of a full rectangle w wide: the lower median of its central 60 % (rule 3). */
const toeDx = (w: number) => {
  const lo = Math.floor(0.2 * w);
  const hi = Math.ceil(0.8 * w) - 1;
  return lo + Math.floor((hi - lo) / 2);
};

/** A w × h rectangle whose contact point (toe + 0.005 H) is exactly (x, y). */
const blobAt = (mask: Uint8Array, x: number, y: number, w = 40, h = 20) =>
  rect(mask, x - toeDx(w), y - 5, w, h);

const hold = (
  id: string,
  x: number,
  y: number,
  role: HoldRole = 'route',
  mask?: Uint8Array,
  bbox = { x: x - 30, y: y - 15, w: 60, h: 30 },
): HoldMask => ({ id, role, order: 0, centroid: { x, y }, bbox, mask }) as HoldMask;

const HANDS = [hold('lh', 900, 300, 'start'), hold('rh', 1100, 300, 'start')];

const foot = (mask: Uint8Array) => wallFootholds(mask, W, IH, 'img');

const assign = (mask: Uint8Array, extra: HoldMask[] = [], opts: AutoAssignOptions = {}) => {
  const footholds = foot(mask);
  return {
    footholds,
    a: autoAssign([...HANDS, ...extra], H, { wallAngleDeg: 0, footholds, ...opts }),
  };
};

/** The id of the blob whose bounding box contains (x, y). */
const blobId = (f: WallFootholds, x: number, y: number) =>
  f.blobs.find(
    (b) => x >= b.bbox.x && x < b.bbox.x + b.bbox.w && y >= b.bbox.y && y < b.bbox.y + b.bbox.h,
  )?.id;

const smears = { lf: SMEAR, rf: SMEAR };

describe('autoAssign with wall footholds', () => {
  // AC 20
  it('stands each foot on a wall foothold instead of smearing', () => {
    const { footholds, a } = assign(blobAt(blobAt(blank(), 790, 885), 1210, 885));
    expect(a).toEqual({
      lh: 'lh',
      rh: 'rh',
      lf: blobId(footholds, 790, 885),
      rf: blobId(footholds, 1210, 885),
    });
    expect(a.lf).toMatch(/^blob:/);
  });

  // AC 21
  it.each([
    ['too high: drop 0.20 H', 790, 500],
    ['too low: drop 1.20 H', 790, 1500],
    ['too wide: Δx 0.70 H at drop 0.50 H', 300, 800],
    ['too wide for a deep foot: Δx 0.40 H at drop 0.90 H', 600, 1200],
  ])('rejects a blob that is %s', (_, x, y) => {
    expect(assign(blobAt(blank(), x, y)).a).toMatchObject(smears);
  });

  // Rule 4: the same gates apply to a picked route hold, at its centroid, with no footholds.
  it.each([
    ['too high: drop 0.20 H', 790, 500],
    ['too low: drop 1.20 H', 790, 1500],
    ['too wide: Δx 0.70 H at drop 0.50 H', 300, 800],
    ['too wide for a deep foot: Δx 0.40 H at drop 0.90 H', 600, 1200],
  ])('rejects a lone picked route hold that is %s', (_, x, y) => {
    const a = autoAssign([...HANDS, hold('r', x, y)], H, { wallAngleDeg: 0 });
    expect(a).toMatchObject(smears);
  });

  it('rejects a blob smaller than 0.012 H (an 8 × 8 speck)', () => {
    expect(assign(blobAt(blank(), 790, 885, 8, 8)).a).toMatchObject(smears);
  });

  describe('at the photo’s bottom edge (hands at y 900)', () => {
    const low = [hold('lh', 900, 900, 'start'), hold('rh', 1100, 900, 'start')];
    /** A U: tall sides outside the central columns, its middle only at the lowest rows. */
    const cup = (mask: Uint8Array, x: number, bottom: number) => {
      rect(mask, x, bottom - 15, 8, 16);
      rect(mask, x + 32, bottom - 15, 8, 16);
      return rect(mask, x + 8, bottom - 2, 24, 3);
    };
    const run = (mask: Uint8Array) =>
      autoAssign(low, H, { footholds: foot(mask), wallAngleDeg: 0 });

    it('rejects a blob whose contact point falls below the last row', () => {
      // Toe on row 1597, contact point at 1602.
      expect(run(cup(blank(), 771, 1599))).toMatchObject(smears);
    });

    it('accepts the same blob 10 rows higher, with its contact point inside', () => {
      expect(run(cup(blank(), 771, 1589)).lf).toMatch(/^blob:/);
    });

    it('accepts a 40 × 20 blob cut by the bottom edge, with its contact point inside', () => {
      // Rows 1588–1599 are on the photo (h 12), contact point at 1593.
      const f = foot(rect(blank(), 771, 1588, 40, 12));
      expect(f.blobs[0]!.bbox.h).toBe(12);
      expect(autoAssign(low, H, { footholds: f }).lf).toBe(f.blobs[0]!.id);
    });
  });

  // AC 21b: each blob placed at the left foot's ideal (790, 880); every other gate passes.
  describe('shape gates', () => {
    const at = (draw: (m: Uint8Array, x: number, y: number) => void, w: number) => {
      const mask = blank();
      draw(mask, 790 - Math.floor(w / 2), 875);
      return assign(mask).a.lf;
    };

    it('rejects a blob over 0.40 H (a 450 × 450 ellipse)', () => {
      expect(at((m, x, y) => ellipse(m, x, y, 450, 450), 450)).toBe(SMEAR);
    });

    it('accepts a 300 × 300 ellipse (0.30 H, a big volume-like foothold)', () => {
      expect(at((m, x, y) => ellipse(m, x, y, 300, 300), 300)).toMatch(/^blob:/);
    });

    it('rejects a solid 120 × 80 rectangle (a sign or sticker)', () => {
      expect(at((m, x, y) => rect(m, x, y, 120, 80), 120)).toBe(SMEAR);
    });

    it('rejects a 280 × 40 strip (aspect 7)', () => {
      expect(at((m, x, y) => rect(m, x, y, 280, 40), 280)).toBe(SMEAR);
    });

    it('rejects a strip on its aspect alone (210 × 30: small, too thin to be solid-gated)', () => {
      expect(at((m, x, y) => rect(m, x, y, 210, 30), 210)).toBe(SMEAR);
    });

    it('accepts a solid 40 × 20 rectangle (sides under 0.06 H, aspect 2)', () => {
      expect(at((m, x, y) => rect(m, x, y, 40, 20), 40)).toMatch(/^blob:/);
    });

    it('accepts a 120 × 80 ellipse (fill about 0.79)', () => {
      const f = foot(ellipse(blank(), 730, 875, 120, 80));
      expect(f.blobs[0]!.area / (120 * 80)).toBeCloseTo(0.79, 1);
      expect(at((m, x, y) => ellipse(m, x, y, 120, 80), 120)).toMatch(/^blob:/);
    });
  });

  // AC 22
  describe('preference', () => {
    it('prefers a picked route hold to a blob exactly at the ideal', () => {
      const mask = blobAt(blobAt(blank(), 790, 880), 1210, 880);
      const { footholds, a } = assign(mask, [hold('h', 700, 880)]);
      expect(a.lf).toBe('h');
      expect(a.rf).toBe(blobId(footholds, 1210, 880));
    });

    it('prefers the blob 0.05 H from the ideal to one 0.30 H away', () => {
      const mask = blank();
      blobAt(mask, 840, 880); // 0.05 H right of the left ideal
      blobAt(mask, 790, 1180); // 0.30 H below it
      blobAt(mask, 1210, 880);
      const { footholds, a } = assign(mask);
      expect(a.lf).toBe(blobId(footholds, 840, 880));
      expect(a.rf).toBe(blobId(footholds, 1210, 880));
    });

    it('prefers a blob at the edge of the gates (drop 1.0 H, Δx 0.25 H) to a smear', () => {
      const { footholds, a } = assign(blobAt(blank(), 1250, 1300));
      expect(a).toMatchObject({ lf: SMEAR, rf: blobId(footholds, 1250, 1300) });
    });
  });

  // AC 23 (the wall-angle fallback); assign.test.ts covers the calls without footholds.
  it.each([
    [-10, SMEAR],
    [0, SMEAR],
    [20, null],
    [35, null],
    [45, null],
  ])('falls back on wall angle %i to %s for both feet', (angle, fb) => {
    expect(assign(blank(), [], { wallAngleDeg: angle }).a).toMatchObject({ lf: fb, rf: fb });
  });

  // AC 24
  it('offers no blobs with Follow hands', () => {
    const mask = blobAt(blobAt(blank(), 790, 885), 1210, 885);
    expect(assign(mask, [], { feetMode: 'follow' }).a).toMatchObject(smears);
    // A picked route hold still counts.
    expect(assign(mask, [hold('h', 790, 885)], { feetMode: 'follow' }).a).toMatchObject({
      lf: 'h',
      rf: SMEAR,
    });
  });

  // AC 25
  describe('blobs under the hands and picked holds', () => {
    /** The left blob's mask and its left `cols` columns over it (each column 20 px). */
    const over = (cols: number, own: [number, number]) => {
      const m = rect(blank(), own[0] - 30, own[1] - 15, 60, 30);
      return rect(m, 790 - 19, 880, cols, 20);
    };
    /** Spans the hand (870–929, 285–314) and the blob (771–810, 880–899). */
    const BOX = { x: 771, y: 285, w: 159, h: 615 };

    it('never stands a foot on a blob a hand hold covers by 30 %', () => {
      const mask = blobAt(blobAt(blank(), 790, 885), 1210, 885);
      // The left hand's mask covers 12 × 20 = 240 px of the 800 px blob: 30 %.
      const lh = hold('lh', 900, 300, 'start', over(12, [900, 300]), BOX);
      const f = foot(mask);
      const a = autoAssign([lh, HANDS[1]!], H, { footholds: f });
      expect(a).toMatchObject({ lf: SMEAR, rf: blobId(f, 1210, 885) });
      // 11 columns (27.5 %) don't claim it.
      const lh2 = hold('lh', 900, 300, 'start', over(11, [900, 300]), BOX);
      expect(autoAssign([lh2, HANDS[1]!], H, { footholds: f }).lf).toBe(blobId(f, 790, 885));
    });

    it('claims a blob that contains a hand’s contact point', () => {
      const f = foot(rect(rect(blank(), 880, 290, 40, 20), 1300, 900, 40, 20));
      const hands = { lh: hold('lh', 900, 300, 'start'), rh: hold('rh', 1100, 300, 'start') };
      expect([...claimedBlobs([hands.lh, hands.rh], hands, f)]).toEqual([1]);
    });

    it('claims a blob that contains the contact point of a hand hold with a mask', () => {
      const f = foot(rect(rect(blank(), 880, 290, 40, 20), 1300, 900, 40, 20));
      // The SAM mask (rows 280–291) covers 2 × 40 = 80 px of the 800 px blob: 11 %, under 30 %.
      const lh = hold('lh', 900, 300, 'start', rect(blank(), 860, 280, 60, 12), {
        x: 860,
        y: 280,
        w: 60,
        h: 12,
      });
      const hands = { lh, rh: hold('rh', 1100, 300, 'start') };
      expect([...claimedBlobs([hands.lh, hands.rh], hands, f)]).toEqual([1]);
    });

    it('stands on a picked route hold, not the blob it covers by 30 %', () => {
      const mask = blobAt(blobAt(blank(), 790, 885), 1210, 885);
      const route = hold('r', 790, 885, 'route', rect(blank(), 771, 880, 12, 20), {
        x: 771,
        y: 880,
        w: 12,
        h: 20,
      });
      const { footholds, a } = assign(mask, [route]);
      expect(a).toMatchObject({ lf: 'r', rf: blobId(footholds, 1210, 885) });
      // The covered blob is that hold's, so neither foot's menu offers it again.
      const covered = blobId(footholds, 790, 885);
      const c = footCandidates({
        holds: [...HANDS, route],
        hands: { lh: HANDS[0]!, rh: HANDS[1]! },
        height: H,
        footholds,
        mode: 'any',
      });
      expect(c.lf.map((x) => x.id)).toContain('r');
      expect([...c.lf, ...c.rf].map((x) => x.id)).not.toContain(covered);
    });

    it('stands on neither a finish hold nor the blob it covers by 30 %', () => {
      const mask = blobAt(blobAt(blank(), 790, 885), 1210, 885);
      const fin = hold('fin', 790, 885, 'finish', rect(blank(), 771, 880, 12, 20), {
        x: 771,
        y: 880,
        w: 12,
        h: 20,
      });
      const { footholds, a } = assign(mask, [fin]);
      expect(a).toMatchObject({ lf: SMEAR, rf: blobId(footholds, 1210, 885) });
    });
  });

  // AC 26
  describe('pairs and edge routes', () => {
    const SPOTS: [number, number][] = [
      [790, 880],
      [1210, 880],
      [1000, 880],
      [850, 1000],
      [1150, 760],
      [700, 1050],
    ];

    it('keeps two real feet left to right, never on one candidate', () => {
      for (let i = 0; i < SPOTS.length; i++) {
        for (let j = i + 1; j < SPOTS.length; j++) {
          for (let k = j + 1; k < SPOTS.length; k++) {
            const mask = blank();
            for (const s of [SPOTS[i]!, SPOTS[j]!, SPOTS[k]!]) blobAt(mask, ...s);
            const { footholds, a } = assign(mask);
            const c = contactsFor(a, HANDS, new Map(), new Map(), H, undefined, undefined, {
              footholds,
            });
            expect(a.lf).toMatch(/^blob:/);
            expect(a.rf).toMatch(/^blob:/);
            expect(a.lf).not.toBe(a.rf);
            expect(c.lf!.point[0]).toBeLessThanOrEqual(c.rf!.point[0]);
          }
        }
      }
    });

    it('gives a single blob right of the hands to the right foot', () => {
      const { footholds, a } = assign(blobAt(blank(), 1150, 885));
      expect(a).toMatchObject({ lf: SMEAR, rf: blobId(footholds, 1150, 885) });
    });

    it('gives a single blob left of the hands to the left foot', () => {
      const { footholds, a } = assign(blobAt(blank(), 850, 885));
      expect(a).toMatchObject({ lf: blobId(footholds, 850, 885), rf: SMEAR });
    });

    it('assigns nothing without a start hold, whatever the footholds', () => {
      const footholds = foot(blobAt(blobAt(blank(), 790, 885), 1210, 885));
      expect(autoAssign([hold('a', 1000, 300)], H, { footholds })).toEqual(EMPTY_ASSIGNMENT);
      expect(autoAssign([], H, { footholds })).toEqual(EMPTY_ASSIGNMENT);
    });

    it('matches the hands on a lone start hold and measures the gates from it', () => {
      const mask = blank();
      blobAt(mask, 790, 500); // drop 0.20 H below the start hold: too high
      blobAt(mask, 1210, 880);
      const footholds = foot(mask);
      const a = autoAssign([hold('s', 1000, 300, 'start')], H, { footholds });
      expect(a).toEqual({ lh: 's', rh: 's', lf: SMEAR, rf: blobId(footholds, 1210, 880) });
    });
  });

  // AC 26b
  it.each([
    ['Δx −0.60 H, drop 0.80 H', 400, 1100],
    ['Δx −0.30 H, drop 1.05 H', 700, 1350],
  ])('reaches a blob at the gate corner (%s) on Vertical', (_, x, y) => {
    const { footholds, a } = assign(blobAt(blank(), x, y));
    expect(a.lf).toMatch(/^blob:/);
    const types = new Map([
      ['lh', 'jug'],
      ['rh', 'jug'],
    ]);
    const forces = new Map(['lh', 'rh'].map((id) => [id, { dir: DOWN }]));
    const c = contactsFor(a, HANDS, types, forces, H, { width: W, height: IH }, undefined, {
      footholds,
    });
    const s = solveStance(c, { height: H, wallAngleDeg: 0 });
    expect(s.diagnosis?.kind).not.toBe('reach');
    expect(s.reach.lf).toBe(true);
  });
});

describe('footCandidates', () => {
  const args = (footholds: WallFootholds | null, holds = HANDS) => ({
    holds,
    hands: { lh: HANDS[0]!, rh: HANDS[1]! },
    height: H,
    footholds,
    mode: 'any' as const,
  });

  it('lists picked holds first, then at most 4 blobs, each group by cost', () => {
    const mask = blank();
    for (let i = 0; i < 6; i++) blobAt(mask, 700 + i * 120, 880 + (i % 2) * 40);
    const c = footCandidates(args(foot(mask), [...HANDS, hold('far', 1250, 1200)]));
    for (const side of ['lf', 'rf'] as const) {
      expect(c[side][0]).toMatchObject({ id: 'far', kind: 'hold', point: [1250, 1200] });
      const blobs = c[side].slice(1);
      expect(blobs).toHaveLength(4);
      expect(blobs.every((b) => b.kind === 'blob')).toBe(true);
      for (let i = 1; i < blobs.length; i++) {
        expect(blobs[i]!.cost).toBeGreaterThanOrEqual(blobs[i - 1]!.cost);
      }
    }
    // Each foot ranks by its own ideal.
    expect(c.lf[1]!.point[0]).toBeLessThan(c.rf[1]!.point[0]);
  });

  it('scores the distance to the ideal, plus a soft penalty right under a hand', () => {
    const c = footCandidates(args(null, [...HANDS, hold('a', 790, 880), hold('b', 900, 650)]));
    const a = c.lf.find((x) => x.id === 'a')!;
    const b = c.lf.find((x) => x.id === 'b')!;
    expect(a.cost).toBeCloseTo(0, 9);
    // 0.25 H from the ideal, 0.35 H under the left hand (outside 0.29 H), ~0.38 H from the right.
    expect(b.cost).toBeCloseTo(Math.hypot(110, 230) / H, 9);
    const c2 = footCandidates(args(null, [...HANDS, hold('u', 900, 560)]));
    const u = c2.lf[0]!;
    const dl = 260;
    const dr = Math.hypot(200, 260);
    const expected =
      Math.hypot(110, 320) / H + 0.5 * (Math.max(0, 1 - dl / 290) + Math.max(0, 1 - dr / 290));
    expect(u.cost).toBeCloseTo(expected, 9);
  });

  // AC 33
  it('gives the same costs when every point, bounding box and H scale by 3', () => {
    const mask = blank();
    for (const [x, y] of [
      [790, 880],
      [1210, 880],
      [1000, 1000],
      [860, 760],
    ])
      blobAt(mask, x!, y!);
    ellipse(mask, 1100, 1100, 120, 80);
    const base = foot(mask);
    const k = 3;
    const scaledHold = (h: HoldMask) =>
      hold(h.id, h.centroid.x * k, h.centroid.y * k, h.role, undefined, {
        x: h.bbox.x * k,
        y: h.bbox.y * k,
        w: h.bbox.w * k,
        h: h.bbox.h * k,
      });
    const holds = [...HANDS, hold('r', 700, 900)];
    const big = holds.map(scaledHold);
    const scaled: WallFootholds = {
      imageId: 'img',
      width: W * k,
      height: IH * k,
      labels: new Uint16Array(W * k * IH * k),
      blobs: base.blobs.map((b) => ({
        ...b,
        area: b.area * k * k,
        bbox: { x: b.bbox.x * k, y: b.bbox.y * k, w: b.bbox.w * k, h: b.bbox.h * k },
        centroid: { x: b.centroid.x * k, y: b.centroid.y * k },
        toe: { x: b.toe.x * k, y: b.toe.y * k },
      })),
    };
    const flat = (c: FootCandidates) => [...c.lf, ...c.rf].map((x) => [x.id, x.cost] as const);
    const a = flat(footCandidates(args(base, holds)));
    const b = flat(
      footCandidates({
        holds: big,
        hands: { lh: big[0]!, rh: big[1]! },
        height: H * k,
        footholds: scaled,
        mode: 'any',
      }),
    );
    expect(a.length).toBeGreaterThan(4);
    expect(b.map((x) => x[0])).toEqual(a.map((x) => x[0]));
    b.forEach(([, cost], i) => expect(Math.abs(cost - a[i]![1])).toBeLessThan(1e-9));
  });

  it('lists nothing without a hand', () => {
    expect(footCandidates({ ...args(null), hands: { lh: null, rh: null } })).toEqual({
      lf: [],
      rf: [],
    });
  });
});

// AC 33
describe('determinism', () => {
  it('gives the same assignment and stance for the same inputs', () => {
    const run = () => {
      const mask = blank();
      for (const [x, y] of [
        [790, 880],
        [1210, 880],
        [1000, 1000],
      ])
        blobAt(mask, x!, y!);
      const { footholds, a } = assign(mask, [hold('r', 700, 900)]);
      const forces = new Map(['lh', 'rh'].map((id) => [id, { dir: DOWN }]));
      const types = new Map([
        ['lh', 'jug'],
        ['rh', 'jug'],
      ]);
      const c = contactsFor(a, HANDS, types, forces, H, { width: W, height: IH }, undefined, {
        footholds,
      });
      return { a, c, s: solveStance(c, { height: H, wallAngleDeg: 0 }) };
    };
    expect(run()).toEqual(run());
  });
});

// Rule 4's Task 4 check, on drawn blobs (ADR-0003 (e)): the earlier version read a pinned summary
// of a real wall mask's foot band, which stays private. Hands as in a recorded start: a crimp up
// and left, a sloper lower and right; two footholds about 0.5 H below, a sign and a far blob.
describe('a start with its feet just 0.5 H below the hands (drawn blobs)', () => {
  const mask = blank();
  blobAt(mask, 940, 840, 60, 40);
  blobAt(mask, 1120, 850, 60, 40);
  rect(mask, 980, 1000, 120, 80); // a solid sign: the shape gates drop it
  blobAt(mask, 500, 1250); // 0.5 H off the ideal: a worse candidate than either foothold
  const footholds = foot(mask);
  const holds = [hold('1', 1100, 340, 'start'), hold('2', 900, 300)];
  const LEFT = blobId(footholds, 940, 845)!;
  const RIGHT = blobId(footholds, 1120, 855)!;

  it('draws the blobs this check is about', () => {
    expect(
      new Set([LEFT, RIGHT, blobId(footholds, 1000, 1010), blobId(footholds, 500, 1250)]).size,
    ).toBe(4);
  });

  // 950 is climber size 95 %.
  it.each([1000, 950])('stands the feet on the two footholds at H %i', (h) => {
    expect(autoAssign(holds, h, { footholds, wallAngleDeg: 0 })).toEqual({
      lh: '2',
      rh: '1',
      lf: LEFT,
      rf: RIGHT,
    });
  });

  // The feet are just ~0.5 H below the lower hand, so the near-straight legs (B1) push the hips up
  // until `hipsBelowHands` (0.15 H below the *higher*, left hand) clamps them, just below the lower
  // hand. No prior can raise them further, so this pins the clamp; `stance.test.ts` ("hangs the
  // hips off the floor…") checks a hip height the prior does move.
  it('rests the hips on the search floor, below the lower hand, on Vertical', () => {
    const a = autoAssign(holds, H, { footholds, wallAngleDeg: 0 });
    const types = new Map([
      ['1', 'sloper'],
      ['2', 'crimp'],
    ]);
    const forces = new Map([
      ['1', { dir: unit([0, 0.6, -1]), source: 'type' as const }],
      ['2', { dir: unit([1, 0, -0.3]), source: 'type' as const }],
    ]);
    const c = contactsFor(a, holds, types, forces, H, { width: W, height: IH }, undefined, {
      footholds,
    });
    const s = solveStance(c, { height: H, wallAngleDeg: 0 });
    expect(s.feasible).toBe(true);
    const lowerHandY = Math.max(c.lh!.point[1], c.rh!.point[1]);
    const floor = Math.min(c.lh!.point[1], c.rh!.point[1]) + DEFAULT_PRIOR.hipsBelowHands * H;
    expect(s.joints!.pelvis[1]).toBeCloseTo(floor, 6);
    expect(s.joints!.pelvis[1]).toBeGreaterThan(lowerHandY);
  });
});
