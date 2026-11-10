import type { HoldMask } from '../hold-segmentation';
import { compositeRoute, OTHER_HOLD_COLOR, WALL_COLOR } from './composite';

// 4×2 source: every pixel a distinct color.
function source(): ImageData {
  const data = new Uint8ClampedArray(4 * 2 * 4);
  for (let i = 0; i < 8; i++) data.set([10 * i, 20 + i, 200 - i, 255], i * 4);
  return { width: 4, height: 2, data, colorSpace: 'srgb' } as ImageData;
}

const mask = (...on: number[]) => {
  const m = new Uint8Array(8);
  for (const i of on) m[i] = 1;
  return m;
};
const hold = (...on: number[]) => ({ mask: mask(...on) }) as HoldMask;
const px = (img: ImageData, i: number) => Array.from(img.data.slice(i * 4, i * 4 + 4));

describe('compositeRoute', () => {
  it('uses the spec colors', () => {
    expect(WALL_COLOR).toEqual({ r: 0x2b, g: 0x2b, b: 0x2b });
    expect(OTHER_HOLD_COLOR).toEqual({ r: 0x8a, g: 0x8a, b: 0x8a });
  });

  it('keeps selected hold pixels identical to the source', () => {
    const src = source();
    const out = compositeRoute(src, [hold(1, 2), hold(6)], mask(), { showOtherHolds: true });
    for (const i of [1, 2, 6]) expect(px(out, i)).toEqual(px(src, i));
  });

  it('paints other holds #8A8A8A and the wall #2B2B2B when other holds are shown', () => {
    const out = compositeRoute(source(), [hold(1)], mask(3, 4), { showOtherHolds: true });
    expect(px(out, 3)).toEqual([0x8a, 0x8a, 0x8a, 255]);
    expect(px(out, 4)).toEqual([0x8a, 0x8a, 0x8a, 255]);
    expect(px(out, 0)).toEqual([0x2b, 0x2b, 0x2b, 255]);
  });

  it('blends other holds into the wall when they are hidden', () => {
    const out = compositeRoute(source(), [hold(1)], mask(3, 4), { showOtherHolds: false });
    for (const i of [0, 3, 4, 5, 7]) expect(px(out, i)).toEqual([0x2b, 0x2b, 0x2b, 255]);
    expect(px(out, 1)).toEqual(px(source(), 1));
  });

  it('lets a selected hold win over the other-holds mask', () => {
    const src = source();
    const out = compositeRoute(src, [hold(2)], mask(2), { showOtherHolds: true });
    expect(px(out, 2)).toEqual(px(src, 2));
  });

  it('does not modify the source', () => {
    const src = source();
    const before = Array.from(src.data);
    compositeRoute(src, [hold(1)], mask(3), { showOtherHolds: true });
    expect(Array.from(src.data)).toEqual(before);
  });
});
