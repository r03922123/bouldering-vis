import { cleanMask, MAX_HOLD_AREA_FRACTION, maskStats, pickMask } from './mask';

const W = 100;
const H = 100;

function rect(x0: number, y0: number, x1: number, y1: number): Uint8Array {
  const m = new Uint8Array(W * H);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m[y * W + x] = 1;
  return m;
}

const sum = (m: Uint8Array) => m.reduce((a, v) => a + v, 0);

describe('pickMask', () => {
  it('limits a hold to 8% of the image', () => {
    expect(MAX_HOLD_AREA_FRACTION).toBe(0.08);
  });

  it('picks the highest-scoring candidate that contains the tap and is small enough', () => {
    const small = rect(40, 40, 49, 49); // 100 px
    const medium = rect(35, 35, 59, 59); // 625 px
    const wall = rect(0, 0, 99, 99); // 10000 px: too big
    const picked = pickMask([small, medium, wall], [0.8, 0.9, 0.99], { x: 45, y: 45 }, W, H);
    expect(picked).toBe(medium);
  });

  it('rejects a candidate that does not contain the tap', () => {
    const elsewhere = rect(0, 0, 9, 9);
    const here = rect(40, 40, 49, 49);
    expect(pickMask([elsewhere, here], [0.99, 0.5], { x: 45, y: 45 }, W, H)).toBe(here);
  });

  it('accepts a mask of exactly 8% but not one pixel more', () => {
    const exactly = rect(0, 0, 79, 9); // 800 px = 8%
    expect(pickMask([exactly], [0.9], { x: 5, y: 5 }, W, H)).toBe(exactly);
    const over = rect(0, 0, 79, 9);
    over[10 * W + 0] = 1; // 801 px
    expect(pickMask([over], [0.9], { x: 5, y: 5 }, W, H)).toBeNull();
  });

  it('returns null when nothing qualifies (tap on bare wall)', () => {
    expect(pickMask([rect(0, 0, 99, 99)], [0.9], { x: 5, y: 5 }, W, H)).toBeNull();
  });

  it('rounds a fractional tap to the nearest pixel', () => {
    const m = rect(40, 40, 49, 49);
    expect(pickMask([m], [0.9], { x: 44.6, y: 49.4 }, W, H)).toBe(m);
  });
});

describe('cleanMask', () => {
  const none = new Uint8Array(W * H);

  it('drops blobs not connected to the tapped one', () => {
    const m = rect(40, 40, 49, 49);
    rect(80, 80, 85, 85).forEach((v, i) => v && (m[i] = 1));
    const out = cleanMask(m, { x: 45, y: 45 }, W, H, none);
    expect(sum(out)).toBe(100);
  });

  it('fills a small hole but not one of 1% of the mask area or more', () => {
    const m = rect(20, 20, 79, 79); // 3600 px → holes < 36 px are filled
    m[50 * W + 50] = 0; // 1 px hole
    for (let y = 30; y < 36; y++) for (let x = 30; x < 36; x++) m[y * W + x] = 0; // 36 px hole
    const out = cleanMask(m, { x: 21, y: 21 }, W, H, none);
    expect(out[50 * W + 50]).toBe(1);
    expect(out[32 * W + 32]).toBe(0);
  });

  it('removes pixels already owned by selected holds and keeps the tapped side', () => {
    const m = rect(40, 40, 59, 49); // 200 px
    const taken = rect(50, 40, 59, 49); // right half belongs to another hold
    const out = cleanMask(m, { x: 42, y: 45 }, W, H, taken);
    expect(sum(out)).toBe(100);
    expect(out[45 * W + 55]).toBe(0);
  });

  it('keeps only the tapped part if subtracting a hold splits the mask', () => {
    const m = rect(40, 40, 69, 49);
    const taken = rect(50, 40, 59, 49); // a hold across the middle
    const out = cleanMask(m, { x: 42, y: 45 }, W, H, taken);
    expect(out[45 * W + 65]).toBe(0);
    expect(sum(out)).toBe(100);
  });
});

describe('maskStats', () => {
  it('computes area, bbox and centroid of a rectangle', () => {
    expect(maskStats(rect(10, 20, 19, 39), W, H)).toEqual({
      area: 200,
      bbox: { x: 10, y: 20, w: 10, h: 20 },
      centroid: { x: 14.5, y: 29.5 },
    });
  });

  it('computes the centroid of an L shape', () => {
    const m = rect(0, 0, 0, 2); // 3 px column at x=0
    m[2 * W + 1] = 1; // foot at (1,2)
    const s = maskStats(m, W, H);
    expect(s.area).toBe(4);
    expect(s.bbox).toEqual({ x: 0, y: 0, w: 2, h: 3 });
    expect(s.centroid).toEqual({ x: 0.25, y: 1.25 });
  });
});
