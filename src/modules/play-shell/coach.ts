import type { MoveCheck, MoveContext } from '../beta-moves';
import { LIMB_NAME } from '../climber-stance';
import { PALETTE, type PaletteIndex } from '../pixel-kit';
import { numbersFor } from './numbers';
import { verdictLine } from './play';

// SPEC-play-shell › Amendment 2026-11-02 D1: the coach window. An original 8-bit RPG-style text
// box: a bolted-tape frame, a 5×7 pixel-font "COACH" tag (pixel-kit's own font) and the body in
// the system font. It shows only the referee's words and numbers, never its own.

/**
 * The frame, a nine-slice of 9 × 9 cells (each corner 4 × 4, the edges one cell repeated): a
 * strip of chalk tape between two ink lines, screwed to the wall at each corner by a square bolt
 * head with one lit pixel, like a route card fixed to a climbing wall.
 * Key: o ink · c chalk · b slate (the bolt) · h chalk (the bolt's highlight) · . clear.
 */
// original, drawn for Bloc Hall, 2026-11-02
export const FRAME_GRID: readonly string[] = [
  'ooooooooo',
  'ohbocohbo',
  'obbocobbo',
  'ooooooooo',
  'occo.occo',
  'ooooooooo',
  'ohbocohbo',
  'obbocobbo',
  'ooooooooo',
];

/** The frame's nine-slice: corners are FRAME_SLICE cells square. */
export const FRAME_SLICE = 4;

/**
 * The advance arrow: a double chevron pointing down to the next line, 5 × 6 cells.
 * Key: # chalk · . clear.
 */
// original, drawn for Bloc Hall, 2026-11-02
export const ADVANCE_GRID: readonly string[] = [
  '#...#',
  '.#.#.',
  '..#..',
  '#...#',
  '.#.#.',
  '..#..',
];

const KEY: Readonly<Record<string, PaletteIndex>> = { o: 1, c: 4, b: 3, h: 4, '#': 4 };

/**
 * A pixel grid as an SVG data URL, one 1 × 1 rect per filled cell, drawn with crisp edges, so CSS
 * can scale it (border-image, img) without smoothing. Colours are pixel-kit's palette.
 */
export function gridSvg(rows: readonly string[]): string {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  const rects: string[] = [];
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const i = KEY[ch];
      if (i !== undefined)
        rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${PALETTE[i]}"/>`);
    }),
  );
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${rects.join('')}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const SHORT = { lh: 'LH', rh: 'RH', lf: 'LF', rf: 'RF' } as const;

/**
 * Numbers on (D1): the check's Numbers rows on one line, each value exactly as numbersFor gives
 * it ("LH 10.0 % · RH 21.3 % · … · Effort 25.0 % bodyweight · Contacts kept 4"). Labels shortened,
 * values untouched.
 */
export function breakdownLine(check: MoveCheck): string {
  return numbersFor(check)
    .map((r) => {
      if (!r.limb) return `${r.label} ${r.value}`;
      const what = r.label.slice(LIMB_NAME[r.limb].length).trim();
      return what === 'share'
        ? `${SHORT[r.limb]} ${r.value}`
        : `${SHORT[r.limb]} ${what} ${r.value}`;
    })
    .join(' · ');
}

/**
 * The coach's pages for a check, in the referee's words. Amendment 2026-11-03 R0-2: the reason is
 * the lesson, so a fall's first page is the verdict and its reason together ("Right hand to 4:
 * you'd fall. Too far: …"), and a tip (a deadpoint, one hand on the finish) shares its move's
 * page. Joined with spaces, the pages are exactly the verdict line (verdictLine) the live region
 * announces; the Numbers breakdown is the caller's page of its own.
 */
export function coachPages(ctx: MoveContext, check: MoveCheck): string[] {
  return [verdictLine(ctx, check)];
}

/** Letters revealed per tick, and the tick (≈ 50 letters a second). */
export const REVEAL_MS = 20;
