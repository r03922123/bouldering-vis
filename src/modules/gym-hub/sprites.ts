import {
  COLOR,
  DEFAULT_LOOK,
  OUTFITS,
  type Look,
  type Outfit,
  type PixelBuffer,
} from '../pixel-kit';

// SPEC-gym-hub G4: the hub's own sprites, in pixel-kit's grid format ('.' is clear, a letter is a
// colour slot) and stamped with its outline rule: every clear pixel 4-adjacent to the fill is ink.
// pixel-kit exports no sprite stamper, so the tiny one here re-implements that rule locally.
//
// Climber slots: H hat, B band, R hair, S skin, K ink (eye), T top, P bottoms, F shoes, r rubber,
// G bag, C chalk. The hub climber is the same beanie climber as on the wall, seen side-on.

/** A character grid and its anchor cell (ax, ay), which is placed on the given pixel. */
export interface HubSprite {
  w: number;
  h: number;
  ax: number;
  ay: number;
  rows: readonly string[];
}

function sprite(rows: readonly string[], ax: number, ay: number): HubSprite {
  const w = rows[0]?.length ?? 0;
  if (rows.some((r) => r.length !== w || /[^.A-Za-z]/.test(r))) {
    throw new Error(`Bad sprite rows: ${rows.join('/')}`);
  }
  return { w, h: rows.length, ax, ay, rows };
}

/** The left-right mirror image; the anchor moves with it. */
export function mirrorSprite(s: HubSprite): HubSprite {
  return { ...s, ax: s.w - 1 - s.ax, rows: s.rows.map((r) => [...r].reverse().join('')) };
}

const filled = (s: HubSprite, c: number, r: number) =>
  r >= 0 && r < s.h && c >= 0 && c < s.w && s.rows[r]![c] !== '.';

/**
 * Stamps `s` with its anchor cell on pixel (x, y), clipped: first the 1-px ink outline (each clear
 * cell with a filled 4-neighbour), then the fill through `colorOf`.
 */
export function stampOutlined(
  buf: PixelBuffer,
  s: HubSprite,
  x: number,
  y: number,
  colorOf: (cell: string) => number,
): void {
  const x0 = x - s.ax;
  const y0 = y - s.ay;
  const { width: w, height: h, data } = buf;
  for (let r = -1; r <= s.h; r++) {
    const py = y0 + r;
    if (py < 0 || py >= h) continue;
    for (let c = -1; c <= s.w; c++) {
      const px = x0 + c;
      if (px < 0 || px >= w) continue;
      if (filled(s, c, r)) data[py * w + px] = colorOf(s.rows[r]![c]!);
      else if (
        filled(s, c - 1, r) ||
        filled(s, c + 1, r) ||
        filled(s, c, r - 1) ||
        filled(s, c, r + 1)
      )
        data[py * w + px] = COLOR.ink;
    }
  }
}

/** The slot colours for an outfit and look (v0 always uses the starter outfit). */
export function climberColors(
  outfit: Outfit = OUTFITS.starter,
  look: Look = DEFAULT_LOOK,
): (cell: string) => number {
  const slot: Record<string, number> = {
    H: outfit.hat,
    B: outfit.band,
    R: look.hair,
    S: look.skin,
    K: COLOR.ink,
    T: outfit.top,
    P: outfit.bottoms,
    F: outfit.shoes,
    r: COLOR.dusk,
    G: outfit.bag,
    C: COLOR.chalk,
  };
  return (cell) => slot[cell] ?? COLOR.ink;
}

// The walk cycle, facing right (G5: one frame per 125-ms stride). 0 and 2 are the contact poses
// (feet apart, the near arm forward, then back); 1 and 3 are the passing poses (the far foot,
// then the near foot, lifted). The anchor is under the trunk, on the bottom row.

// original, drawn for Bloc Hall, 2026-11-01
const WALK_0 = sprite(
  [
    '....HHH.....',
    '...HHHHH....',
    '..HHHHHHH...',
    '..BBBBBBB...',
    '..RRRSSSS...',
    '..RRSSSKS...',
    '..RRSSSSSS..',
    '...RSSSSS...',
    '.....SS.....',
    '....TTTT....',
    '...TTTTTT...',
    '...TTTTTT...',
    '...TTTTTTSS.',
    '..CTTTTTTSS.',
    '..GTTTTTT...',
    '..GPPPPPP...',
    '...PPPPPP...',
    '...PPPPPPP..',
    '..PPP..PPP..',
    '..PP....PP..',
    '.PP......PP.',
    '.PP......PP.',
    'FFF......FFF',
    'rrr......rrr',
  ],
  5,
  23,
);
// original, drawn for Bloc Hall, 2026-11-01
const WALK_1 = sprite(
  [
    '....HHH.....',
    '...HHHHH....',
    '..HHHHHHH...',
    '..BBBBBBB...',
    '..RRRSSSS...',
    '..RRSSSKS...',
    '..RRSSSSSS..',
    '...RSSSSS...',
    '.....SS.....',
    '....TTTT....',
    '...TTTTTT...',
    '...TTTTTT...',
    '...TTSTTT...',
    '..CTTSTTT...',
    '..GTTSTTT...',
    '..GPPSSPP...',
    '...PPSSPP...',
    '...PPPPPP...',
    '....PPPP....',
    '...PPPPP....',
    '..PP.PPP....',
    '.FF..PPP....',
    '.rr..FFFF...',
    '.....rrrrr..',
  ],
  5,
  23,
);
// original, drawn for Bloc Hall, 2026-11-01
const WALK_2 = sprite(
  [
    '....HHH.....',
    '...HHHHH....',
    '..HHHHHHH...',
    '..BBBBBBB...',
    '..RRRSSSS...',
    '..RRSSSKS...',
    '..RRSSSSSS..',
    '...RSSSSS...',
    '.....SS.....',
    '....TTTT....',
    '...TTTTTT...',
    '...TTTTTT...',
    '.SSTTTTTT...',
    '.SSTTTTTT...',
    '..GTTTTTT...',
    '..GPPPPPP...',
    '...PPPPPP...',
    '...PPPPPPP..',
    '..PPP..PPP..',
    '..PP....PP..',
    '.PP......PP.',
    '.PP......PP.',
    'FFF......FFF',
    'rrr......rrr',
  ],
  5,
  23,
);
// original, drawn for Bloc Hall, 2026-11-01
const WALK_3 = sprite(
  [
    '....HHH.....',
    '...HHHHH....',
    '..HHHHHHH...',
    '..BBBBBBB...',
    '..RRRSSSS...',
    '..RRSSSKS...',
    '..RRSSSSSS..',
    '...RSSSSS...',
    '.....SS.....',
    '....TTTT....',
    '...TTTTTT...',
    '...TTTTTT...',
    '...TTSTTT...',
    '..CTTSTTT...',
    '..GTTSTTT...',
    '..GPPSSPP...',
    '...PPSSPP...',
    '...PPPPPP...',
    '....PPPPP...',
    '....PPPPPP..',
    '....PPP.PP..',
    '....PPP.FF..',
    '...FFFF.rr..',
    '...rrrrr....',
  ],
  5,
  23,
);

// The idle pose: standing side-on, arm down, the chalk bag at the small of the back. Frame 1
// breathes out (the head and shoulders drop 1 px; the legs stay put).

// original, drawn for Bloc Hall, 2026-11-01
const IDLE_0 = sprite(
  [
    '....HHH.....',
    '...HHHHH....',
    '..HHHHHHH...',
    '..BBBBBBB...',
    '..RRRSSSS...',
    '..RRSSSKS...',
    '..RRSSSSSS..',
    '...RSSSSS...',
    '.....SS.....',
    '....TTTT....',
    '...TTTTTT...',
    '...TTTTTT...',
    '...TTSTTT...',
    '..CTTSTTT...',
    '..GTTSTTT...',
    '..GPPSSPP...',
    '...PPSSPP...',
    '...PPPPPP...',
    '....PPPP....',
    '....PPPP....',
    '....PPPP....',
    '....PPPP....',
    '....FFFFF...',
    '....rrrrrr..',
  ],
  5,
  23,
);
// original, drawn for Bloc Hall, 2026-11-01
const IDLE_1 = sprite(
  [
    '............',
    '....HHH.....',
    '...HHHHH....',
    '..HHHHHHH...',
    '..BBBBBBB...',
    '..RRRSSSS...',
    '..RRSSSKS...',
    '..RRSSSSSS..',
    '...RSSSSS...',
    '.....SS.....',
    '....TTTT....',
    '...TTTTTT...',
    '...TTSTTT...',
    '..CTTSTTT...',
    '..GTTSTTT...',
    '..GPPSSPP...',
    '...PPSSPP...',
    '...PPPPPP...',
    '....PPPP....',
    '....PPPP....',
    '....PPPP....',
    '....PPPP....',
    '....FFFFF...',
    '....rrrrrr..',
  ],
  5,
  23,
);

export const WALK: readonly HubSprite[] = [WALK_0, WALK_1, WALK_2, WALK_3];
export const IDLE: readonly HubSprite[] = [IDLE_0, IDLE_1];
/** One idle frame (a breath is two). */
export const IDLE_MS = 600;

const MIRRORED = { walk: WALK.map(mirrorSprite), idle: IDLE.map(mirrorSprite) };

/** The climber's sprite for a pose and frame (wrapped into the cycle), facing right (1) or left. */
export function climberSprite(pose: 'walk' | 'idle', frame: number, facing: 1 | -1): HubSprite {
  const set = facing === 1 ? (pose === 'walk' ? WALK : IDLE) : MIRRORED[pose];
  return set[((frame % set.length) + set.length) % set.length]!;
}

// Mags, at the front desk: seen chest-up and from the front, over the counter. A sun-blonde bob
// with a side-swept fringe, a staff headset with its mic at her cheek, and a lime staff tee with a
// navy collar and a chalk name badge. Slots: R hair, S skin, K ink, H lips, E headset band,
// M ear cups and mic boom, W chalk, L tee, N collar. Original; not the pillars §4 description.

// original, drawn for Bloc Hall, 2026-11-01
export const MAGS = sprite(
  [
    '...EEEEEEEE...',
    '..ERRRRRRRRE..',
    '..RRRRRRRRRR..',
    '.RRRRRRRSSRRR.',
    '.RRSSSSSSSSRR.',
    'MRRSKSSSSKSRRM',
    'MRSSKSSSSKSSRM',
    '.RSSSSSSSSSSM.',
    '..SSSSSSSSSM..',
    '...SSHHHSSM...',
    '....SSSSWW....',
    '......SS......',
    '..LLLLNNLLLL..',
    '.LLLLLLNLLLLL.',
    '.LWWLLLLLLLLL.',
    '.LWWLLLLLLLLL.',
    '.LLLLLLLLLLLL.',
  ],
  6,
  16,
);

const MAGS_SLOT: Record<string, number> = {
  R: COLOR.sun,
  S: COLOR.skinDeep,
  K: COLOR.ink,
  H: COLOR.brick,
  E: COLOR.slate,
  M: COLOR.slate,
  W: COLOR.chalk,
  L: COLOR.lime,
  N: COLOR.navy,
};
export const MAGS_COLORS = (cell: string): number => MAGS_SLOT[cell] ?? COLOR.ink;
