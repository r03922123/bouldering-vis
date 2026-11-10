import type { DepthMap } from '../depth-estimation';
import { intrinsics, unproject } from './build';
import { wallToWorld } from './stance';

const W = 200;
const H = 100;
const depth = (d: (x: number) => number): DepthMap => ({
  imageId: 'a',
  width: W,
  height: H,
  depth: Float32Array.from({ length: W * H }, (_, i) => d(i % W)),
  normals: new Float32Array(W * H * 3),
});
const contact = (x: number, y: number) => ({
  holdId: `${x}`,
  point: [x, y] as [number, number],
  type: null,
  dir: null,
});

describe('wallToWorld', () => {
  it('puts a point on the wall where the point cloud has the holds’ depth', () => {
    const map = depth(() => 0.5);
    const f = wallToWorld(map, 0.35, { lh: contact(50, 50) });
    const expected = unproject(120, 30, 0.5, intrinsics(W, H), 0.35);
    f([120, 30, 0]).forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 9));
  });

  it('moves a point out of the wall toward the camera, at the wall’s pixel scale', () => {
    const map = depth(() => 0.5);
    const f = wallToWorld(map, 0.35, { lh: contact(50, 50) });
    const k = intrinsics(W, H);
    const zWall = 1 - 0.35 * 0.5;
    expect(f([100, 50, 40])[2] - f([100, 50, 0])[2]).toBeCloseTo((40 * zWall) / k.f, 9);
    // One pixel sideways on the wall is the same world length as one pixel out of it.
    expect(f([101, 50, 0])[0] - f([100, 50, 0])[0]).toBeCloseTo(zWall / k.f, 9);
  });

  it('uses one flat plane at the holds’ mean depth', () => {
    const map = depth((x) => (x < 100 ? 0.2 : 0.8));
    const f = wallToWorld(map, 0.35, { lh: contact(50, 50), rf: contact(150, 50) });
    expect(f([10, 10, 0])[2]).toBeCloseTo(f([190, 90, 0])[2], 9);
    expect(f([10, 10, 0])[2]).toBeCloseTo(-(1 - 0.35 * 0.5), 6);
  });

  it('ignores smearing feet when it picks the wall depth', () => {
    const map = depth((x) => (x < 100 ? 0.2 : 0.8));
    const smear = { ...contact(150, 50), holdId: 'wall' };
    const f = wallToWorld(map, 0.35, { lh: contact(50, 50), lf: smear });
    expect(f([10, 10, 0])[2]).toBeCloseTo(-(1 - 0.35 * 0.2), 6);
  });
});
