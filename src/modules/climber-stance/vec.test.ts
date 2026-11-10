import { alignToOut, dot, norm, unit, type Vec3 } from './vec';

describe('alignToOut', () => {
  const n = unit([0.2, -0.5, 1]);

  it('turns the wall normal itself to +z', () => {
    alignToOut(n, n).forEach((x, i) => expect(x).toBeCloseTo([0, 0, 1][i]!, 9));
  });

  it('keeps lengths and the angle to the normal', () => {
    const v: Vec3 = [0.3, 0.8, -0.4];
    const r = alignToOut(v, n);
    expect(norm(r)).toBeCloseTo(norm(v), 9);
    expect(r[2]).toBeCloseTo(dot(v, n), 9);
  });

  it('leaves vectors alone when the wall faces the camera', () => {
    expect(alignToOut([0, 1, 0], [0, 0, 1])).toEqual([0, 1, 0]);
  });
});
