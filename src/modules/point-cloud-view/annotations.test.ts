import type { DepthMap } from '../depth-estimation';
import { forceDirection, type HoldGeometry } from '../hold-geometry';
import type { HoldMask } from '../hold-segmentation';
import { annotations } from './annotations';
import { intrinsics, unproject } from './build';

const w = 100;
const h = 80;
const depth: DepthMap = {
  imageId: 'img',
  width: w,
  height: h,
  depth: new Float32Array(w * h).fill(0.5),
  normals: new Float32Array(w * h * 3),
};
const hold = (id: string, role: HoldMask['role'], order: number, x = 30, y = 20) =>
  ({ id, role, order, centroid: { x, y } }) as HoldMask;
const geom = (
  holdId: string,
  normal: [number, number, number],
  consistency = 0.9,
): HoldGeometry => ({
  holdId,
  normal,
  wallNormal: [0, 0, 1],
  consistency,
  orientation: 'standard',
  facing: 'left',
});

describe('annotations', () => {
  it('anchors each arrow at the hold centroid unprojected into 3D', () => {
    const [a] = annotations(
      [hold('a', 'route', 0)],
      new Map([['a', geom('a', [0, 0, 1])]]),
      depth,
      0.35,
    );
    const expected = unproject(30, 20, 0.5, intrinsics(w, h), 0.35);
    a!.origin.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 9));
  });

  it('carries the numbered badge labels and skips holds without geometry', () => {
    const holds = [
      hold('s1', 'start', 0),
      hold('s2', 'start', 1),
      hold('f', 'finish', 2),
      hold('x', 'route', 3),
    ];
    const g = new Map(['s1', 's2', 'f'].map((id) => [id, geom(id, [0, 0, 1])]));
    const out = annotations(holds, g, depth, 0.35);
    expect(out.map((a) => [a.holdId, a.label])).toEqual([
      ['s1', '1S'],
      ['s2', '2S'],
      ['f', '3F'],
    ]);
  });

  it('adds a force arrow that ends at the hold and points along the force (three.js frame)', () => {
    const g = geom('a', [0, 0, 1]);
    const forces = new Map([['a', forceDirection(g, 'crimp')]]);
    const [a] = annotations([hold('a', 'route', 0)], new Map([['a', g]]), depth, 0.35, forces);
    expect(a!.force).toBeDefined();
    const f = a!.force!;
    // Crimp on a flat wall: pull down → −y in three.js.
    expect(f.dir[1]).toBeCloseTo(-1, 6);
    // Tail sits above the hold; tail + dir·length lands back on the hold.
    f.tail.forEach((v, i) => expect(v + f.dir[i]! * f.length).toBeCloseTo(a!.origin[i]!, 9));
    expect(f.tail[1]).toBeGreaterThan(a!.origin[1]);
  });

  it('has no force arrow for a pinch or an unclassified hold', () => {
    const g = new Map([
      ['a', geom('a', [0, 0, 1])],
      ['b', geom('b', [0, 0, 1])],
    ]);
    const out = annotations(
      [hold('a', 'route', 0), hold('b', 'route', 1)],
      g,
      depth,
      0.35,
      new Map([['a', forceDirection(g.get('a')!, 'pinch')]]),
    );
    expect(out.map((x) => x.force)).toEqual([undefined, undefined]);
  });
});
