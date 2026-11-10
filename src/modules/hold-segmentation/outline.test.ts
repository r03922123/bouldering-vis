import { outlineLayer, outlinePixels } from './outline';
import type { HoldMask } from './types';

function square(w: number, x0: number, y0: number, size: number) {
  const mask = new Uint8Array(w * w);
  for (let y = y0; y < y0 + size; y++) for (let x = x0; x < x0 + size; x++) mask[y * w + x] = 1;
  return { mask, bbox: { x: x0, y: y0, w: size, h: size } } as HoldMask;
}

describe('outlinePixels', () => {
  it('marks the 2-px inner border of each hold and leaves its inside clear', () => {
    const w = 20;
    const out = outlinePixels([square(w, 5, 5, 10)], w, w);
    expect(out[5 * w + 5]).toBe(1); // corner
    expect(out[6 * w + 6]).toBe(1); // second ring
    expect(out[7 * w + 7]).toBe(0); // inside
    expect(out[0]).toBe(0); // outside
  });

  it('outlines every hold', () => {
    const w = 30;
    const out = outlinePixels([square(w, 2, 2, 6), square(w, 20, 20, 6)], w, w);
    expect(out[2 * w + 2]).toBe(1);
    expect(out[20 * w + 20]).toBe(1);
  });

  it('paints the same edge pixels as RGBA in the given color, the rest transparent', () => {
    const w = 20;
    const hold = square(w, 5, 5, 10);
    const img = outlineLayer([hold], w, w, [56, 189, 248]);
    const lines = outlinePixels([hold], w, w);
    for (let i = 0; i < w * w; i++) {
      expect(img.data[i * 4 + 3]).toBe(lines[i] ? 255 : 0);
      if (lines[i]) expect(Array.from(img.data.slice(i * 4, i * 4 + 3))).toEqual([56, 189, 248]);
    }
  });
});
