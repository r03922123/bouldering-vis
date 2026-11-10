import type { PixelBuffer } from './buffer';
import type { PaletteIndex } from './palette';

// SPEC-pixel-kit › Pixel Font (original, 5×7), decided 2026-10-31 (P7). Short HUD labels only;
// diagnoses and coach tips stay in the system font. Every canvas text has its real text in a
// .visually-hidden span next to the aria-hidden canvas.

export const GLYPH_W = 5 as const;
export const GLYPH_H = 7 as const;
export const ADVANCE = 6 as const;
export const LINE_HEIGHT = 9 as const;

// original, drawn for Bloc Hall, 2026-11-01; revised 2026-11-01 to move away from HD44780-like forms
const DRAWN: Record<string, string> = {
  A: '..#.. .#.#. #...# ##### #...# #...# #...#',
  B: '###.. #..#. #..#. ####. #...# #...# ####.',
  C: '.#### #.... #.... #.... #.... #.... .####',
  D: '####. .#..# .#..# .#..# .#..# .#..# ####.',
  E: '##### #.... #.... ###.. #.... #.... #####',
  F: '##### #.... #.... ###.. #.... #.... #....',
  G: '.#### #.... #.... #..## #...# #...# .###.',
  H: '#...# #...# #...# ##### #...# #...# #...#',
  I: '##### ..#.. ..#.. ..#.. ..#.. ..#.. #####',
  J: '.#### ....# ....# ....# ....# #...# .###.',
  K: '#...# #..#. #.#.. ###.. #..#. #...# #...#',
  L: '#.... #.... #.... #.... #.... #.... #####',
  M: '##.## #.#.# #.#.# #.#.# #...# #...# #...#',
  N: '##..# ##..# #.#.# #.#.# #.#.# #..## #..##',
  O: '.###. #...# #...# #...# #...# #...# .###.',
  P: '####. #...# #...# #...# ####. #.... #....',
  Q: '.###. #...# #...# #...# #.#.# .###. ...##',
  R: '####. #...# ####. #.#.. #..#. #...# #...#',
  S: '.###. #.... #.... .###. ....# #...# .###.',
  T: '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
  U: '#...# #...# #...# #...# #...# #...# .###.',
  V: '#...# #...# #...# .#.#. .#.#. ..#.. ..#..',
  W: '#...# #...# #.#.# #.#.# #.#.# ##.## #...#',
  X: '#...# .#.#. .#.#. ..#.. .#.#. .#.#. #...#',
  Y: '#...# #...# .#.#. .#.#. ..#.. ..#.. .###.',
  Z: '##### ....# ...#. .###. .#... #.... #####',
  '0': '.###. #..## #..## #.#.# ##..# ##..# .###.',
  '1': '.##.. #.#.. ..#.. ..#.. ..#.. ..#.. #####',
  '2': '.###. #...# ....# ...#. .##.. #.... #####',
  '3': '####. ....# ....# .###. ....# ....# ####.',
  '4': '#..#. #..#. #..#. ##### ...#. ...#. ...#.',
  '5': '##### #.... #.... ####. ....# ....# ####.',
  '6': '.###. #.... #.... ####. #...# #...# .###.',
  '7': '##### #...# ...#. ...#. ..#.. ..#.. ..#..',
  '8': '.###. #...# .###. #...# #...# #...# .###.',
  '9': '.###. #...# #...# .#### ....# ....# .###.',
  ' ': '..... ..... ..... ..... ..... ..... .....',
  '.': '..... ..... ..... ..... ..... ..... .##..',
  ',': '..... ..... ..... ..... ..... ..#.. .#...',
  '!': '.###. .###. ..#.. ..#.. ..#.. ..... ..#..',
  '?': '.###. #...# ...#. ..#.. .#... ..... ..#..',
  ':': '..... ..#.. ..#.. ..... ..#.. ..#.. .....',
  '-': '..... ..... ..... .###. ..... ..... .....',
  '+': '..... ..... ..#.. .###. ..#.. ..... .....',
  '/': '....# ....# ...#. ..#.. .#... #.... #....',
  '%': '##..# ##..# ...#. ..#.. .#... #..## #..##',
  "'": '..#.. ..#.. ..... ..... ..... ..... .....',
  '(': '...#. ..#.. ..#.. ..#.. ..#.. ..#.. ...#.',
  ')': '.#... ..#.. ..#.. ..#.. ..#.. ..#.. .#...',
  '×': '..... #...# .#.#. ..#.. .#.#. #...# .....',
};

/** 7 rows per glyph, each a 5-bit mask (bit 4 = left column). */
export const GLYPHS: Readonly<Record<string, readonly number[]>> = Object.fromEntries(
  Object.entries(DRAWN).map(([ch, art]) => [
    ch,
    art.split(' ').map((row) => [...row].reduce((m, c) => (m << 1) | (c === '#' ? 1 : 0), 0)),
  ]),
);

const FALLBACK = GLYPHS['?']!;

/** One code point → its glyph: its single-character uppercase form if that is in the set, else '?'. */
function glyphFor(ch: string): readonly number[] {
  const up = ch.toUpperCase();
  return ([...up].length === 1 && GLYPHS[up]) || FALLBACK;
}

const lines = (text: string) => text.split('\n').map((line) => [...line]);

/** '' → 0×0; '\n' breaks lines; `outline` adds 1 px per side. */
export function measurePixelText(text: string, outline = false): { width: number; height: number } {
  if (text === '') return { width: 0, height: 0 };
  const ls = lines(text);
  const longest = Math.max(...ls.map((l) => l.length));
  const pad = outline ? 2 : 0;
  return {
    width: (longest ? ADVANCE * longest - 1 : 0) + pad,
    height: GLYPH_H + LINE_HEIGHT * (ls.length - 1) + pad,
  };
}

/** Calls `visit` for every glyph pixel of `text` with its top-left glyph cell at (x, y). */
function glyphPixels(x: number, y: number, text: string, visit: (px: number, py: number) => void) {
  lines(text).forEach((line, li) => {
    line.forEach((ch, ci) => {
      const rows = glyphFor(ch);
      const gx = x + ci * ADVANCE;
      const gy = y + li * LINE_HEIGHT;
      for (let r = 0; r < GLYPH_H; r++) {
        const mask = rows[r]!;
        if (!mask) continue;
        for (let c = 0; c < GLYPH_W; c++)
          if ((mask >> (GLYPH_W - 1 - c)) & 1) visit(gx + c, gy + r);
      }
    });
  });
}

/**
 * Draws `text` with the top-left of its measured box at (x, y), clipped. With an `outline`
 * colour, a 1-px 4-neighbour outline goes around the glyphs and the glyphs start at (x+1, y+1).
 */
export function rasterText(
  buf: PixelBuffer,
  x: number,
  y: number,
  text: string,
  color: PaletteIndex,
  outline?: PaletteIndex,
): void {
  const { width: w, height: h, data } = buf;
  if (!w || !h || text === '') return;
  const put = (px: number, py: number, v: number) => {
    if (px >= 0 && py >= 0 && px < w && py < h) data[py * w + px] = v;
  };
  const ox = outline === undefined ? x : x + 1;
  const oy = outline === undefined ? y : y + 1;
  if (outline !== undefined) {
    glyphPixels(ox, oy, text, (px, py) => {
      put(px - 1, py, outline);
      put(px + 1, py, outline);
      put(px, py - 1, outline);
      put(px, py + 1, outline);
    });
  }
  glyphPixels(ox, oy, text, (px, py) => put(px, py, color));
}
