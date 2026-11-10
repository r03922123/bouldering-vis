import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createBuffer, bufferToText } from './buffer';
import { COMPACT, mirrorSprite, REGULAR, stampSprite, type Sprite } from './sprites';

// SPEC-pixel-kit › The Climber › Sprites, T3 and AC 17b.

const flip = (s: Sprite) => s.rows.map((r) => [...r].reverse().join(''));

describe('regular sprites', () => {
  it('match the spec grids, sizes and anchors', () => {
    expect(REGULAR.head).toEqual({
      w: 7,
      h: 8,
      ax: 3,
      ay: 4,
      rows: [
        '..HHH..',
        '.HHHHH.',
        'HHHHHHH',
        'BBBBBBB',
        'RRRRRRR',
        'SRRRRRS',
        '.RRRRR.',
        '..SSS..',
      ],
    });
    expect(REGULAR.handGrip).toEqual({ w: 3, h: 3, ax: 1, ay: 1, rows: ['CSC', 'SSS', '.S.'] });
    expect(REGULAR.handOpen).toEqual({
      w: 3,
      h: 4,
      ax: 1,
      ay: 1,
      rows: ['S.S', 'SSS', 'SSS', '.S.'],
    });
    expect(REGULAR.footRight).toEqual({ w: 4, h: 3, ax: 1, ay: 2, rows: ['FFF.', 'FFFF', 'rrrr'] });
    expect(REGULAR.footLeft).toEqual({ w: 4, h: 3, ax: 2, ay: 2, rows: ['.FFF', 'FFFF', 'rrrr'] });
    expect(REGULAR.bag).toEqual({ w: 3, h: 4, ax: 1, ay: 1, rows: ['CCC', 'GGG', 'GGG', '.G.'] });
  });

  it('keeps the head, hands and bag left-right symmetric about their anchor', () => {
    for (const s of [REGULAR.head, REGULAR.handGrip, REGULAR.handOpen, REGULAR.bag]) {
      expect(flip(s)).toEqual(s.rows);
      expect(s.ax).toBe((s.w - 1) / 2);
    }
  });

  it('draws the left foot as the mirror of the right', () => {
    expect(REGULAR.footLeft).toEqual(mirrorSprite(REGULAR.footRight));
    expect(REGULAR.footLeft.rows).toEqual(flip(REGULAR.footRight));
  });
});

describe('compact sprites', () => {
  it('match the compact table', () => {
    expect(COMPACT.head).toEqual({
      w: 5,
      h: 5,
      ax: 2,
      ay: 2,
      rows: ['.HHH.', 'HHHHH', 'BBBBB', 'RRRRR', '.SSS.'],
    });
    expect(COMPACT.handGrip).toEqual({ w: 1, h: 1, ax: 0, ay: 0, rows: ['S'] });
    expect(COMPACT.handOpen).toEqual({ w: 1, h: 1, ax: 0, ay: 0, rows: ['S'] });
    expect(COMPACT.footRight).toEqual({ w: 2, h: 1, ax: 0, ay: 0, rows: ['FF'] });
    expect(COMPACT.footLeft).toEqual({ w: 2, h: 1, ax: 1, ay: 0, rows: ['FF'] });
    expect(COMPACT.bag).toEqual({ w: 1, h: 2, ax: 0, ay: 1, rows: ['C', 'G'] });
  });
});

describe('stampSprite', () => {
  it('puts the anchor cell on the given pixel', () => {
    const b = createBuffer(5, 4);
    stampSprite(b, REGULAR.handGrip, 2, 1, (c) => (c === 'C' ? 4 : 6));
    expect(bufferToText(b)).toBe(['.464.', '.666.', '..6..', '.....'].join('\n'));
  });
});

describe('provenance (AC 17b)', () => {
  it('precedes every sprite in sprites.ts with the provenance comment', () => {
    const lines = readFileSync(join(import.meta.dirname, 'sprites.ts'), 'utf8').split('\n');
    const defs = lines.flatMap((line, i) => (/=\s*(sprite|mirrorSprite)\(/.test(line) ? [i] : []));
    expect(defs).toHaveLength(11); // the compact grip and open hand share one sprite
    for (const i of defs) {
      expect(lines[i - 1], `line ${i + 1}: ${lines[i]}`).toMatch(
        /^\s*\/\/ original, drawn for Bloc Hall, \d{4}-\d{2}-\d{2}$/,
      );
    }
  });
});
