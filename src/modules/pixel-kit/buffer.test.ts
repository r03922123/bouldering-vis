import { blit, bufferFromText, bufferToText, createBuffer, resizeBuffer } from './buffer';
import { PALETTE } from './palette';

// SPEC-pixel-kit › Decisions P1, AC 5.

describe('createBuffer / resizeBuffer', () => {
  it('creates a cleared row-major buffer', () => {
    const b = createBuffer(3, 2);
    expect(b).toMatchObject({ width: 3, height: 2 });
    expect(b.data).toEqual(new Uint8Array(6));
  });

  it('returns the same buffer when the size is unchanged, and a new one otherwise', () => {
    const b = createBuffer(3, 2);
    expect(resizeBuffer(b, 3, 2)).toBe(b);
    const r = resizeBuffer(b, 4, 2);
    expect(r).not.toBe(b);
    expect(r).toMatchObject({ width: 4, height: 2 });
    expect(r.data).toHaveLength(8);
  });

  it('allows a 0 × 0 buffer', () => {
    expect(createBuffer(0, 0).data).toHaveLength(0);
  });
});

describe('text form', () => {
  it('writes . for clear, 1–9 and a–f for the other indices', () => {
    const b = createBuffer(4, 4);
    b.data.set([...Array(16).keys()]);
    expect(bufferToText(b)).toBe('.123\n4567\n89ab\ncdef');
  });

  it('round-trips (AC 5)', () => {
    const b = createBuffer(5, 3);
    for (let i = 0; i < b.data.length; i++) b.data[i] = (i * 7) % 16;
    expect(bufferFromText(bufferToText(b))).toEqual(b);
  });

  it('skips # header lines', () => {
    const b = bufferFromText('# hang-48 2x2 P=1\n.1\nf.\n');
    expect(b).toEqual({ width: 2, height: 2, data: new Uint8Array([0, 1, 15, 0]) });
  });

  it('throws on ragged rows or an unknown character', () => {
    expect(() => bufferFromText('..\n...')).toThrow(/ragged/i);
    expect(() => bufferFromText('.g')).toThrow(/unknown/i);
    expect(() => bufferFromText('.F')).toThrow(/unknown/i);
  });

  it('reads the empty text as 0 × 0', () => {
    expect(bufferFromText('')).toEqual(createBuffer(0, 0));
    expect(bufferToText(createBuffer(0, 0))).toBe('');
  });
});

describe('blit', () => {
  it('writes palette rgb with alpha 255, and 0,0,0,0 for clear (AC 5)', () => {
    const b = createBuffer(16, 1);
    b.data.set([...Array(16).keys()]);
    const out = new Uint8ClampedArray(16 * 4).fill(9);
    blit(b, out);
    expect([...out.subarray(0, 4)]).toEqual([0, 0, 0, 0]);
    for (let i = 1; i < 16; i++) {
      const hex = PALETTE[i]!;
      const rgb = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
      expect([...out.subarray(i * 4, i * 4 + 4)]).toEqual([...rgb, 255]);
    }
  });

  it('throws when the output has the wrong length', () => {
    expect(() => blit(createBuffer(2, 2), new Uint8ClampedArray(15))).toThrow();
  });
});
