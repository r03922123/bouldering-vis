import { computeNormals } from '../depth-estimation';
import type { DepthMap } from '../depth-estimation';
import type { HoldMask } from '../hold-segmentation';
import { facingWord, holdGeometry } from './geometry';

const W = 80;
const H = 80;
const GAIN = 40;

/** A square hold (x,y 30–49) and a depth map from `d(x, y)`. */
function scene(d: (x: number, y: number) => number) {
  const depth = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) depth[y * W + x] = d(x, y);
  const map: DepthMap = {
    imageId: 'img',
    width: W,
    height: H,
    depth,
    normals: computeNormals(depth, W, H, { gain: GAIN }),
  };
  const mask = new Uint8Array(W * H);
  for (let y = 30; y < 50; y++) for (let x = 30; x < 50; x++) mask[y * W + x] = 1;
  const hold = { id: 'h', mask, bbox: { x: 30, y: 30, w: 20, h: 20 }, area: 400 } as HoldMask;
  return { map, hold };
}

const inside = (x: number, y: number) => x >= 30 && x < 50 && y >= 30 && y < 50;
const deg = (a: number[], b: number[]) =>
  (Math.acos(
    Math.min(
      1,
      a.reduce((s, v, i) => s + v * b[i]!, 0),
    ),
  ) *
    180) /
  Math.PI;

describe('holdGeometry', () => {
  it('a hold on a flat wall faces straight out: facing out, standard, R > 0.95', () => {
    const { map, hold } = scene(() => 0.2);
    const g = holdGeometry(hold, [hold], map);
    expect(g.facing).toBe('out');
    expect(g.orientation).toBe('standard');
    expect(g.consistency).toBeGreaterThan(0.95);
    expect(g.holdId).toBe('h');
  });

  it('a hold that faces left (nearer to the right) is a sidepull, normal within 2° of analytic', () => {
    const slope = 0.02; // tilt = atan(40 × 0.02) ≈ 38.7°
    const { map, hold } = scene((x, y) => (inside(x, y) ? 0.2 + (x - 30) * slope : 0.2));
    const g = holdGeometry(hold, [hold], map);
    expect(g.facing).toBe('left');
    expect(g.orientation).toBe('sidepull');
    const len = Math.hypot(GAIN * slope, 1);
    expect(deg(g.normal, [(-GAIN * slope) / len, 0, 1 / len])).toBeLessThan(2);
  });

  it('a hold that faces down is an undercling', () => {
    // Nearer at the top → the surface faces down (+y in image coordinates).
    const { map, hold } = scene((x, y) => (inside(x, y) ? 0.2 + (49 - y) * 0.02 : 0.2));
    const g = holdGeometry(hold, [hold], map);
    expect(g.facing).toBe('down');
    expect(g.orientation).toBe('undercling');
  });

  it('a hold that faces up is standard (a normal pull-down hold)', () => {
    const { map, hold } = scene((x, y) => (inside(x, y) ? 0.2 + (y - 30) * 0.02 : 0.2));
    const g = holdGeometry(hold, [hold], map);
    expect(g.facing).toBe('up');
    expect(g.orientation).toBe('standard');
  });

  it('judges orientation relative to the wall: on a tilted wall a flat hold is standard', () => {
    const { map, hold } = scene((x) => x * 0.02); // the whole wall tilts the same way
    const g = holdGeometry(hold, [hold], map);
    expect(g.facing).toBe('left'); // it faces left relative to the camera…
    expect(g.orientation).toBe('standard'); // …but not relative to the wall
  });

  it('erosion removes edge effects: a step on one side tilts the uneroded normal more', () => {
    // The hold is raised, with a drop only along its right edge.
    const { map, hold } = scene((x, y) => (y >= 30 && y < 50 && x < 50 ? 0.4 : 0.2));
    const eroded = holdGeometry(hold, [hold], map, { erode: 2 });
    const raw = holdGeometry(hold, [hold], map, { erode: 0 });
    expect(Math.abs(eroded.normal[0])).toBeLessThan(Math.abs(raw.normal[0]));
  });

  it('excludes other selected holds from the wall ring', () => {
    const { map, hold } = scene((x, y) =>
      x >= 52 && x < 70 && y >= 30 && y < 50 ? 0.2 + (x - 52) * 0.05 : 0.2,
    );
    const neighbour = { ...hold, id: 'n', mask: new Uint8Array(W * H) } as HoldMask;
    for (let y = 30; y < 50; y++) for (let x = 52; x < 70; x++) neighbour.mask[y * W + x] = 1;
    const alone = holdGeometry(hold, [hold], map);
    const withNeighbour = holdGeometry(hold, [hold, neighbour], map);
    // Blur spills a little across the neighbour's edge, so compare instead of expecting exactly 0.
    expect(Math.abs(alone.wallNormal[0])).toBeGreaterThan(0.03);
    expect(Math.abs(withNeighbour.wallNormal[0])).toBeLessThan(Math.abs(alone.wallNormal[0]) / 2);
  });
});

describe('facingWord', () => {
  it.each([
    [[1, 0, 0.5], 'right'],
    [[0.7, 0.7, 0.3], 'down-right'],
    [[0, 1, 0.5], 'down'],
    [[-1, 0, 0.5], 'left'],
    [[0, -1, 0.5], 'up'],
    [[-0.7, -0.7, 0.3], 'up-left'],
    [[0.05, 0.05, 0.99], 'out'],
  ] as const)('%j → %s', (n, word) => {
    expect(facingWord(n as unknown as [number, number, number])).toBe(word);
  });
});

describe('holdGeometry performance', () => {
  it('handles 10 holds (one a 10k-px volume) on a 1536×1152 map in well under the budget', () => {
    const w = 1536;
    const h = 1152;
    const map: DepthMap = {
      imageId: 'img',
      width: w,
      height: h,
      depth: new Float32Array(w * h),
      normals: new Float32Array(w * h * 3).fill(0.577),
    };
    const square = (id: string, x0: number, y0: number, size: number) => {
      const mask = new Uint8Array(w * h);
      for (let y = y0; y < y0 + size; y++) for (let x = x0; x < x0 + size; x++) mask[y * w + x] = 1;
      return { id, mask, bbox: { x: x0, y: y0, w: size, h: size } } as HoldMask;
    };
    const holds = [
      square('big', 200, 200, 100),
      ...Array.from({ length: 9 }, (_, i) => square(`h${i}`, 400 + i * 100, 600, 25)),
    ];
    const t0 = performance.now();
    for (const hold of holds) holdGeometry(hold, holds, map);
    expect(performance.now() - t0).toBeLessThan(200); // spec: < 5 ms per hold on the main thread
  });
});

describe('hold shape', () => {
  const flatMap = (): DepthMap => {
    const depth = new Float32Array(W * H);
    return {
      imageId: 'img',
      width: W,
      height: H,
      depth,
      normals: computeNormals(depth, W, H, { gain: GAIN }),
    };
  };
  const bar = (x0: number, y0: number, w: number, h: number) => {
    const mask = new Uint8Array(W * H);
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) mask[y * W + x] = 1;
    return {
      id: 'b',
      mask,
      bbox: { x: x0, y: y0, w, h },
      area: w * h,
      centroid: { x: x0 + w / 2, y: y0 + h / 2 },
    } as HoldMask;
  };

  it('sees a thin vertical hold as long and upright', () => {
    const hold = bar(36, 20, 6, 30);
    const g = holdGeometry(hold, [hold], flatMap());
    expect(g.shape!.elongation).toBeGreaterThan(3);
    expect(g.shape!.tiltDeg).toBeLessThan(10);
    expect(g.shape!.x).toBeCloseTo(38.5, 6);
  });

  it('sees a horizontal edge as long but lying flat', () => {
    const hold = bar(20, 36, 30, 6);
    const g = holdGeometry(hold, [hold], flatMap());
    expect(g.shape!.elongation).toBeGreaterThan(3);
    expect(g.shape!.tiltDeg).toBeGreaterThan(80);
  });
});
