import type { HoldMask } from '../hold-segmentation';
import { forceEmphasis } from './emphasis';
import type { Force } from './force';

type ToScreen = (p: { x: number; y: number }) => { x: number; y: number };

export const FORCE_COLOR = '#22c55e';
/** Below this on-screen length the force goes (almost) straight into the wall: draw ⊗. */
const INTO_WALL_BELOW_PX = 12;

export const ARROW_STYLE = {
  default: { length: 26, width: 2, alpha: 0.75 },
  notable: { length: 44, width: 3.5, alpha: 1 },
} as const;

/** One screen-space arrow from (x, y) along the unit vector (ux, uy). Shared by 2D and 3D. */
export function drawArrow2D(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ux: number,
  uy: number,
  length: number,
  width: number,
  alpha = 1,
): void {
  const tip = { x: Math.round(x + ux * length), y: Math.round(y + uy * length) };
  const head = 4 + width * 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.strokeStyle = FORCE_COLOR;
  ctx.fillStyle = FORCE_COLOR;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(tip.x, tip.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(tip.x - ux * head - uy * head * 0.6, tip.y - uy * head + ux * head * 0.6);
  ctx.lineTo(tip.x - ux * head + uy * head * 0.6, tip.y - uy * head - ux * head * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** ⊗: a force pointing (almost) straight away from the viewer, into the wall. */
export function drawIntoView(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = FORCE_COLOR;
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 5, y - 5);
  ctx.lineTo(x + 5, y + 5);
  ctx.moveTo(x + 5, y - 5);
  ctx.lineTo(x - 5, y + 5);
  ctx.stroke();
  ctx.restore();
}

/**
 * The one direction per hold: the recommended force (SPEC-hold-geometry › Amendment b), drawn in
 * screen space from the centroid along the force's on-screen component. Pull-down (the common
 * case) is subtle; other directions are bold. Length shrinks with the share going into the wall.
 */
export function drawForceArrows(
  ctx: CanvasRenderingContext2D,
  holds: readonly HoldMask[],
  forces: ReadonlyMap<string, Force>,
  toScreen: ToScreen,
): void {
  for (const h of holds) {
    const f = forces.get(h.id);
    const emphasis = f && forceEmphasis(f);
    if (!f?.dir || !emphasis) continue;
    const c = toScreen(h.centroid);
    const flat = Math.hypot(f.dir[0], f.dir[1]);
    const style = ARROW_STYLE[emphasis];
    const len = style.length * flat;
    if (len < INTO_WALL_BELOW_PX) drawIntoView(ctx, c.x, c.y);
    else
      drawArrow2D(ctx, c.x, c.y, f.dir[0] / flat, f.dir[1] / flat, len, style.width, style.alpha);
  }
}
