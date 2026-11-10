import type { PixelBuffer } from './buffer';
import { stamp } from './raster';

// SPEC-pixel-kit › The Climber. Our own climber, seen from behind: a rolled-brim beanie, a
// cylinder chalk bag at the small of the back, and chalky hands. '.' is clear; letters are outfit
// slots: H hat, B band, R hair, S skin, F shoes, r rubber, G bag, C chalk. The rasteriser adds the
// ink outline, so it is not part of the grids.

export type SpriteCell = 'H' | 'B' | 'R' | 'S' | 'F' | 'r' | 'G' | 'C';

/** A character grid with its anchor cell (ax, ay), which is placed on the joint's art pixel. */
export interface Sprite {
  w: number;
  h: number;
  ax: number;
  ay: number;
  rows: readonly string[];
}

export interface SpriteSet {
  head: Sprite;
  handGrip: Sprite;
  handOpen: Sprite;
  footRight: Sprite;
  footLeft: Sprite;
  bag: Sprite;
}

function sprite(rows: readonly string[], ax: number, ay: number): Sprite {
  const w = rows[0]?.length ?? 0;
  if (rows.some((r) => r.length !== w || /[^.HBRSFrGC]/.test(r))) {
    throw new Error(`Bad sprite rows: ${rows.join('/')}`);
  }
  return { w, h: rows.length, ax, ay, rows };
}

/** The left-right mirror image; the anchor moves with it. */
export function mirrorSprite(s: Sprite): Sprite {
  return {
    w: s.w,
    h: s.h,
    ax: s.w - 1 - s.ax,
    ay: s.ay,
    rows: s.rows.map((r) => [...r].reverse().join('')),
  };
}

/** Stamps `s` with its anchor cell on pixel (x, y), clipped. */
export function stampSprite(
  buf: PixelBuffer,
  s: Sprite,
  x: number,
  y: number,
  colorOf: (cell: string) => number,
): void {
  stamp(buf, s.rows, x - s.ax, y - s.ay, colorOf);
}

// Regular size (art height 36 and up).

// original, drawn for Bloc Hall, 2026-11-01
const HEAD = sprite(
  ['..HHH..', '.HHHHH.', 'HHHHHHH', 'BBBBBBB', 'RRRRRRR', 'SRRRRRS', '.RRRRR.', '..SSS..'],
  3,
  4,
);
// original, drawn for Bloc Hall, 2026-11-01
const HAND_GRIP = sprite(['CSC', 'SSS', '.S.'], 1, 1);
// original, drawn for Bloc Hall, 2026-11-01
const HAND_OPEN = sprite(['S.S', 'SSS', 'SSS', '.S.'], 1, 1);
// original, drawn for Bloc Hall, 2026-11-01
const FOOT_RIGHT = sprite(['FFF.', 'FFFF', 'rrrr'], 1, 2);
// original, drawn for Bloc Hall, 2026-11-01
const FOOT_LEFT = mirrorSprite(FOOT_RIGHT);
// original, drawn for Bloc Hall, 2026-11-01
const BAG = sprite(['CCC', 'GGG', 'GGG', '.G.'], 1, 1);

export const REGULAR: SpriteSet = {
  head: HEAD,
  handGrip: HAND_GRIP,
  handOpen: HAND_OPEN,
  footRight: FOOT_RIGHT,
  footLeft: FOOT_LEFT,
  bag: BAG,
};

// Compact set (art height under 36).

// original, drawn for Bloc Hall, 2026-11-01
const HEAD_COMPACT = sprite(['.HHH.', 'HHHHH', 'BBBBB', 'RRRRR', '.SSS.'], 2, 2);
// original, drawn for Bloc Hall, 2026-11-01
const HAND_COMPACT = sprite(['S'], 0, 0);
// original, drawn for Bloc Hall, 2026-11-01
const FOOT_RIGHT_COMPACT = sprite(['FF'], 0, 0);
// original, drawn for Bloc Hall, 2026-11-01
const FOOT_LEFT_COMPACT = mirrorSprite(FOOT_RIGHT_COMPACT);
// original, drawn for Bloc Hall, 2026-11-01
const BAG_COMPACT = sprite(['C', 'G'], 0, 1);

export const COMPACT: SpriteSet = {
  head: HEAD_COMPACT,
  handGrip: HAND_COMPACT,
  handOpen: HAND_COMPACT,
  footRight: FOOT_RIGHT_COMPACT,
  footLeft: FOOT_LEFT_COMPACT,
  bag: BAG_COMPACT,
};
