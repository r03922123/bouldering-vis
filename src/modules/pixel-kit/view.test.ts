import {
  ART_HEIGHT_BAND,
  artGrid,
  artPixel,
  minPixelSize,
  pixelSize,
  TARGET_ART_HEIGHT,
  toArt,
  type PixelView,
} from './view';

// SPEC-pixel-kit › Rendering Rules › Grid, AC 6–9.

const PHONE: PixelView = { scale: 343 / 1536, tx: 0, ty: 0, boxW: 343, boxH: 333, dpr: 2.625 };
const DESKTOP: PixelView = { scale: 0.5, tx: 0, ty: 0, boxW: 768, boxH: 600, dpr: 1 };
const artHeight = (h: number, v: PixelView, p: number) => (h * v.scale * v.dpr) / p;
/** A view whose H_dev equals `hDev` for a climber 100 image px tall. */
const devView = (hDev: number): [number, PixelView] => [
  100,
  { ...PHONE, scale: hDev / 100 / 2.625 },
];

describe('constants', () => {
  it('targets 48 art px within 36–60', () => {
    expect(TARGET_ART_HEIGHT).toBe(48);
    expect(ART_HEIGHT_BAND).toEqual([36, 60]);
  });
});

describe('minPixelSize', () => {
  it('is max(2, round(2·dpr)) (AC 6)', () => {
    expect(minPixelSize(2.625)).toBe(5);
    expect(minPixelSize(1)).toBe(2);
    expect(minPixelSize(3)).toBe(6);
  });
});

describe('pixelSize', () => {
  it('fits the climber to about 48 art px on a phone (AC 6)', () => {
    expect(pixelSize(399.36, PHONE)).toBe(5);
    expect(artHeight(399.36, PHONE, 5)).toBeCloseTo(46.8, 1);
    expect(pixelSize(424.32, PHONE)).toBe(5);
    expect(artHeight(424.32, PHONE, 5)).toBeCloseTo(49.7, 1);
  });

  it('gives 4 on a desktop fit (AC 6)', () => {
    expect(pixelSize(399.36, DESKTOP)).toBe(4);
  });

  it('falls back to Pmin for a zero, negative or non-finite height (AC 6)', () => {
    expect(pixelSize(0, PHONE)).toBe(5);
    expect(pixelSize(NaN, PHONE)).toBe(5);
    expect(pixelSize(-10, PHONE)).toBe(5);
    expect(pixelSize(Infinity, PHONE)).toBe(5);
  });

  it('never goes below Pmin', () => {
    expect(pixelSize(10, PHONE)).toBe(5);
  });

  it('keeps prev while the art height stays within 36–60 (AC 7)', () => {
    expect(pixelSize(...devView(280), 5)).toBe(5);
    expect(pixelSize(...devView(310), 5)).toBe(6);
    expect(pixelSize(...devView(310))).toBe(6);
    expect(pixelSize(...devView(180), 5)).toBe(5); // 36 exactly: still in the band
    expect(pixelSize(...devView(300), 5)).toBe(5); // 60 exactly: still in the band
  });

  it('ignores a prev below Pmin (AC 7)', () => {
    expect(pixelSize(...devView(280), 1)).toBe(6); // round(280 / 48)
  });
});

describe('artGrid', () => {
  it('covers the box in whole art pixels (AC 8)', () => {
    const g = artGrid(PHONE, 5);
    expect(g).toEqual({ view: PHONE, px: 5, width: 181, height: 175 });
    expect((g.width * 5) / 2.625).toBeCloseTo(344.76, 2);
  });

  it('is 0 × 0 for an empty box (AC 8)', () => {
    const g = artGrid({ ...PHONE, boxW: 0, boxH: 0 }, 5);
    expect([g.width, g.height]).toEqual([0, 0]);
  });
});

describe('toArt / artPixel', () => {
  const v: PixelView = { scale: 0.5, tx: 10, ty: -4, boxW: 100, boxH: 100, dpr: 2 };
  const g = artGrid(v, 4);

  it('maps image px to fractional art px', () => {
    expect(toArt(g, { x: 30, y: 40 })).toEqual({
      x: ((30 * 0.5 + 10) * 2) / 4,
      y: ((40 * 0.5 - 4) * 2) / 4,
    });
  });

  it('floors to the art pixel that holds the point', () => {
    expect(artPixel(g, { x: 31, y: 41 })).toEqual({ x: 12, y: 8 }); // (12.75, 8.25)
  });

  it('puts a point on a pixel boundary into the pixel right of or below it (AC 9)', () => {
    const id = artGrid({ scale: 1, tx: 0, ty: 0, boxW: 10, boxH: 10, dpr: 1 }, 1);
    expect(artPixel(id, { x: 3, y: 4 })).toEqual({ x: 3, y: 4 });
    // 12 image px → (12·0.5 + 10)·2/4 = 8 exactly.
    expect(artPixel(g, { x: 12, y: 24 })).toEqual({ x: 8, y: 4 });
    expect(artPixel(g, { x: 11.999, y: 23.999 })).toEqual({ x: 7, y: 3 });
  });
});
