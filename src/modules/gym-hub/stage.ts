import { minPixelSize } from '../pixel-kit';
import { PLACE_GAP, type Place } from './places';
import { ART_H, worldWidth } from './render';
import { IDLE_MS } from './sprites';
import { WALK_SPEED } from './walk';

// SPEC-gym-hub G2, G7, G14, G15: the pure parts of HubScreen's canvas loop. HubScreen owns the
// clock, the canvas and the DOM events; these only turn numbers into numbers.

/**
 * The largest art pixel, in CSS px: the stage box is min(60dvh, 108 · MAX_CSS_PX) tall (G2's
 * P_css). Builder's call: 3 keeps a phone showing over two places at once.
 */
export const MAX_CSS_PX = 3;
/** The camera's easing time constant (G14: none with reduced motion). */
export const CAMERA_TAU_MS = 120;
/** A strip trip never takes longer than this (builder's call, G7). */
export const DASH_MS = 1000;

export interface StageLayout {
  /** Device px per art px (P). */
  px: number;
  /** The canvas bitmap: art px. */
  width: number;
  height: number;
  /** The canvas's CSS size: bitmap · P / dpr. */
  cssW: number;
  cssH: number;
}

/**
 * G2: P = max(Pmin, floor(boxH·dpr / 108)) whole device px, but never taller than the box (AC 13
 * wins over Pmin on a very short screen). The width covers the box; the stage clips the rest.
 */
export function stageLayout(boxW: number, boxH: number, dpr: number): StageLayout {
  const fit = Math.floor((boxH * dpr) / ART_H);
  let px = Math.max(minPixelSize(dpr), fit);
  if ((ART_H * px) / dpr > boxH) px = Math.max(1, fit);
  const width = boxW > 0 && boxH > 0 ? Math.ceil((boxW * dpr) / px) : 0;
  return { px, width, height: ART_H, cssW: (width * px) / dpr, cssH: (ART_H * px) / dpr };
}

/** One frame of camera easing towards `target`; snaps within half an art px. */
export function easeCamera(cam: number, target: number, dtMs: number, reduced: boolean): number {
  if (reduced) return target;
  const next = cam + (target - cam) * (1 - Math.exp(-dtMs / CAMERA_TAU_MS));
  return Math.abs(target - next) < 0.5 ? target : next;
}

/** The time multiplier that brings a strip trip in within DASH_MS (1 for short trips). */
export function dashSpeedup(fromX: number, toX: number): number {
  return Math.max(1, Math.abs(toX - fromX) / (WALK_SPEED * DASH_MS));
}

/** The idle breath's frame at `timeMs` (0 with reduced motion: no idle bob, G14). */
export function idleFrame(timeMs: number, reduced: boolean): 0 | 1 {
  return reduced ? 0 : Math.floor(timeMs / IDLE_MS) % 2 === 0 ? 0 : 1;
}

/** Where the climber may stand: 8 art px in from the ends of the world. */
export function walkBounds(places: readonly Place[]): [number, number] {
  return [8, worldWidth(places) - 8];
}

/** The next place to the left (-1) or right (1) of x, beyond the one the climber stands at. */
export function neighbourPlace(places: readonly Place[], x: number, dir: -1 | 1): Place | null {
  const ahead = places.filter((p) => (p.x - x) * dir > PLACE_GAP / 7);
  return (dir === 1 ? ahead[0] : ahead[ahead.length - 1]) ?? null;
}
