import type { HoldMask, HoldRole } from './types';

export const MAX_STARTS = 2;

export interface RouteStatus {
  startCount: number;
  finishCount: number;
  /** 1–2 starts and exactly 1 finish. */
  complete: boolean;
}

export function routeStatus(holds: readonly HoldMask[]): RouteStatus {
  const startCount = holds.filter((h) => h.role === 'start').length;
  const finishCount = holds.filter((h) => h.role === 'finish').length;
  return {
    startCount,
    finishCount,
    complete: startCount >= 1 && startCount <= MAX_STARTS && finishCount === 1,
  };
}

/** Applies the role table from SPEC-hold-segmentation. Never mutates `holds`. */
export function setRole(
  holds: readonly HoldMask[],
  id: string,
  role: HoldRole,
): HoldMask[] | { error: 'max-start' } {
  if (role === 'start') {
    const otherStarts = holds.filter((h) => h.role === 'start' && h.id !== id).length;
    if (otherStarts >= MAX_STARTS) return { error: 'max-start' };
  }
  return holds.map((h) => {
    if (h.id === id) return { ...h, role };
    if (role === 'finish' && h.role === 'finish') return { ...h, role: 'route' };
    return h;
  });
}

/**
 * Every hold's list number (1-based, selection order, same as "Hold N"), plus S for a start and
 * F for the finish: 1S, 2, 3S, 4F.
 */
export function badgeLabels(holds: readonly HoldMask[]): Map<string, string> {
  const labels = new Map<string, string>();
  [...holds]
    .sort((a, b) => a.order - b.order)
    .forEach((h, i) => {
      const role = h.role === 'start' ? 'S' : h.role === 'finish' ? 'F' : '';
      labels.set(h.id, `${i + 1}${role}`);
    });
  return labels;
}

/** Badge fill: start green, finish red, route slate (shared by the 2D and 3D views). */
export function badgeColor(label: string): string {
  if (label.endsWith('S')) return '#16a34a';
  if (label.endsWith('F')) return '#e11d48';
  return '#475569';
}

export const badgeRadius = (label: string) => (label.length > 2 ? 15 : 12);

/** A numbered role badge centered at (x, y). Shared by the 2D canvas and the 3D overlay. */
export function drawBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
): void {
  ctx.save();
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = badgeColor(label);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, badgeRadius(label), 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.fillText(label, x, y + 0.5);
  ctx.restore();
}
