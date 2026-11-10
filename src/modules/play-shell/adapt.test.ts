import type { Joints } from '../climber-stance';
import { sameView, toPixelJoints, viewFrom } from './adapt';

// SPEC-play-shell S1 (the PixelView behind SelectionCanvas's toScreen) and pixel-kit P4.

describe('viewFrom (S1)', () => {
  it('reads the scale and offset from toScreen, with the box and dpr as given', () => {
    const toScreen = (p: { x: number; y: number }) => ({ x: p.x * 0.25 + 12, y: p.y * 0.25 - 3 });
    expect(viewFrom(toScreen, 343, 257, 2.625)).toEqual({
      scale: 0.25,
      tx: 12,
      ty: -3,
      boxW: 343,
      boxH: 257,
      dpr: 2.625,
    });
  });

  it('maps an image point to the same screen point as toScreen', () => {
    const toScreen = (p: { x: number; y: number }) => ({ x: p.x * 0.4 + 5, y: p.y * 0.4 + 7 });
    const v = viewFrom(toScreen, 100, 80, 1);
    const p = { x: 812, y: 133 };
    expect(p.x * v.scale + v.tx).toBeCloseTo(toScreen(p).x, 9);
    expect(p.y * v.scale + v.ty).toBeCloseTo(toScreen(p).y, 9);
  });
});

describe('sameView', () => {
  const v = { scale: 1, tx: 0, ty: 0, boxW: 10, boxH: 10, dpr: 1 };
  it('is true for equal fields and false when any field differs', () => {
    expect(sameView(v, { ...v })).toBe(true);
    expect(sameView(null, v)).toBe(false);
    for (const k of Object.keys(v) as (keyof typeof v)[]) {
      expect(sameView(v, { ...v, [k]: v[k] + 1 })).toBe(false);
    }
  });
});

describe('toPixelJoints (pixel-kit P4)', () => {
  it('turns every [x, y, z] tuple into {x, y, z}, same joint names', () => {
    const names = [
      'pelvis',
      'neck',
      'head',
      'lShoulder',
      'rShoulder',
      'lElbow',
      'rElbow',
      'lHand',
      'rHand',
      'lHip',
      'rHip',
      'lKnee',
      'rKnee',
      'lFoot',
      'rFoot',
    ] as const;
    const joints = Object.fromEntries(
      names.map((n, i) => [n, [i, i + 0.5, -i]]),
    ) as unknown as Joints;
    const out = toPixelJoints(joints);
    expect(Object.keys(out).sort()).toEqual([...names].sort());
    names.forEach((n, i) => expect(out[n]).toEqual({ x: i, y: i + 0.5, z: -i }));
  });
});
