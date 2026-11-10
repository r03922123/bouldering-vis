import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expectGolden } from '../../../tests/pixelGolden';
import { bufferToText, createBuffer } from './buffer';
import {
  ADVANCE,
  GLYPH_H,
  GLYPH_W,
  GLYPHS,
  LINE_HEIGHT,
  measurePixelText,
  rasterText,
} from './font';
import { COLOR } from './palette';

// SPEC-pixel-kit › Pixel Font (original, 5×7), AC 26–27 and AC 17b (font.ts).

const SET = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', ...'0123456789', ' ', ...".,!?:-+/%'()×"];

const bits = (rows: readonly number[]) =>
  rows.flatMap((r) => [4, 3, 2, 1, 0].map((b) => (r >> b) & 1));
const diff = (a: string, b: string) => {
  const x = bits(GLYPHS[a]!);
  const y = bits(GLYPHS[b]!);
  return x.reduce((n, v, i) => n + (v !== y[i] ? 1 : 0), 0);
};

const draw = (text: string, outline?: number) => {
  const size = measurePixelText(text, outline !== undefined);
  const b = createBuffer(size.width, size.height);
  rasterText(b, 0, 0, text, COLOR.chalk, outline as never);
  return b;
};

describe('metrics', () => {
  it('uses 5 × 7 glyphs in a 6-px advance and a 9-px line', () => {
    expect([GLYPH_W, GLYPH_H, ADVANCE, LINE_HEIGHT]).toEqual([5, 7, 6, 9]);
  });

  it('measures lines and blocks (AC 27)', () => {
    expect(measurePixelText('MOVES 07')).toEqual({ width: 47, height: 7 });
    expect(measurePixelText('AB\nC')).toEqual({ width: 11, height: 16 });
    expect(measurePixelText('')).toEqual({ width: 0, height: 0 });
    expect(measurePixelText('MOVES 07', true)).toEqual({ width: 49, height: 9 });
    expect(measurePixelText('', true)).toEqual({ width: 0, height: 0 });
  });

  it('counts code points, not UTF-16 units', () => {
    expect(measurePixelText('×😀')).toEqual({ width: 11, height: 7 });
  });
});

describe('glyphs (AC 26)', () => {
  it('has exactly the 50 glyphs', () => {
    expect(Object.keys(GLYPHS).sort()).toEqual([...SET].sort());
    expect(SET).toHaveLength(50);
  });

  it('stores 7 row masks below 32 per glyph', () => {
    for (const ch of SET) {
      expect(GLYPHS[ch]).toHaveLength(7);
      for (const row of GLYPHS[ch]!) {
        expect(Number.isInteger(row)).toBe(true);
        expect(row).toBeGreaterThanOrEqual(0);
        expect(row).toBeLessThan(32);
      }
    }
  });

  it('keeps every glyph distinct, and only the space blank', () => {
    const keys = SET.map((ch) => GLYPHS[ch]!.join(','));
    expect(new Set(keys).size).toBe(50);
    for (const ch of SET) expect(bits(GLYPHS[ch]!).some(Boolean)).toBe(ch !== ' ');
  });

  it.each([
    ['0', 'O'],
    ['1', 'I'],
    ['5', 'S'],
    ['8', 'B'],
    ['2', 'Z'],
  ])('tells %s from %s by at least 3 pixels', (a, b) => {
    expect(diff(a, b)).toBeGreaterThanOrEqual(3);
  });

  it('slashes the zero and gives the one a flag and a base', () => {
    const zero = GLYPHS['0']!;
    // The slash: a pixel inside the counter on the centre row.
    expect((zero[3]! >> 2) & 1).toBe(1);
    const one = GLYPHS['1']!;
    expect(one[6]).toBe(0b11111); // base
    expect((one[0]! | one[1]!) & 0b11000).toBeTruthy(); // flag left of the stem
  });

  // The originality review (Check Results › AC 48) found the first draw too close to the
  // HD44780-style LCD forms. These are those common forms, written from memory for comparison
  // only. Glyphs a 5 × 7 grid all but forces (H L O T U, the space) may match; E and F differ in
  // the middle bar only; every other glyph is at least 2 pixels away from its common form.
  const COMMON: Record<string, string> = {
    A: '.###. #...# #...# ##### #...# #...# #...#',
    B: '####. #...# #...# ####. #...# #...# ####.',
    C: '.###. #...# #.... #.... #.... #...# .###.',
    D: '###.. #..#. #...# #...# #...# #..#. ###..',
    E: '##### #.... #.... ####. #.... #.... #####',
    F: '##### #.... #.... ####. #.... #.... #....',
    G: '.###. #...# #.... #.### #...# #...# .####',
    H: '#...# #...# #...# ##### #...# #...# #...#',
    I: '.###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.',
    J: '..### ...#. ...#. ...#. ...#. #..#. .##..',
    K: '#...# #..#. #.#.. ##... #.#.. #..#. #...#',
    L: '#.... #.... #.... #.... #.... #.... #####',
    M: '#...# ##.## #.#.# #.#.# #...# #...# #...#',
    N: '#...# #...# ##..# #.#.# #..## #...# #...#',
    O: '.###. #...# #...# #...# #...# #...# .###.',
    P: '####. #...# #...# ####. #.... #.... #....',
    Q: '.###. #...# #...# #...# #.#.# #..#. .##.#',
    R: '####. #...# #...# ####. #.#.. #..#. #...#',
    S: '.#### #.... #.... .###. ....# ....# ####.',
    T: '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
    U: '#...# #...# #...# #...# #...# #...# .###.',
    V: '#...# #...# #...# #...# #...# .#.#. ..#..',
    W: '#...# #...# #...# #.#.# #.#.# #.#.# .#.#.',
    X: '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
    Y: '#...# #...# #...# .#.#. ..#.. ..#.. ..#..',
    Z: '##### ....# ...#. ..#.. .#... #.... #####',
    '0': '.###. #...# #..## #.#.# ##..# #...# .###.',
    '1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
    '2': '.###. #...# ....# ...#. ..#.. .#... #####',
    '3': '##### ...#. ..#.. ...#. ....# #...# .###.',
    '4': '...#. ..##. .#.#. #..#. ##### ...#. ...#.',
    '5': '##### #.... ####. ....# ....# #...# .###.',
    '6': '..##. .#... #.... ####. #...# #...# .###.',
    '7': '##### ....# ...#. ..#.. .#... .#... .#...',
    '8': '.###. #...# #...# .###. #...# #...# .###.',
    '9': '.###. #...# #...# .#### ....# ...#. .##..',
    ' ': '..... ..... ..... ..... ..... ..... .....',
    '.': '..... ..... ..... ..... ..... .##.. .##..',
    ',': '..... ..... ..... ..... .##.. ..#.. .#...',
    '!': '..#.. ..#.. ..#.. ..#.. ..... ..... ..#..',
    '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
    ':': '..... .##.. .##.. ..... .##.. .##.. .....',
    '-': '..... ..... ..... ##### ..... ..... .....',
    '+': '..... ..#.. ..#.. ##### ..#.. ..#.. .....',
    '/': '..... ....# ...#. ..#.. .#... #.... .....',
    '%': '##... ##..# ...#. ..#.. .#... #..## ...##',
    "'": '.##.. ..#.. .#... ..... ..... ..... .....',
    '(': '...#. ..#.. .#... .#... .#... ..#.. ...#.',
    ')': '.#... ..#.. ...#. ...#. ...#. ..#.. .#...',
  };
  const FORCED = new Set(['H', 'L', 'O', 'T', 'U', ' ']);
  const MIDDLE_BAR_ONLY = new Set(['E', 'F']);

  // A fresh review (2026-11-01) found the first redraw's 2 and ? equal to the Apple II (Signetics
  // 2513) 5 × 7 forms, from the reviewer's memory. These are those forms, for comparison only.
  const APPLE_II: Record<string, string> = {
    '2': '.###. #...# ....# ..##. .#... #.... #####',
    '?': '.###. #...# ...#. ..#.. ..#.. ..... ..#..',
  };
  it.each(Object.keys(APPLE_II))('draws %s away from the Apple II form', (ch) => {
    const theirs = bits(
      APPLE_II[ch]!.split(' ').map((row) => [...row].reduce((m, c) => (m << 1) | +(c === '#'), 0)),
    );
    const ours = bits(GLYPHS[ch]!);
    expect(ours.reduce((n, v, i) => n + (v !== theirs[i] ? 1 : 0), 0)).toBeGreaterThanOrEqual(2);
  });

  it.each(Object.keys(COMMON))('draws %s away from the common LCD form', (ch) => {
    const common = bits(
      COMMON[ch]!.split(' ').map((row) => [...row].reduce((m, c) => (m << 1) | +(c === '#'), 0)),
    );
    const ours = bits(GLYPHS[ch]!);
    const d = ours.reduce((n, v, i) => n + (v !== common[i] ? 1 : 0), 0);
    if (FORCED.has(ch)) return;
    expect(d).toBeGreaterThanOrEqual(MIDDLE_BAR_ONLY.has(ch) ? 1 : 2);
  });

  it('renders lowercase like uppercase', () => {
    expect(bufferToText(draw('moves 07'))).toBe(bufferToText(draw('MOVES 07')));
  });

  it("renders 'é' and 'ß' as one '?' each", () => {
    expect(bufferToText(draw('é'))).toBe(bufferToText(draw('?')));
    expect(bufferToText(draw('ß'))).toBe(bufferToText(draw('?')));
    expect(measurePixelText('ß')).toEqual({ width: 5, height: 7 });
  });
});

describe('rasterText', () => {
  it('draws the glyph mask with bit 4 as the left column', () => {
    const b = draw('L');
    expect(bufferToText(b).split('\n')).toEqual([...Array(6).fill('4....'), '44444']);
  });

  it('starts a new line on \\n, 9 px down', () => {
    const b = createBuffer(5, 16);
    rasterText(b, 0, 0, 'L\nL', COLOR.chalk);
    expect(bufferToText(b).split('\n')[9]).toBe('4....');
    expect(bufferToText(b).split('\n')[7]).toBe('.....');
  });

  it('puts a 1-px outline around the glyphs, inside the measured box', () => {
    const b = draw('I', COLOR.ink);
    const rows = bufferToText(b).split('\n');
    expect(rows).toHaveLength(9);
    expect(rows[0]).toBe('.11111.');
    expect(rows[1]).toBe('1444441');
    expect(rows[2]).toBe('.11411.');
    // No glyph pixel without an outline or glyph neighbour.
    for (let y = 0; y < b.height; y++)
      for (let x = 0; x < b.width; x++) {
        if (b.data[y * b.width + x] !== COLOR.chalk) continue;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          expect(b.data[(y + dy) * b.width + x + dx]).not.toBe(COLOR.clear);
        }
      }
  });

  it('clips at the buffer edge, and writes nothing wholly outside', () => {
    const b = createBuffer(4, 4);
    expect(() => rasterText(b, -3, -3, 'WALL', COLOR.chalk, COLOR.ink)).not.toThrow();
    rasterText(b, 10, 10, 'X', COLOR.chalk, COLOR.ink);
    expect(() => rasterText(createBuffer(0, 0), 0, 0, 'A', COLOR.chalk)).not.toThrow();
  });

  it('matches the glyph sheet golden', () => {
    const sheet = "ABCDEFGHIJ\nKLMNOPQRST\nUVWXYZ0123\n456789 .,!\n?:-+/%'()×";
    expectGolden('font-sheet', draw(sheet, COLOR.ink));
  });
});

describe('provenance (AC 17b)', () => {
  it('precedes the glyph table with the provenance comment', () => {
    const lines = readFileSync(join(import.meta.dirname, 'font.ts'), 'utf8').split('\n');
    const table = lines.findIndex((l) => /^const DRAWN\b/.test(l));
    expect(table).toBeGreaterThan(0);
    expect(lines[table - 1]).toMatch(
      /^\/\/ original, drawn for Bloc Hall, \d{4}-\d{2}-\d{2}; revised \d{4}-\d{2}-\d{2} to move away from HD44780-like forms$/,
    );
  });
});
