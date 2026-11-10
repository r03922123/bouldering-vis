import type { PixelBuffer } from './buffer';
import type { Pt } from './types';

// SPEC-pixel-kit › Decisions P5 and Rendering Rules › Clipping. Coordinates are fractional art
// px; pixel (i, j) has its centre at (i + 0.5, j + 0.5). Every function clips to the buffer, and a
// shape wholly outside it (or with a non-finite coordinate) writes nothing.

/** Ties ("exactly on the edge") count as inside, whatever the float rounding. */
const EPS = 1e-9;

/** A half-open pixel rectangle [x0, x1) × [y0, y1). */
export interface Region {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const finite = (...v: number[]) => v.every(Number.isFinite);

/** A fill value, or a value per pixel (for example, a waistband inside the trunk). */
export type Paint = number | ((x: number, y: number) => number);

export function setPixel(buf: PixelBuffer, x: number, y: number, value: number): void {
  if (x >= 0 && y >= 0 && x < buf.width && y < buf.height) buf.data[y * buf.width + x] = value;
}

/** Clamps a pixel rectangle to the buffer. */
export function clipRegion(buf: PixelBuffer, r: Region): Region {
  return {
    x0: Math.max(0, r.x0),
    y0: Math.max(0, r.y0),
    x1: Math.min(buf.width, r.x1),
    y1: Math.min(buf.height, r.y1),
  };
}

/** Fills pixels whose centre is within t/2 of the segment a–b, inclusive. */
export function fillCapsule(buf: PixelBuffer, a: Pt, b: Pt, t: number, value: Paint): void {
  if (!finite(a.x, a.y, b.x, b.y, t)) return;
  const r = t / 2;
  const box = clipRegion(buf, {
    x0: Math.floor(Math.min(a.x, b.x) - r),
    y0: Math.floor(Math.min(a.y, b.y) - r),
    x1: Math.ceil(Math.max(a.x, b.x) + r) + 1,
    y1: Math.ceil(Math.max(a.y, b.y) + r) + 1,
  });
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const r2 = r * r + EPS;
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      const px = x + 0.5 - a.x;
      const py = y + 0.5 - a.y;
      const s = len2 > 0 ? Math.min(1, Math.max(0, (px * dx + py * dy) / len2)) : 0;
      const ex = px - s * dx;
      const ey = py - s * dy;
      if (ex * ex + ey * ey <= r2) {
        buf.data[y * buf.width + x] = typeof value === 'number' ? value : value(x, y);
      }
    }
  }
}

/**
 * Visits the pixels of the 1-px line a–b, in order from a. Along the major axis a pixel counts when
 * its centre is within 0.5 of the segment's extent; on the minor axis, when its centre is within
 * 0.5 of the line (both pixels on a tie). `k` is the step along the major axis, 0 at a's end.
 * Not clipped: callers clip (see drawLine).
 */
export function linePixels(a: Pt, b: Pt, visit: (x: number, y: number, k: number) => void): void {
  if (!finite(a.x, a.y, b.x, b.y)) return;
  const xMajor = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  // Work in (u = major, v = minor) and swap back when visiting.
  const [au, av, bu, bv] = xMajor ? [a.x, a.y, b.x, b.y] : [a.y, a.x, b.y, b.x];
  const du = bu - au;
  const slope = du !== 0 ? (bv - av) / du : 0;
  const first = Math.ceil(Math.min(au, bu) - 1 - EPS);
  const last = Math.floor(Math.max(au, bu) + EPS);
  const forward = bu >= au;
  const vStep = bv >= av ? 1 : -1;
  for (let n = 0; n <= last - first; n++) {
    const u = forward ? first + n : last - n;
    const v = av + (u + 0.5 - au) * slope;
    const lo = Math.ceil(v - 1 - EPS);
    const hi = Math.floor(v + EPS);
    for (let m = 0; m <= hi - lo; m++) {
      const w = vStep > 0 ? lo + m : hi - m;
      if (xMajor) visit(u, w, n);
      else visit(w, u, n);
    }
  }
}

/** A 1-px line in one colour, clipped. */
export function drawLine(buf: PixelBuffer, a: Pt, b: Pt, value: number): void {
  if (!buf.width || !buf.height) return;
  linePixels(a, b, (x, y) => setPixel(buf, x, y, value));
}

/** True when (px, py) lies on the segment a–b (within EPS). */
function onSegment(px: number, py: number, a: Pt, b: Pt): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const s = len2 > 0 ? Math.min(1, Math.max(0, ((px - a.x) * dx + (py - a.y) * dy) / len2)) : 0;
  const ex = px - a.x - s * dx;
  const ey = py - a.y - s * dy;
  return ex * ex + ey * ey <= EPS;
}

/** Fills a polygon by pixel-centre inclusion (even-odd); a centre exactly on an edge is inside. */
export function fillPolygon(buf: PixelBuffer, pts: readonly Pt[], value: Paint): void {
  if (pts.length < 3 || !pts.every((p) => finite(p.x, p.y))) return;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const box = clipRegion(buf, {
    x0: Math.floor(Math.min(...xs) - 1),
    y0: Math.floor(Math.min(...ys) - 1),
    x1: Math.ceil(Math.max(...xs)) + 1,
    y1: Math.ceil(Math.max(...ys)) + 1,
  });
  for (let y = box.y0; y < box.y1; y++) {
    const cy = y + 0.5;
    for (let x = box.x0; x < box.x1; x++) {
      const cx = x + 0.5;
      let inside = false;
      let edge = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const p = pts[i]!;
        const q = pts[j]!;
        if (onSegment(cx, cy, p, q)) {
          edge = true;
          break;
        }
        if (p.y > cy !== q.y > cy && cx < ((q.x - p.x) * (cy - p.y)) / (q.y - p.y) + p.x) {
          inside = !inside;
        }
      }
      if (edge || inside) {
        buf.data[y * buf.width + x] = typeof value === 'number' ? value : value(x, y);
      }
    }
  }
}

/**
 * Visits each clear pixel of `mask` inside `region` (clipped) that has a filled 4-neighbour.
 * `i` is the row-major index.
 */
export function outlinePixels(
  mask: PixelBuffer,
  region: Region,
  visit: (i: number, x: number, y: number) => void,
): void {
  const { width: w, height: h, data } = mask;
  const r = clipRegion(mask, region);
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      const i = y * w + x;
      if (data[i]) continue;
      if (
        (x > 0 && data[i - 1]) ||
        (x < w - 1 && data[i + 1]) ||
        (y > 0 && data[i - w]) ||
        (y < h - 1 && data[i + w])
      ) {
        visit(i, x, y);
      }
    }
  }
}

/** Writes the 4-neighbour outline of `mask` (same size as `buf`) in `value`. */
export function drawOutline(
  buf: PixelBuffer,
  mask: PixelBuffer,
  value: number,
  region: Region = { x0: 0, y0: 0, x1: mask.width, y1: mask.height },
): void {
  outlinePixels(mask, region, (i) => (buf.data[i] = value));
}

/**
 * Writes a character grid with its top-left cell at (x0, y0). '.' is clear (skipped); other
 * characters are mapped through `colorOf`, and a 0 result is skipped too.
 */
export function stamp(
  buf: PixelBuffer,
  rows: readonly string[],
  x0: number,
  y0: number,
  colorOf: (cell: string) => number,
): void {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!;
    const y = y0 + r;
    if (y < 0 || y >= buf.height) continue;
    for (let c = 0; c < row.length; c++) {
      const cell = row[c]!;
      const x = x0 + c;
      if (cell === '.' || x < 0 || x >= buf.width) continue;
      const v = colorOf(cell);
      if (v) buf.data[y * buf.width + x] = v;
    }
  }
}
