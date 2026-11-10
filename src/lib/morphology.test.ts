import { close, dilate, erode, open } from './morphology';

/** Parses a picture like "..#.\n.##." into a 0/1 mask. */
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

function pic(m: Uint8Array, w: number) {
  const rows: string[] = [];
  for (let i = 0; i < m.length; i += w)
    rows.push([...m.slice(i, i + w)].map((v) => (v ? '#' : '.')).join(''));
  return rows.join('\n');
}

describe('morphology (square kernel, out-of-image pixels ignored)', () => {
  it('erode 3×3 shrinks a 5×5 block to its 3×3 core', () => {
    const { m, w, h } = mask(`
      .......
      .#####.
      .#####.
      .#####.
      .#####.
      .#####.
      .......`);
    expect(pic(erode(m, w, h, 3), w)).toBe(
      ['.......', '.......', '..###..', '..###..', '..###..', '.......', '.......'].join('\n'),
    );
  });

  it('dilate 3×3 grows a single pixel to a 3×3 block', () => {
    const { m, w, h } = mask(`
      .....
      .....
      ..#..
      .....
      .....`);
    expect(pic(dilate(m, w, h, 3), w)).toBe(
      ['.....', '.###.', '.###.', '.###.', '.....'].join('\n'),
    );
  });

  it('open 3×3 removes an isolated speck but keeps a large block', () => {
    const { m, w, h } = mask(`
      #......
      .......
      ..####.
      ..####.
      ..####.
      .......`);
    const out = open(m, w, h, 3);
    expect(out[0]).toBe(0);
    expect(out[3 * w + 3]).toBe(1);
  });

  it('close 3×3 fills a one-pixel gap inside a block', () => {
    const { m, w, h } = mask(`
      .......
      .#####.
      .##.##.
      .#####.
      .......`);
    expect(close(m, w, h, 3)[2 * w + 3]).toBe(1);
  });

  it('does not shrink a mask touching the image border', () => {
    const { m, w, h } = mask(`
      ###
      ###
      ###`);
    expect(Array.from(erode(m, w, h, 3))).toEqual(Array.from(m));
  });
});
