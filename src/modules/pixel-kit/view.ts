import type { Pt } from './types';

// SPEC-pixel-kit › Decisions P2 and Rendering Rules › Grid. One art pixel is P whole device
// pixels; P keeps the climber about 48 art px tall, with hysteresis inside 36–60.

/** CSS px, same meaning as hold-segmentation's Viewport fields, plus devicePixelRatio. */
export interface PixelView {
  scale: number;
  tx: number;
  ty: number;
  boxW: number;
  boxH: number;
  dpr: number;
}

export interface ArtGrid {
  view: PixelView;
  /** Device px per art px (P). */
  px: number;
  width: number;
  height: number;
}

export const TARGET_ART_HEIGHT = 48 as const;
export const ART_HEIGHT_BAND = [36, 60] as const;

/** Pmin = max(2, round(2·dpr)). */
export function minPixelSize(dpr: number): number {
  return Math.max(2, Math.round(2 * dpr));
}

/** P for a climber `climberHeightPx` image px tall; keeps `prev` while the art height is in 36–60. */
export function pixelSize(climberHeightPx: number, view: PixelView, prev?: number): number {
  const pMin = minPixelSize(view.dpr);
  const hDev = climberHeightPx * view.scale * view.dpr;
  if (!Number.isFinite(hDev) || hDev <= 0) return pMin;
  const [lo, hi] = ART_HEIGHT_BAND;
  if (prev !== undefined && prev >= pMin && hDev / prev >= lo && hDev / prev <= hi) return prev;
  return Math.max(pMin, Math.round(hDev / TARGET_ART_HEIGHT));
}

/** ⌈box·dpr / P⌉ art px in each direction (0 × 0 for an empty box). */
export function artGrid(view: PixelView, px: number): ArtGrid {
  const size = (box: number) => (box > 0 ? Math.ceil((box * view.dpr) / px) : 0);
  return { view, px, width: size(view.boxW), height: size(view.boxH) };
}

/** Fractional art coordinates of an image-px point. */
export function toArt(grid: ArtGrid, p: Pt): Pt {
  const { scale, tx, ty, dpr } = grid.view;
  return { x: ((p.x * scale + tx) * dpr) / grid.px, y: ((p.y * scale + ty) * dpr) / grid.px };
}

/** The art pixel that holds an image-px point: floor(toArt). */
export function artPixel(grid: ArtGrid, p: Pt): Pt {
  const a = toArt(grid, p);
  return { x: Math.floor(a.x), y: Math.floor(a.y) };
}
