import { aimOnViewPlane, handleAt, hitHandle, imageToThree, threeToImage } from './aim';
import type { OverlayItem } from './overlay';

const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 9));

describe('frames', () => {
  it('image (+y down) and three.js (+y up) differ only in y, and round-trip', () => {
    close(imageToThree([0.3, 0.9, -0.2]), [0.3, -0.9, -0.2]);
    close(threeToImage(imageToThree([0.3, 0.9, -0.2])), [0.3, 0.9, -0.2]);
  });
});

describe('aimOnViewPlane', () => {
  const hold: [number, number, number] = [0, 0, -1];

  it('front camera: a pointer below the hold aims down, within the wall plane', () => {
    // Camera at the origin looking down −z; the ray goes a little below the hold.
    const ray: [number, number, number] = [0, -0.2, -1];
    const d = aimOnViewPlane([0, 0, 0], [0, 0, -1], ray, hold)!;
    close(d, [0, -1, 0]);
  });

  it('side camera: the same gesture aims into the wall', () => {
    // Camera to the right of the hold looking −x; a ray past the hold toward −z.
    const cam: [number, number, number] = [1, 0, -1];
    const ray: [number, number, number] = [-1, 0, -0.3];
    const d = aimOnViewPlane(cam, [-1, 0, 0], ray, hold)!;
    close(d, [0, 0, -1]);
    close(threeToImage(d), [0, 0, -1]); // into the wall in the image frame too
  });

  it('gives nothing for a ray parallel to the plane or a pointer on the hold', () => {
    expect(aimOnViewPlane([0, 0, 0], [0, 0, -1], [1, 0, 0], hold)).toBeNull();
    expect(aimOnViewPlane([0, 0, 0], [0, 0, -1], [0, 0, -1], hold)).toBeNull();
  });
});

const item = (over: Partial<OverlayItem>): OverlayItem => ({
  holdId: 'a',
  x: 100,
  y: 100,
  badge: { x: 100, y: 80 },
  arrow: null,
  ...over,
});
const arrow = { ux: 0, uy: 1, length: 40, width: 3, alpha: 1, intoView: false };

describe('handles', () => {
  it('sits on the arrowhead, on the hold for ⊗, and below a hold with no direction', () => {
    expect(handleAt(item({ arrow }))).toEqual({ x: 100, y: 140, kind: 'arrow' });
    expect(handleAt(item({ arrow: { ...arrow, intoView: true } }))).toEqual({
      x: 100,
      y: 100,
      kind: 'arrow',
    });
    expect(handleAt(item({}))).toEqual({ x: 100, y: 134, kind: 'draw' });
  });

  it('hits the nearest handle within 22 px (a 44 px target), else nothing', () => {
    const items = [item({ holdId: 'a', arrow }), item({ holdId: 'b', x: 160, arrow })];
    expect(hitHandle(items, 104, 150)).toBe('a');
    expect(hitHandle(items, 150, 140)).toBe('b');
    expect(hitHandle(items, 130, 60)).toBeNull();
  });
});
