import type { Annotation } from './annotations';
import { drawCoachMark, drawHandles, layoutOverlay } from './overlay';

// Orthographic stand-in for the camera: world (x, y) → screen (400 + 100x, 300 − 100y); z ignored.
const project = (p: [number, number, number]) => ({ x: 400 + 100 * p[0], y: 300 - 100 * p[1] });
const right: [number, number, number] = [1, 0, 0];

const anno = (over: Partial<Annotation>): Annotation => ({
  holdId: 'h',
  origin: [0, 0, -1],
  label: '3',
  ...over,
});
const down = {
  tail: [0, 0.16, -1] as [number, number, number],
  dir: [0, -1, 0] as [number, number, number],
  length: 0.16,
};

describe('layoutOverlay', () => {
  it('projects the hold and gives a down-pointing screen arrow for a pull-down force', () => {
    const [it] = layoutOverlay(
      [anno({ force: down })],
      project,
      right,
      new Map([['h', 'default']]),
    );
    expect([it!.x, it!.y]).toEqual([400, 300]);
    expect(it!.arrow!.ux).toBeCloseTo(0, 9);
    expect(it!.arrow!.uy).toBeCloseTo(1, 9); // screen y grows downward
  });

  it('puts the badge on the opposite side of the arrow, so they never overlap', () => {
    const [it] = layoutOverlay(
      [anno({ force: down })],
      project,
      right,
      new Map([['h', 'default']]),
    );
    expect(it!.badge.y).toBeLessThan(it!.y); // arrow goes down → badge above
    expect(it!.badge.x).toBeCloseTo(it!.x, 9);
  });

  it('puts the badge above the hold when there is no arrow', () => {
    const [it] = layoutOverlay([anno({})], project, right, new Map());
    expect(it!.arrow).toBeNull();
    expect(it!.badge.y).toBeLessThan(it!.y);
  });

  it('draws notable forces longer and bolder than default ones', () => {
    const items = layoutOverlay(
      [anno({ holdId: 'a', force: down }), anno({ holdId: 'b', force: down })],
      project,
      right,
      new Map([
        ['a', 'default'],
        ['b', 'notable'],
      ]),
    );
    expect(items[1]!.arrow!.length).toBeGreaterThan(items[0]!.arrow!.length);
    expect(items[1]!.arrow!.width).toBeGreaterThan(items[0]!.arrow!.width);
  });

  it('switches to ⊗ when the force points (almost) straight away from the viewer', () => {
    const intoWall = {
      tail: [0, 0, -0.84] as [number, number, number],
      dir: [0, 0, -1] as [number, number, number],
      length: 0.16,
    };
    const [it] = layoutOverlay(
      [anno({ force: intoWall })],
      project,
      right,
      new Map([['h', 'notable']]),
    );
    expect(it!.arrow!.intoView).toBe(true);
  });
});

describe('drawHandles', () => {
  /** Records each ring: where, how big, dashed or not, and its line width. */
  function recorder() {
    const rings: { x: number; y: number; r: number; dashed: boolean; width: number }[] = [];
    let dash: number[] = [];
    const ctx = {
      save() {},
      restore() {
        dash = [];
      },
      beginPath() {},
      stroke() {},
      fill() {},
      setLineDash(d: number[]) {
        dash = d;
      },
      arc(x: number, y: number, r: number) {
        rings.push({ x, y, r, dashed: dash.length > 0, width: ctx.lineWidth });
      },
      lineWidth: 1,
      strokeStyle: '',
      fillStyle: '',
      globalAlpha: 1,
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, rings };
  }
  const arrow = { ux: 0, uy: 1, length: 40, width: 3, alpha: 1, intoView: false };
  const items = [
    { holdId: 'a', x: 100, y: 100, badge: { x: 100, y: 80 }, arrow },
    { holdId: 'b', x: 200, y: 100, badge: { x: 200, y: 80 }, arrow: null },
  ];

  it('rings each arrowhead, and dashes the "draw one" handle of a hold with no direction', () => {
    const { ctx, rings } = recorder();
    drawHandles(ctx, items, { hover: null, active: null, pulse: 0 });
    expect(rings.map((r) => [r.x, r.y, r.dashed])).toEqual([
      [100, 140, false],
      [200, 134, true],
    ]);
  });

  it('grows the hovered or aimed handle, and more while it pulses on a snap', () => {
    const plain = recorder();
    drawHandles(plain.ctx, items, { hover: null, active: null, pulse: 0 });
    const hover = recorder();
    drawHandles(hover.ctx, items, { hover: 'a', active: null, pulse: 0 });
    const snap = recorder();
    drawHandles(snap.ctx, items, { hover: null, active: 'a', pulse: 1 });
    expect(hover.rings[0]!.r).toBeGreaterThan(plain.rings[0]!.r);
    expect(snap.rings[0]!.r).toBeGreaterThan(hover.rings[0]!.r);
    expect(hover.rings[1]!.r).toBe(plain.rings[1]!.r); // only the hovered one changes
  });
});

describe('drawCoachMark', () => {
  function recorder() {
    const texts: { text: string; x: number; y: number }[] = [];
    const ctx = {
      save() {},
      restore() {},
      beginPath() {},
      closePath() {},
      stroke() {},
      fill() {},
      moveTo() {},
      lineTo() {},
      rect() {},
      roundRect() {},
      measureText: (t: string) => ({ width: t.length * 6 }),
      fillText(text: string, x: number, y: number) {
        texts.push({ text, x, y });
      },
      lineWidth: 1,
      strokeStyle: '',
      fillStyle: '',
      globalAlpha: 1,
      font: '',
      textAlign: 'left',
      textBaseline: 'alphabetic',
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, texts };
  }
  const arrow = { ux: 0, uy: 1, length: 40, width: 3, alpha: 1, intoView: false };
  const item = { holdId: 'a', x: 100, y: 100, badge: { x: 100, y: 80 }, arrow }; // handle at (100, 140)

  it('writes the tip beside the handle, to its right', () => {
    const { ctx, texts } = recorder();
    drawCoachMark(ctx, item, 'Drag to set the pull', { w: 800, h: 600 });
    expect(texts).toHaveLength(1);
    expect(texts[0]!.text).toBe('Drag to set the pull');
    expect(texts[0]!.x).toBeGreaterThan(100 + 12);
    expect(Math.abs(texts[0]!.y - 140)).toBeLessThan(24);
  });

  it('flips the tip to the left when the handle is near the right edge', () => {
    const { ctx, texts } = recorder();
    drawCoachMark(ctx, { ...item, x: 780 }, 'Drag to set the pull', { w: 800, h: 600 });
    expect(texts[0]!.x).toBeLessThan(780 - 12);
  });
});
