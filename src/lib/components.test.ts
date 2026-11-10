import { fillHoles, keepComponentAt, labelComponents, removeSmallComponents } from './components';

function mask(pic: string) {
  const rows = pic
    .trim()
    .split('\n')
    .map((r) => r.trim());
  const w = rows[0]!.length;
  const m = new Uint8Array(w * rows.length);
  rows.forEach((r, y) => [...r].forEach((c, x) => (m[y * w + x] = c === '#' ? 1 : 0)));
  return { m, w, h: rows.length };
}

const blobs = `
  ##.....
  ##...#.
  .....##
  .#.....`;

describe('labelComponents (8-connected)', () => {
  it('finds each separate blob and its size', () => {
    const { m, w, h } = mask(blobs);
    const { count, sizes } = labelComponents(m, w, h);
    expect(count).toBe(3);
    expect([...sizes.slice(1)].sort()).toEqual([1, 3, 4]);
  });

  it('joins diagonal neighbours', () => {
    const { m, w, h } = mask(`
      #.
      .#`);
    expect(labelComponents(m, w, h).count).toBe(1);
  });
});

describe('keepComponentAt', () => {
  it('keeps only the blob under the point', () => {
    const { m, w, h } = mask(blobs);
    const out = keepComponentAt(m, w, h, { x: 6, y: 2 });
    expect(out.reduce((a, v) => a + v, 0)).toBe(3);
    expect(out[0]).toBe(0);
  });

  it('returns an empty mask when the point is background', () => {
    const { m, w, h } = mask(blobs);
    expect(keepComponentAt(m, w, h, { x: 3, y: 0 }).reduce((a, v) => a + v, 0)).toBe(0);
  });
});

describe('removeSmallComponents', () => {
  it('drops blobs smaller than the minimum area', () => {
    const { m, w, h } = mask(blobs);
    const out = removeSmallComponents(m, w, h, 3);
    expect(out.reduce((a, v) => a + v, 0)).toBe(7);
    expect(out[3 * w + 1]).toBe(0);
  });
});

describe('fillHoles', () => {
  const ring = `
    .......
    .#####.
    .#..##.
    .#####.
    .......`;

  it('fills an enclosed hole up to the maximum area', () => {
    const { m, w, h } = mask(ring);
    const out = fillHoles(m, w, h, 2);
    expect(out[2 * w + 2]).toBe(1);
    expect(out[2 * w + 3]).toBe(1);
  });

  it('leaves holes larger than the maximum area', () => {
    const { m, w, h } = mask(ring);
    expect(fillHoles(m, w, h, 1)[2 * w + 2]).toBe(0);
  });

  it('never fills background that touches the image border', () => {
    const { m, w, h } = mask(ring);
    expect(fillHoles(m, w, h, 1000)[0]).toBe(0);
  });
});

describe('mask outputs', () => {
  it('are Uint8Array', () => {
    const { m, w, h } = mask(blobs);
    expect(removeSmallComponents(m, w, h, 3)).toBeInstanceOf(Uint8Array);
    expect(keepComponentAt(m, w, h, { x: 0, y: 0 })).toBeInstanceOf(Uint8Array);
    expect(fillHoles(m, w, h, 3)).toBeInstanceOf(Uint8Array);
  });
});
