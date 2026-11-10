import { ARROW_STYLE, drawArrow2D, drawIntoView, type Emphasis } from '../hold-geometry';
import { badgeRadius, drawBadge } from '../hold-segmentation';
import { handleAt } from './aim';
import type { Annotation } from './annotations';

// Arrows and badges in 3D are drawn as a 2D overlay at projected positions (crisp, constant
// pixel size, never larger than a hold) with the same drawing code as the 2D views.

type V3 = [number, number, number];
type Project = (p: V3) => { x: number; y: number };

export interface OverlayItem {
  holdId: string;
  x: number;
  y: number;
  label?: string;
  badge: { x: number; y: number };
  arrow: {
    ux: number;
    uy: number;
    length: number;
    width: number;
    alpha: number;
    /** The force points (almost) straight away from the viewer: draw ⊗. */
    intoView: boolean;
  } | null;
}

const STEP = 0.05;
const INTO_VIEW_BELOW = 0.25;
const BADGE_GAP = 10;

/**
 * Screen layout of every hold's force arrow and badge. `cameraRight` is a world vector parallel
 * to the screen; comparing against it measures how much the force is foreshortened. The badge sits
 * on the opposite side of the arrow, so the two never overlap.
 */
export function layoutOverlay(
  annotations: readonly Annotation[],
  project: Project,
  cameraRight: V3,
  emphasis: ReadonlyMap<string, Emphasis>,
): OverlayItem[] {
  return annotations.map((a) => {
    const p = project(a.origin);
    const at = (d: V3) =>
      project([a.origin[0] + d[0] * STEP, a.origin[1] + d[1] * STEP, a.origin[2] + d[2] * STEP]);
    const r = badgeRadius(a.label ?? '');
    let arrow: OverlayItem['arrow'] = null;
    let badge = { x: p.x, y: p.y - r - BADGE_GAP };
    const e = emphasis.get(a.holdId);
    if (a.force && e) {
      const q = at(a.force.dir);
      const ref = at(cameraRight);
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const len = Math.hypot(dx, dy);
      const ratio = len / (Math.hypot(ref.x - p.x, ref.y - p.y) || 1);
      const style = ARROW_STYLE[e];
      const intoView = ratio < INTO_VIEW_BELOW;
      const ux = len ? dx / len : 0;
      const uy = len ? dy / len : 1;
      arrow = {
        ux,
        uy,
        length: style.length * Math.min(1, Math.max(0.45, ratio)),
        width: style.width,
        alpha: style.alpha,
        intoView,
      };
      if (!intoView) badge = { x: p.x - ux * (r + BADGE_GAP), y: p.y - uy * (r + BADGE_GAP) };
    }
    return { holdId: a.holdId, x: p.x, y: p.y, label: a.label, badge, arrow };
  });
}

export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  items: readonly OverlayItem[],
  showArrows: boolean,
  focusedId: string | null = null,
): void {
  const f = focusedId && items.find((it) => it.holdId === focusedId);
  if (f) {
    // The hold focused in the list: a cyan ring, like the outline in 2D.
    ctx.save();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  if (showArrows) {
    for (const it of items) {
      if (!it.arrow) continue;
      const a = it.arrow;
      if (a.intoView) drawIntoView(ctx, it.x, it.y);
      else drawArrow2D(ctx, it.x, it.y, a.ux, a.uy, a.length, a.width, a.alpha);
    }
  }
  for (const it of items) if (it.label) drawBadge(ctx, it.badge.x, it.badge.y, it.label);
}

export interface HandleUi {
  /** Handle under the mouse. */
  hover: string | null;
  /** Handle being aimed. */
  active: string | null;
  /** 0..1: a snap just happened (grows the active ring, then fades). */
  pulse: number;
}

const RING = 8;

/**
 * Grab handles for aiming: a ring on each arrowhead, and a dashed ring below a hold with no
 * direction ("draw one"). The hovered or aimed one grows; a snap pulses it.
 */
export function drawHandles(
  ctx: CanvasRenderingContext2D,
  items: readonly OverlayItem[],
  ui: HandleUi,
): void {
  for (const it of items) {
    const h = handleAt(it);
    const hot = ui.hover === it.holdId || ui.active === it.holdId;
    const r = RING + (hot ? 3 : 0) + (ui.active === it.holdId ? ui.pulse * 6 : 0);
    ctx.save();
    ctx.lineWidth = hot ? 2.5 : 1.5;
    ctx.strokeStyle = '#fff';
    ctx.globalAlpha = hot ? 1 : 0.55; // quiet until touched: always visible (no hover on touch), not loud
    if (h.kind === 'draw') ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(h.x, h.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * One-time coach mark (Cairn review I4): a short tip beside a handle, with a leader line to the
 * ring, so a first-time player learns the rings are grabbable without reading the hint line.
 * Flips to the handle's left when it would run off the right edge.
 */
export function drawCoachMark(
  ctx: CanvasRenderingContext2D,
  item: OverlayItem,
  text: string,
  bounds: { w: number; h: number },
): void {
  const h = handleAt(item);
  const padX = 10;
  const padY = 7;
  const gap = 18;
  ctx.save();
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  const textW = ctx.measureText(text).width;
  const boxW = textW + padX * 2;
  const boxH = 13 + padY * 2;
  const right = h.x + gap + boxW <= bounds.w - 8;
  const x0 = right ? h.x + gap : Math.max(8, h.x - gap - boxW);
  const y0 = Math.min(Math.max(8, h.y - boxH / 2), bounds.h - boxH - 8);
  // Leader from the ring to the box.
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(right ? h.x + RING + 1 : h.x - RING - 1, h.y);
  ctx.lineTo(right ? x0 : x0 + boxW, y0 + boxH / 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x0, y0, boxW, boxH, 6);
  else ctx.rect(x0, y0, boxW, boxH);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.fillText(text, x0 + padX, y0 + boxH / 2);
  ctx.restore();
}
