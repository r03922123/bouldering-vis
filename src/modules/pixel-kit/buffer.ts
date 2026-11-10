import { PALETTE } from './palette';

// SPEC-pixel-kit › Decisions P1: an indexed buffer (one palette index per art pixel), mapped to
// RGBA in one pass. Snapshots are exact and readable as text; no canvas is needed in unit tests.

/** Row-major palette indices. */
export interface PixelBuffer {
  width: number;
  height: number;
  data: Uint8Array;
}

export function createBuffer(width: number, height: number): PixelBuffer {
  return { width, height, data: new Uint8Array(width * height) };
}

/** Returns `buf` itself when the size is unchanged (no allocation). */
export function resizeBuffer(buf: PixelBuffer, width: number, height: number): PixelBuffer {
  return buf.width === width && buf.height === height ? buf : createBuffer(width, height);
}

const DIGITS = '.123456789abcdef';

/** '.' = 0, '1'–'9' = 1–9, 'a'–'f' = 10–15; rows joined by '\n'. */
export function bufferToText(buf: PixelBuffer): string {
  const rows: string[] = [];
  for (let y = 0; y < buf.height; y++) {
    let row = '';
    for (let x = 0; x < buf.width; x++) row += DIGITS[buf.data[y * buf.width + x]!] ?? '?';
    rows.push(row);
  }
  return rows.join('\n');
}

/** Skips lines starting with '#'. Throws on ragged rows or an unknown character. */
export function bufferFromText(text: string): PixelBuffer {
  const rows = text.split('\n').filter((line) => line !== '' && !line.startsWith('#'));
  const width = rows[0]?.length ?? 0;
  const buf = createBuffer(width, rows.length);
  rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`Ragged row ${y}: ${row.length} ≠ ${width}`);
    for (let x = 0; x < width; x++) {
      const v = DIGITS.indexOf(row[x]!);
      if (v < 0) throw new Error(`Unknown pixel character "${row[x]}" at ${x},${y}`);
      buf.data[y * width + x] = v;
    }
  });
  return buf;
}

/** RGBA per palette index: clear → 0,0,0,0; others → palette rgb, alpha 255. */
const RGBA = new Uint8ClampedArray(PALETTE.length * 4);
PALETTE.forEach((hex, i) => {
  if (!hex) return;
  for (let c = 0; c < 3; c++) RGBA[i * 4 + c] = parseInt(hex.slice(1 + 2 * c, 3 + 2 * c), 16);
  RGBA[i * 4 + 3] = 255;
});

/** RGBA into `out` (length 4·w·h): clear → 0,0,0,0; others → palette rgb, alpha 255. */
export function blit(buf: PixelBuffer, out: Uint8ClampedArray): void {
  const n = buf.width * buf.height;
  if (out.length !== 4 * n) throw new Error(`blit: out has ${out.length} bytes, needs ${4 * n}`);
  const src = buf.data;
  for (let i = 0, o = 0; i < n; i++, o += 4) {
    const k = (src[i]! & 15) * 4;
    out[o] = RGBA[k]!;
    out[o + 1] = RGBA[k + 1]!;
    out[o + 2] = RGBA[k + 2]!;
    out[o + 3] = RGBA[k + 3]!;
  }
}
