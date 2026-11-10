import { COLOR, type PixelBuffer } from '../pixel-kit';
import { stampOutlined, type HubSprite } from './sprites';

// SPEC-gym-hub › Amendment 2026-11-01: Bloc Hall is an original, fictional converted castle. This
// file holds the castle's props (grids in pixel-kit's grid format) and the small drawing helpers
// that set them into the static scenery. Only the 16 palette colours; nothing here animates: the
// lantern light and the window light are static dither, drawn once into the cached scenery.
// No real coat of arms, castle, church or venue, no religious motif, nothing taken from a game.

/** A prop grid. The letters are palette colours (CASTLE_COLORS); '.' is clear. */
export type CastleGrid = HubSprite;

/** k ink, d dusk, s slate, c chalk, w oak (skinMid), b timber (skinDeep), r brick, e ember, y sun,
 * l leaf, g lime, t tide, n navy, p bloom. */
export const CASTLE_COLORS: Readonly<Record<string, number>> = {
  k: COLOR.ink,
  d: COLOR.dusk,
  s: COLOR.slate,
  c: COLOR.chalk,
  w: COLOR.skinMid,
  b: COLOR.skinDeep,
  r: COLOR.brick,
  e: COLOR.ember,
  y: COLOR.sun,
  l: COLOR.leaf,
  g: COLOR.lime,
  t: COLOR.tide,
  n: COLOR.navy,
  p: COLOR.bloom,
};
const castleColor = (cell: string) => CASTLE_COLORS[cell] ?? COLOR.ink;

function grid(rows: readonly string[], ax: number, ay: number): CastleGrid {
  const w = rows[0]?.length ?? 0;
  if (rows.some((r) => r.length !== w || /[^.kdscwbreylgtnp]/.test(r))) {
    throw new Error(`Bad castle grid: ${rows.join('/')}`);
  }
  return { w, h: rows.length, ax, ay, rows };
}

// A wrought-iron lantern on a hook: an iron cap and frame, warm glass. Anchored at the hook.
// original, drawn for Bloc Hall, 2026-11-02
export const LANTERN = grid(
  [
    '...k...',
    '..k.k..',
    '...k...',
    '.kkkkk.',
    'kkkkkkk',
    '.kyeyk.',
    '.kyyyk.',
    '.kyyyk.',
    '.keyek.',
    '.kkkkk.',
    '..kkk..',
    '...k...',
  ],
  3,
  0,
);

// A tall round-headed window in a slate reveal, its glass leaded in diamond quarries (no mullion,
// no transom): a sun head, tide quarries with two diagonal runs of bloom (never a lone bloom
// pane, which would read as a "+"), a lime foot, on a slate sill. Anchored at the
// top of the head.
// original, drawn for Bloc Hall, 2026-11-02
export const WINDOW = grid(
  [
    '.....sssss.....',
    '...sskkkkkss...',
    '..skkykyyykks..',
    '.skkykykykykks.',
    '.skykyyykyyyks.',
    'skykykykykykyks',
    'skkyyykyyykyyks',
    'skykykykykykyks',
    'skyykyyykyyykks',
    'sktktktkpktktks',
    'skktttkpppkttks',
    'sktktktkpkpktks',
    'skttktttkpppkks',
    'sktktktktkpkpks',
    'skktttktttkppks',
    'sktktktktktkpks',
    'skttktttktttkks',
    'sktkpktktktktks',
    'skkpppktttkttks',
    'sktkpkpktktktks',
    'skttkpppktttkks',
    'sktktkpkpktktks',
    'skktttkpppkttks',
    'sktktktkpktktks',
    'skttktttktttkks',
    'sktktktktktktks',
    'skkgggkgggkggks',
    'skgkgkgkgkgkgks',
    'skggkgggkgggkks',
    'skgkgkgkgkgkgks',
    'skkgggkgggkggks',
    'skgkgkgkgkgkgks',
    'kkkkkkkkkkkkkkk',
    'sssssssssssssss',
  ],
  7,
  0,
);

// An oak chest with a domed lid, two iron bands, and a sun hasp and lock plate. Anchored at the
// bottom centre.
// original, drawn for Bloc Hall, 2026-11-02
export const CHEST = grid(
  [
    '..wswwwwwsw..',
    '.wwswwwwwsww.',
    'wwwswwwwwswww',
    'bbbsbbbbbsbbb',
    'kkkskkykkskkk',
    'wwwswyyywswww',
    'wwwswykywswww',
    'bbbsbbbbbsbbb',
    'wwwswwwwwswww',
    'wwwswwwwwswww',
    'sssssssssssss',
  ],
  6,
  10,
);

// The foot of a raised portcullis under the gatehouse lintel: its bottom rail and iron teeth.
// Anchored at the top centre.
// original, drawn for Bloc Hall, 2026-11-02
export const PORTCULLIS = grid(
  [
    'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
    'ksssssssssssssssssssssssssssssssssssk',
    'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
    '.ksk.ksk.ksk.ksk.ksk.ksk.ksk.ksk.ksk.',
    '.ksk.ksk.ksk.ksk.ksk.ksk.ksk.ksk.ksk.',
    '..k...k...k...k...k...k...k...k...k..',
  ],
  18,
  0,
);

// Three original banners with swallowtails: bare ordinaries and a simple division (a chevron, a
// bend, quarters) in palette colours, with no charges, crest, motto or supporters, so they copy no
// particular coat of arms. Anchored at the top, left of centre.
// original, drawn for Bloc Hall, 2026-11-02
const BANNER_CHEVRON = grid(
  [
    'tttttttttt',
    'tttttttttt',
    'tttttttttt',
    'tttttttttt',
    'tttttttttt',
    'tttttttttt',
    'tttttttttt',
    'ttttyytttt',
    'tttyyyyttt',
    'ttyyttyytt',
    'tyyttttyyt',
    'yyttttttyy',
    'ytttttttty',
    'tttttttttt',
    'tttttttttt',
    'tttttttttt',
    'tttttttttt',
    'tttttttttt',
    'tttttttttt',
    'tttt..tttt',
    'ttt....ttt',
    'tt......tt',
  ],
  5,
  0,
);
// original, drawn for Bloc Hall, 2026-11-02
const BANNER_BEND = grid(
  [
    'nnpppppppp',
    'nnpppppppp',
    'pnnppppppp',
    'pnnppppppp',
    'ppnnpppppp',
    'ppnnpppppp',
    'pppnnppppp',
    'pppnnppppp',
    'ppppnnpppp',
    'ppppnnpppp',
    'pppppnnppp',
    'pppppnnppp',
    'ppppppnnpp',
    'ppppppnnpp',
    'pppppppnnp',
    'pppppppnnp',
    'ppppppppnn',
    'ppppppppnn',
    'pppppppppn',
    'pppp..pppn',
    'ppp....ppp',
    'pp......pp',
  ],
  5,
  0,
);
// original, drawn for Bloc Hall, 2026-11-02
const BANNER_QUARTERS = grid(
  [
    'gggggrrrrr',
    'gggggrrrrr',
    'gggggrrrrr',
    'gggggrrrrr',
    'gggggrrrrr',
    'gggggrrrrr',
    'gggggrrrrr',
    'gggggrrrrr',
    'gggggrrrrr',
    'rrrrrggggg',
    'rrrrrggggg',
    'rrrrrggggg',
    'rrrrrggggg',
    'rrrrrggggg',
    'rrrrrggggg',
    'rrrrrggggg',
    'rrrrrggggg',
    'rrrrrggggg',
    'rrrrrggggg',
    'rrrr..gggg',
    'rrr....ggg',
    'rr......gg',
  ],
  5,
  0,
);
export const BANNERS: readonly CastleGrid[] = [BANNER_CHEVRON, BANNER_BEND, BANNER_QUARTERS];

// ---- drawing helpers ------------------------------------------------------------------------

export function fillRect(
  buf: PixelBuffer,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  v: number,
): void {
  const { width: w, height: h, data } = buf;
  for (let y = Math.max(0, y0); y < Math.min(h, y1); y++) {
    data.fill(v, y * w + Math.max(0, x0), y * w + Math.min(w, x1));
  }
}

/** A filled box with a 1-px ink border; x1, y1 exclusive. */
export function box(
  buf: PixelBuffer,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  fill: number,
): void {
  fillRect(buf, x0, y0, x1, y1, COLOR.ink);
  fillRect(buf, x0 + 1, y0 + 1, x1 - 1, y1 - 1, fill);
}

/** Sets one pixel, clipped. */
export function plot(buf: PixelBuffer, x: number, y: number, v: number): void {
  if (x >= 0 && y >= 0 && x < buf.width && y < buf.height) buf.data[y * buf.width + x] = v;
}
function get(buf: PixelBuffer, x: number, y: number): number {
  return x >= 0 && y >= 0 && x < buf.width && y < buf.height ? buf.data[y * buf.width + x]! : -1;
}

/** Paints a grid's filled cells (no outline: the grid carries its own edges). */
export function paintGrid(buf: PixelBuffer, g: CastleGrid, x: number, y: number): void {
  for (let r = 0; r < g.h; r++)
    for (let c = 0; c < g.w; c++) {
      const ch = g.rows[r]![c]!;
      if (ch !== '.') plot(buf, x - g.ax + c, y - g.ay + r, castleColor(ch));
    }
}

/** Stamps a free-standing prop with pixel-kit's 1-px ink outline. */
export function stampProp(buf: PixelBuffer, g: CastleGrid, x: number, y: number): void {
  stampOutlined(buf, g, x, y, castleColor);
}

/** The 4 × 4 ordered-dither (Bayer) threshold at a pixel, 0–15: static, so it never shimmers. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => BAYER[(((y % 4) + 4) % 4) * 4 + (((x % 4) + 4) % 4)]!;

/**
 * A lantern's warm pool on the floor and mats, centred on (cx, cy): an ellipse of ordered dither,
 * sun at the heart and ember at the rim, denser in the middle. Only floor colours take light.
 */
export function lightPool(buf: PixelBuffer, cx: number, cy: number, rx: number, ry: number) {
  const takes = new Set<number>([COLOR.skinDeep, COLOR.navy, COLOR.tide]);
  for (let y = cy - ry; y <= cy + ry; y++)
    for (let x = cx - rx; x <= cx + rx; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d >= 1 || !takes.has(get(buf, x, y))) continue;
      if (bayer(x, y) < Math.round(4 * (1 - d))) plot(buf, x, y, d < 0.2 ? COLOR.sun : COLOR.ember);
    }
}

const GLASS = [COLOR.tide, COLOR.bloom, COLOR.lime, COLOR.sun];

/**
 * A window's coloured light on the floorboards: a sparse dithered patch that leans away from the
 * window (the light falls from high on the left), banded in the glass colours.
 */
export function windowLight(buf: PixelBuffer, cx: number, y0: number, y1: number, halfW: number) {
  for (let y = y0; y < y1; y++) {
    const lean = Math.floor((y - y0) / 2);
    for (let x = cx - halfW + lean; x <= cx + halfW + lean; x++) {
      if (get(buf, x, y) !== COLOR.skinDeep || bayer(x, y) > (y - y0 < 4 ? 2 : 1)) continue;
      plot(buf, x, y, GLASS[Math.floor((x - cx + halfW - lean) / 3) % GLASS.length]!);
    }
  }
}

/**
 * A round arch of stone voussoirs (slate, with ink joints and ink edges) about (cx, cy), from
 * radius r to r + 3, over its upper half. Returns nothing: it draws into `buf`.
 */
export function stoneArch(buf: PixelBuffer, cx: number, cy: number, r: number) {
  const R = r + 3;
  for (let y = cy - R - 1; y <= cy; y++)
    for (let x = cx - R - 1; x <= cx + R + 1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d < r - 0.5 || d > R + 0.5) continue;
      const edge = d < r + 0.5 || d > R - 0.5;
      // A joint every 15°, radiating from the centre.
      const a = (Math.atan2(cy - y, x - cx) * 180) / Math.PI;
      const joint = Math.abs(((a + 7.5) % 15) - 7.5) < 15 / (2 * d) + 0.5 && Math.abs(a - 90) > 4;
      plot(buf, x, y, edge || joint ? COLOR.ink : COLOR.slate);
    }
}

/** A stone pier (buttress) at x, from the corbel under the roof to a stepped plinth. */
export function pier(buf: PixelBuffer, x: number, top: number, bottom: number) {
  box(buf, x - 3, top, x + 4, bottom, COLOR.slate);
  for (let y = top + 7; y < bottom - 6; y += 8) fillRect(buf, x - 2, y, x + 3, y + 1, COLOR.ink);
  fillRect(buf, x + 2, top + 1, x + 3, bottom - 1, COLOR.dusk);
  // The corbel cap under the roof timber and the plinth at the foot step out one px.
  box(buf, x - 4, top, x + 5, top + 3, COLOR.slate);
  box(buf, x - 4, bottom - 6, x + 5, bottom, COLOR.slate);
}

/** A banner on an iron rod with finials, hung at (x, y). */
export function banner(buf: PixelBuffer, g: CastleGrid, x: number, y: number) {
  fillRect(buf, x - 7, y - 1, x + 7, y, COLOR.ink);
  plot(buf, x - 7, y - 2, COLOR.ink);
  plot(buf, x + 6, y - 2, COLOR.ink);
  stampProp(buf, g, x, y);
}

/** Planks for a door leaf (an arch-headed opening about cx), with plank seams every 4 px. */
export function archedLeaf(
  buf: PixelBuffer,
  cx: number,
  top: number,
  bottom: number,
  halfW: number,
  wood: number,
  seam: number,
) {
  const cy = top + halfW;
  for (let y = top; y < bottom; y++)
    for (let x = cx - halfW; x <= cx + halfW; x++) {
      const d = y < cy ? Math.hypot(x - cx, y - cy) : Math.abs(x - cx);
      if (d > halfW + 0.5) continue;
      const rim = d > halfW - 0.5;
      plot(buf, x, y, rim ? COLOR.ink : (x - cx + halfW) % 4 === 0 ? seam : wood);
    }
}
