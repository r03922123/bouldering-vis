import { createBuffer, type PixelBuffer } from '../buffer';
import { COLOR, type PaletteIndex } from '../palette';
import { drawOutline, stamp } from '../raster';

// SPEC-pixel-kit › Public Interface (PixelIcon). Small HUD icons, drawn for this game: '#' is a
// fill cell, '.' is clear. Like every sprite and glyph, an icon gets a 1-px ink outline (iconArt).

export type PixelIcon =
  'undo' | 'send' | 'sound-on' | 'sound-off' | 'back' | 'star' | 'ok' | 'warn' | 'fail';

const DRAWN: Record<PixelIcon, string> = {
  // original, drawn for Bloc Hall, 2026-11-01
  undo: '..#.... .##.... ######. .##...# ..#...# ......# ..####.',
  // original, drawn for Bloc Hall, 2026-11-01
  send: '...#... ..###.. .#####. ...#... ...#... ...#... ...#...',
  // original, drawn for Bloc Hall, 2026-11-01
  'sound-on': '..#..#. .##...# ###.#.# ###.#.# ###.#.# .##...# ..#..#.',
  // original, drawn for Bloc Hall, 2026-11-01
  'sound-off': '..#.... .##.... ###.#.# ###..#. ###.#.# .##.... ..#....',
  // original, drawn for Bloc Hall, 2026-11-01
  back: '...#... ..##... .###### ####### .###### ..##... ...#...',
  // original, drawn for Bloc Hall, 2026-11-01
  star: '....#.... ...###... ...###... ######### .#######. ..#####.. ..#####.. .###.###. .##...##.',
  // original, drawn for Bloc Hall, 2026-11-01
  ok: '....... ......# .....## #...##. ##.##.. .###... ..#....',
  // original, drawn for Bloc Hall, 2026-11-01
  warn: '...#... ..###.. ..###.. ..###.. ...#... ....... ...#...',
  // original, drawn for Bloc Hall, 2026-11-01
  fail: '##...## ###.### .#####. ..###.. .#####. ###.### ##...##',
};

/** The icon grids, one string per row. */
export const ICONS: Readonly<Record<PixelIcon, readonly string[]>> = (() => {
  const out = {} as Record<PixelIcon, readonly string[]>;
  for (const name of Object.keys(DRAWN) as PixelIcon[]) out[name] = DRAWN[name].split(' ');
  return out;
})();

/** The star's edge only: a filled cell stays when one of its 4 neighbours is clear or off-grid. */
export const HOLLOW_STAR: readonly string[] = ICONS.star.map((row, y, rows) =>
  [...row]
    .map((cell, x) => {
      const filled = (cx: number, cy: number) => rows[cy]?.[cx] === '#';
      const inside = filled(x - 1, y) && filled(x + 1, y) && filled(x, y - 1) && filled(x, y + 1);
      return cell === '#' && inside ? '.' : cell;
    })
    .join(''),
);

/**
 * Draws `rows` ('#' cells in `color`) at (x, y) in `buf` with a 1-px ink outline, via `mask` (the
 * same size as `buf`, all clear). The outline is written first and the fill on top.
 */
export function stampOutlined(
  buf: PixelBuffer,
  mask: PixelBuffer,
  rows: readonly string[],
  x: number,
  y: number,
  color: PaletteIndex,
): void {
  stamp(mask, rows, x, y, () => color);
  drawOutline(buf, mask, COLOR.ink, {
    x0: x - 1,
    y0: y - 1,
    x1: x + (rows[0]?.length ?? 0) + 1,
    y1: y + rows.length + 1,
  });
  stamp(buf, rows, x, y, () => color);
  mask.data.fill(0);
}

/** An icon (or any '#' grid) in `color` with its ink outline: (w + 2) × (h + 2) art px. */
export function iconArt(icon: PixelIcon | readonly string[], color: PaletteIndex): PixelBuffer {
  const rows = typeof icon === 'string' ? ICONS[icon] : icon;
  const w = (rows[0]?.length ?? 0) + 2;
  const h = rows.length + 2;
  const buf = createBuffer(w, h);
  stampOutlined(buf, createBuffer(w, h), rows, 1, 1, color);
  return buf;
}
