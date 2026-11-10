import { createBuffer, resizeBuffer, type PixelBuffer } from './buffer';
import { measurePixelText, rasterText } from './font';
import { COLOR, LIMB_COLOR, ROLE_COLOR, type MarkerRole } from './palette';
import { clipRegion, linePixels, outlinePixels, setPixel, stamp } from './raster';
import type { PixelLimb, Pt } from './types';
import { toArt, type ArtGrid } from './view';

// SPEC-pixel-kit › Rendering Rules › Markers and Reach gaps. Each role has its own shape (AC 3,
// AC 47): start brackets, a finish diamond with a flag, a planned ring with its step number, and
// target ticks with the limb glyph. Strokes are 1 px in the role colour with an ink outline.

export interface HoldMarker {
  holdId: string;
  role: MarkerRole;
  /** Image px (DecodedHold.bbox). */
  bbox: { x: number; y: number; w: number; h: number };
  /** planned: floored, clamped to 1–99. */
  step?: number;
  /** target */
  limb?: PixelLimb;
}

/** Image px. */
export interface ReachGap {
  limb: PixelLimb;
  from: Pt;
  to: Pt;
}

/** Art px. */
export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

const FRAME_MIN = 7;
const FRAME_MAX = 40;
const FRAME_GROW = 2;
const TICK = 3;
const PHASE_MS = 300;

/** The hold's bbox in art px, grown by 2 per side and clamped to 7–40 around its centre. */
export function markerFrame(grid: ArtGrid, bbox: HoldMarker['bbox']): Frame {
  const a = toArt(grid, { x: bbox.x, y: bbox.y });
  const b = toArt(grid, { x: bbox.x + bbox.w, y: bbox.y + bbox.h });
  const axis = (lo: number, hi: number): [number, number] => {
    const start = Math.floor(lo) - FRAME_GROW;
    const size = Math.ceil(hi) + FRAME_GROW - start;
    const clamped = Math.min(FRAME_MAX, Math.max(FRAME_MIN, size));
    // Growing or shrinking by an odd count leaves the extra pixel on the right or bottom.
    return [start - Math.floor((clamped - size) / 2), clamped];
  };
  const [x, w] = axis(a.x, b.x);
  const [y, h] = axis(a.y, b.y);
  return { x, y, w, h };
}

/**
 * Amendment 2026-11-02 (originality review): a target frame is at least this many art px a side.
 * On 7–11 px frames the four inward ticks (3 px, 1–2 px in) met in a solid upright "+", a cross
 * the game must never show (SPEC-gym-hub › Boundaries › Never: no religious iconography). At 13
 * the centre keeps a hole of at least 3 px in both breathing phases.
 */
export const TARGET_FRAME_MIN = 13;

/** A target's frame grown, centred, to TARGET_FRAME_MIN a side (as markerFrame grows: the odd
 * pixel goes right or down). Larger frames are unchanged. */
export function targetFrame(f: Frame): Frame {
  const axis = (start: number, size: number): [number, number] => {
    if (size >= TARGET_FRAME_MIN) return [start, size];
    return [start - Math.floor((TARGET_FRAME_MIN - size) / 2), TARGET_FRAME_MIN];
  };
  const [x, w] = axis(f.x, f.w);
  const [y, h] = axis(f.y, f.h);
  return { x, y, w, h };
}

/** Target ticks: 1 px in for timeMs mod 600 in 0–299, 2 px in for 300–599 (1 with reduced motion). */
export function targetInset(timeMs: number, reducedMotion: boolean): 1 | 2 {
  if (reducedMotion || !Number.isFinite(timeMs)) return 1;
  const t = ((timeMs % (2 * PHASE_MS)) + 2 * PHASE_MS) % (2 * PHASE_MS);
  return t < PHASE_MS ? 1 : 2;
}

/** One marker per (holdId, role): the last one in the array, in the order of last occurrence. */
export function uniqueMarkers(markers: readonly HoldMarker[]): HoldMarker[] {
  const byKey = new Map<string, HoldMarker>();
  for (const m of markers) {
    const key = `${m.role}\u0000${m.holdId}`;
    byKey.delete(key);
    byKey.set(key, m);
  }
  return [...byKey.values()];
}

// original, drawn for Bloc Hall, 2026-11-01
const FLAG = ['##...', '####.', '#####', '####.', '##...', '#....', '#....'];

let scratch: PixelBuffer = createBuffer(0, 0);

type LabelSide = 'below' | 'above' | 'right' | 'left';
const SIDES: readonly LabelSide[] = ['below', 'above', 'right', 'left'];

const overlaps = (a: Frame, b: Frame) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Where the target's limb label goes (its top-left, art px), so it never covers a climber contact
 * (the cartographic rule: a label never covers the feature beside it). The old spot, centred
 * below the frame, is kept when it covers no box in `avoid`. Otherwise the label moves to the side
 * away from the nearest contact, then tries the other sides in the order below, above, right,
 * left. A side must cover no contact and fit in the buffer; with none, the first clear side wins,
 * else the side away from the contact. Deterministic.
 */
export function targetLabelAt(
  f: Frame,
  size: { width: number; height: number },
  avoid: readonly Frame[],
  buf: { width: number; height: number },
): { x: number; y: number } {
  const { width: w, height: h } = size;
  const spot: Record<LabelSide, { x: number; y: number }> = {
    below: { x: f.x + Math.floor((f.w - w) / 2), y: f.y + f.h },
    above: { x: f.x + Math.floor((f.w - w) / 2), y: f.y - h },
    right: { x: f.x + f.w, y: f.y + Math.floor((f.h - h) / 2) },
    left: { x: f.x - w, y: f.y + Math.floor((f.h - h) / 2) },
  };
  const clear = (s: LabelSide) => !avoid.some((a) => overlaps({ ...spot[s], w, h }, a));
  if (clear('below')) return spot.below;
  // The nearest contact, by centre distance (the first one on a tie).
  const cx = f.x + f.w / 2;
  const cy = f.y + f.h / 2;
  let near = avoid[0]!;
  let best = Infinity;
  for (const a of avoid) {
    const d = (a.x + a.w / 2 - cx) ** 2 + (a.y + a.h / 2 - cy) ** 2;
    if (d < best) [near, best] = [a, d];
  }
  const dx = cx - (near.x + near.w / 2);
  const dy = cy - (near.y + near.h / 2);
  const away: LabelSide =
    Math.abs(dy) >= Math.abs(dx) ? (dy >= 0 ? 'below' : 'above') : dx >= 0 ? 'right' : 'left';
  const order = [away, ...SIDES.filter((s) => s !== away)];
  const fits = (s: LabelSide) => {
    const p = spot[s];
    return p.x >= 0 && p.y >= 0 && p.x + w <= buf.width && p.y + h <= buf.height;
  };
  const pick = order.find((s) => clear(s) && fits(s)) ?? order.find(clear) ?? away;
  return spot[pick];
}

/**
 * Draws marker `m` on an art-px frame (see markerFrame), clipped. A target's limb label keeps
 * clear of the art-px boxes in `avoid` (the climber's hands and feet; see targetLabelAt).
 */
export function rasterMarkerInFrame(
  buf: PixelBuffer,
  frame: Frame,
  m: HoldMarker,
  timeMs: number,
  reducedMotion: boolean,
  avoid: readonly Frame[] = [],
): void {
  if (!buf.width || !buf.height || ![frame.x, frame.y, frame.w, frame.h].every(Number.isFinite))
    return;
  // Never a solid cross: a target's ticks always leave its centre open (TARGET_FRAME_MIN).
  const f = m.role === 'target' ? targetFrame(frame) : frame;
  scratch = resizeBuffer(scratch, buf.width, buf.height);
  const mask = scratch;
  const color = ROLE_COLOR[m.role];
  const put = (x: number, y: number) => setPixel(mask, x, y, color);
  const right = f.x + f.w - 1;
  const bottom = f.y + f.h - 1;
  const region = clipRegion(buf, {
    x0: f.x - 3,
    y0: f.y - FLAG.length - 3,
    x1: right + 4,
    y1: bottom + 4,
  });
  for (let y = region.y0; y < region.y1; y++)
    mask.data.fill(0, y * buf.width + region.x0, y * buf.width + region.x1);

  if (m.role === 'start') {
    const arm = Math.max(2, Math.floor(Math.min(f.w, f.h) / 3));
    for (let i = 0; i < arm; i++) {
      for (const [x, y] of [
        [f.x + i, f.y],
        [right - i, f.y],
        [f.x + i, bottom],
        [right - i, bottom],
        [f.x, f.y + i],
        [right, f.y + i],
        [f.x, bottom - i],
        [right, bottom - i],
      ] as const) {
        put(x, y);
      }
    }
  } else if (m.role === 'finish') {
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h / 2;
    const top = { x: cx, y: f.y + 0.5 };
    const rgt = { x: right + 0.5, y: cy };
    const bot = { x: cx, y: bottom + 0.5 };
    const lft = { x: f.x + 0.5, y: cy };
    for (const [a, b] of [
      [top, rgt],
      [rgt, bot],
      [bot, lft],
      [lft, top],
    ] as const) {
      linePixels(a, b, put);
    }
    // The flag's pole stands on the top vertex.
    stamp(mask, FLAG, Math.floor(cx), f.y - FLAG.length, () => color);
  } else if (m.role === 'planned') {
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h / 2;
    const inside = (x: number, y: number) =>
      x >= f.x &&
      x <= right &&
      y >= f.y &&
      y <= bottom &&
      ((x + 0.5 - cx) / (f.w / 2)) ** 2 + ((y + 0.5 - cy) / (f.h / 2)) ** 2 <= 1 + 1e-9;
    for (let y = f.y; y <= bottom; y++) {
      for (let x = f.x; x <= right; x++) {
        if (!inside(x, y)) continue;
        if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1))
          put(x, y);
      }
    }
  } else {
    const inset = targetInset(timeMs, reducedMotion);
    const mx = f.x + Math.floor(f.w / 2);
    const my = f.y + Math.floor(f.h / 2);
    for (let i = 0; i < TICK; i++) {
      put(mx, f.y + inset + i);
      put(mx, bottom - inset - i);
      put(f.x + inset + i, my);
      put(right - inset - i, my);
    }
  }

  outlinePixels(mask, region, (i) => (buf.data[i] = COLOR.ink));
  for (let y = region.y0; y < region.y1; y++) {
    for (let i = y * buf.width + region.x0, end = y * buf.width + region.x1; i < end; i++) {
      const v = mask.data[i]!;
      if (v) buf.data[i] = v;
    }
  }

  // Text goes on top, with its own outline.
  if (m.role === 'planned' && m.step !== undefined) {
    const n = Math.min(99, Math.max(1, Math.floor(m.step) || 1));
    rasterText(buf, right - 2, f.y - 9, String(n), COLOR.chalk, COLOR.ink);
  } else if (m.role === 'target' && m.limb) {
    const label = m.limb.toUpperCase();
    const at = targetLabelAt(f, measurePixelText(label, true), avoid, buf);
    rasterText(buf, at.x, at.y, label, LIMB_COLOR[m.limb], COLOR.ink);
  }
}

/** Draws a hold marker at its frame (markerFrame), clipped; `avoid` as in rasterMarkerInFrame. */
export function rasterMarker(
  buf: PixelBuffer,
  grid: ArtGrid,
  m: HoldMarker,
  timeMs: number,
  reducedMotion: boolean,
  avoid: readonly Frame[] = [],
): void {
  rasterMarkerInFrame(buf, markerFrame(grid, m.bbox), m, timeMs, reducedMotion, avoid);
}

/** A 1-px line from the limb's end to the hold, alternating the limb colour and ink. */
export function rasterGap(buf: PixelBuffer, grid: ArtGrid, gap: ReachGap): void {
  if (!buf.width || !buf.height) return;
  const color = LIMB_COLOR[gap.limb];
  linePixels(toArt(grid, gap.from), toArt(grid, gap.to), (x, y, k) =>
    setPixel(buf, x, y, k % 2 ? COLOR.ink : color),
  );
}
