import { expectGolden } from '../../../tests/pixelGolden';
import { bufferToText, createBuffer, type PixelBuffer } from './buffer';
import {
  drawLine,
  drawOutline,
  fillCapsule,
  fillPolygon,
  linePixels,
  outlinePixels,
  setPixel,
  stamp,
} from './raster';

// SPEC-pixel-kit › Decisions P5 and Rendering Rules › Clipping. Coordinates are art px; pixel
// (i, j) has its centre at (i + 0.5, j + 0.5).

const lit = (b: PixelBuffer) => {
  const out: [number, number][] = [];
  for (let y = 0; y < b.height; y++)
    for (let x = 0; x < b.width; x++) if (b.data[y * b.width + x]) out.push([x, y]);
  return out;
};

/** The column-reversed copy of `b`. */
const mirrored = (b: PixelBuffer) => {
  const m = createBuffer(b.width, b.height);
  for (let y = 0; y < b.height; y++)
    for (let x = 0; x < b.width; x++)
      m.data[y * b.width + (b.width - 1 - x)] = b.data[y * b.width + x]!;
  return m;
};

describe('setPixel', () => {
  it('clips to the buffer', () => {
    const b = createBuffer(2, 2);
    setPixel(b, -1, 0, 1);
    setPixel(b, 2, 0, 1);
    setPixel(b, 0, 2, 1);
    setPixel(b, 1, 1, 3);
    expect(bufferToText(b)).toBe('..\n.3');
  });
});

describe('fillCapsule', () => {
  it('fills pixels whose centre is within t/2 of the segment, inclusive', () => {
    const b = createBuffer(9, 5);
    fillCapsule(b, { x: 2.5, y: 2.5 }, { x: 6.5, y: 2.5 }, 2, 1);
    // Rows 1 and 3 sit exactly t/2 = 1 away: a tie, so they are filled.
    expect(bufferToText(b)).toBe(
      ['.........', '..11111..', '.1111111.', '..11111..', '.........'].join('\n'),
    );
  });

  it('draws a dot for a zero-length segment', () => {
    const b = createBuffer(5, 5);
    fillCapsule(b, { x: 2.5, y: 2.5 }, { x: 2.5, y: 2.5 }, 2, 2);
    expect(bufferToText(b)).toBe(['.....', '..2..', '.222.', '..2..', '.....'].join('\n'));
  });

  it('is symmetric under mirroring', () => {
    const W = 21;
    const segs: [number, number, number, number, number][] = [
      [2.3, 3.1, 15.7, 9.4, 3],
      [4, 2, 4, 12, 2],
      [1.5, 12.5, 18.5, 2.5, 4],
      [7.25, 6.75, 11.9, 6.75, 5],
    ];
    for (const [ax, ay, bx, by, t] of segs) {
      const b = createBuffer(W, 15);
      const m = createBuffer(W, 15);
      fillCapsule(b, { x: ax, y: ay }, { x: bx, y: by }, t, 1);
      fillCapsule(m, { x: W - ax, y: ay }, { x: W - bx, y: by }, t, 1);
      expect(bufferToText(m)).toBe(bufferToText(mirrored(b)));
    }
  });

  it('matches the t = 3 capsule golden', () => {
    const b = createBuffer(20, 12);
    fillCapsule(b, { x: 3.2, y: 2.6 }, { x: 16.4, y: 9.1 }, 3, 4);
    expectGolden('lines-capsule3', b);
  });
});

describe('1-px lines', () => {
  it('fills pixels within 0.5 of the line on the minor axis, both on a tie', () => {
    const b = createBuffer(6, 3);
    drawLine(b, { x: 0.5, y: 1 }, { x: 5.5, y: 1 }, 1);
    expect(bufferToText(b)).toBe(['111111', '111111', '......'].join('\n'));
  });

  it('draws a clean 45° diagonal between pixel centres (golden)', () => {
    const b = createBuffer(8, 8);
    drawLine(b, { x: 0.5, y: 0.5 }, { x: 7.5, y: 7.5 }, 13);
    expect(lit(b)).toEqual([...Array(8).keys()].map((i) => [i, i]));
    expectGolden('lines-45', b);
  });

  it('draws a shallow line with one pixel per column (golden)', () => {
    const b = createBuffer(16, 6);
    drawLine(b, { x: 0.5, y: 1.3 }, { x: 15.5, y: 4.1 }, 9);
    for (let x = 0; x < 16; x++) expect(lit(b).filter(([px]) => px === x)).toHaveLength(1);
    expectGolden('lines-shallow', b);
  });

  it('walks steep lines by row', () => {
    const b = createBuffer(4, 10);
    drawLine(b, { x: 1.2, y: 0.5 }, { x: 2.6, y: 9.5 }, 1);
    for (let y = 0; y < 10; y++) expect(lit(b).filter(([, py]) => py === y)).toHaveLength(1);
  });

  it('is symmetric under mirroring', () => {
    const W = 17;
    const lines: [number, number, number, number][] = [
      [1.5, 1.5, 12.5, 6.5],
      [2.2, 9.7, 14.1, 0.4],
      [3, 3, 9, 7],
      [8.5, 0.5, 6.5, 9.5],
    ];
    for (const [ax, ay, bx, by] of lines) {
      const b = createBuffer(W, 11);
      const m = createBuffer(W, 11);
      drawLine(b, { x: ax, y: ay }, { x: bx, y: by }, 1);
      drawLine(m, { x: W - ax, y: ay }, { x: W - bx, y: by }, 1);
      expect(bufferToText(m)).toBe(bufferToText(mirrored(b)));
    }
  });

  it('visits pixels in order from the first point, counting steps along the major axis', () => {
    const seen: [number, number, number][] = [];
    linePixels({ x: 4.5, y: 0.5 }, { x: 0.5, y: 2.5 }, (x, y, k) => seen.push([x, y, k]));
    expect(seen[0]).toEqual([4, 0, 0]);
    expect(seen.at(-1)).toEqual([0, 2, 4]);
    expect(seen.map((s) => s[2])).toEqual([...seen.map((s) => s[2])].sort((a, b) => a - b));
  });

  it('draws one pixel for a zero-length line through a pixel centre', () => {
    const b = createBuffer(3, 3);
    drawLine(b, { x: 1.5, y: 1.5 }, { x: 1.5, y: 1.5 }, 1);
    expect(lit(b)).toEqual([[1, 1]]);
  });

  it('clips at the edge (golden)', () => {
    const b = createBuffer(10, 6);
    drawLine(b, { x: -4.5, y: -1.5 }, { x: 13.5, y: 7.5 }, 12);
    expectGolden('lines-clipped', b);
    const full = createBuffer(30, 20);
    drawLine(full, { x: 5.5, y: 5.5 }, { x: 23.5, y: 14.5 }, 12);
    // Same pixels as the unclipped line, shifted by (10, 7) and cut to the 10 × 6 window.
    const expected = lit(full)
      .map(([x, y]) => [x - 10, y - 7])
      .filter(([x, y]) => x! >= 0 && x! < 10 && y! >= 0 && y! < 6);
    expect(lit(b)).toEqual(expected.sort((p, q) => p[1]! - q[1]! || p[0]! - q[0]!));
  });
});

describe('fillPolygon', () => {
  it('fills by pixel-centre inclusion, counting a centre on an edge as inside', () => {
    const b = createBuffer(6, 6);
    fillPolygon(
      b,
      [
        { x: 0.5, y: 0.5 },
        { x: 3.5, y: 0.5 },
        { x: 3.5, y: 3.5 },
        { x: 0.5, y: 3.5 },
      ],
      1,
    );
    expect(bufferToText(b)).toBe(
      ['1111..', '1111..', '1111..', '1111..', '......', '......'].join('\n'),
    );
  });

  it('fills a slanted quad the same as its mirror image', () => {
    const W = 15;
    const quad = [
      { x: 3.5, y: 1.5 },
      { x: 11.2, y: 2.5 },
      { x: 9.5, y: 10.5 },
      { x: 4.1, y: 9 },
    ];
    const b = createBuffer(W, 12);
    const m = createBuffer(W, 12);
    fillPolygon(b, quad, 1);
    fillPolygon(
      m,
      quad.map((p) => ({ x: W - p.x, y: p.y })),
      1,
    );
    expect(bufferToText(m)).toBe(bufferToText(mirrored(b)));
    expect(lit(b).length).toBeGreaterThan(40);
  });
});

describe('outline', () => {
  it('writes the 4-neighbour outline of a mask', () => {
    const mask = createBuffer(5, 5);
    mask.data[2 * 5 + 2] = 6;
    const b = createBuffer(5, 5);
    drawOutline(b, mask, 1);
    expect(bufferToText(b)).toBe(['.....', '..1..', '.1.1.', '..1..', '.....'].join('\n'));
  });

  it('only visits pixels inside the region and the grid', () => {
    const mask = createBuffer(4, 4);
    mask.data[0] = 1;
    mask.data[15] = 1;
    const seen: number[] = [];
    outlinePixels(mask, { x0: 0, y0: 0, x1: 2, y1: 2 }, (i) => seen.push(i));
    expect(seen.sort((a, b) => a - b)).toEqual([1, 4]);
  });
});

describe('stamp', () => {
  it('writes non-clear cells through the colour map, clipped to the buffer', () => {
    const b = createBuffer(3, 2);
    stamp(b, ['ab.', '.ba'], -1, 0, (c) => (c === 'a' ? 4 : 5));
    expect(bufferToText(b)).toBe(['5..', '54.'].join('\n'));
  });
});

describe('clipping', () => {
  it('leaves the buffer unchanged for shapes wholly outside, without throwing', () => {
    const b = createBuffer(6, 6);
    fillCapsule(b, { x: -20, y: -20 }, { x: -10, y: -5 }, 3, 1);
    drawLine(b, { x: 10, y: 10 }, { x: 30, y: 20 }, 1);
    fillPolygon(
      b,
      [
        { x: 7, y: 0 },
        { x: 9, y: 0 },
        { x: 9, y: 5 },
      ],
      1,
    );
    stamp(b, ['aaa'], 6, 0, () => 1);
    expect(lit(b)).toEqual([]);
  });

  it('does not throw on a 0 × 0 buffer', () => {
    const b = createBuffer(0, 0);
    expect(() => {
      fillCapsule(b, { x: 0, y: 0 }, { x: 3, y: 3 }, 2, 1);
      drawLine(b, { x: 0, y: 0 }, { x: 3, y: 3 }, 1);
      fillPolygon(
        b,
        [
          { x: 0, y: 0 },
          { x: 3, y: 0 },
          { x: 3, y: 3 },
        ],
        1,
      );
      drawOutline(b, b, 1);
      stamp(b, ['a'], 0, 0, () => 1);
    }).not.toThrow();
  });

  it('ignores non-finite coordinates', () => {
    const b = createBuffer(4, 4);
    fillCapsule(b, { x: NaN, y: 1 }, { x: 2, y: 2 }, 2, 1);
    drawLine(b, { x: 1, y: Infinity }, { x: 2, y: 2 }, 1);
    expect(lit(b)).toEqual([]);
  });
});
