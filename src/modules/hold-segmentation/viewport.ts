// Image ↔ screen transform for the selection canvas: screen = image * scale + t (CSS px).

export const MAX_ZOOM = 8;

export interface Viewport {
  scale: number;
  tx: number;
  ty: number;
  /** The fitted scale; zoom is limited to [minScale, minScale * MAX_ZOOM]. */
  minScale: number;
  imgW: number;
  imgH: number;
  boxW: number;
  boxH: number;
}

/** Centers along an axis when the image is smaller than the box, else keeps the box covered. */
function clampAxis(t: number, box: number, size: number): number {
  if (size <= box) return (box - size) / 2;
  return Math.min(0, Math.max(box - size, t));
}

function clamp(vp: Viewport): Viewport {
  return {
    ...vp,
    tx: clampAxis(vp.tx, vp.boxW, vp.imgW * vp.scale),
    ty: clampAxis(vp.ty, vp.boxH, vp.imgH * vp.scale),
  };
}

export function fitViewport(imgW: number, imgH: number, boxW: number, boxH: number): Viewport {
  const scale = Math.min(boxW / imgW, boxH / imgH);
  return clamp({ scale, tx: 0, ty: 0, minScale: scale, imgW, imgH, boxW, boxH });
}

export function screenToImage(vp: Viewport, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - vp.tx) / vp.scale, y: (sy - vp.ty) / vp.scale };
}

/** Zooms by `factor` around the screen point (sx, sy), which stays over the same image pixel. */
export function zoomAt(vp: Viewport, factor: number, sx: number, sy: number): Viewport {
  const scale = Math.min(vp.minScale * MAX_ZOOM, Math.max(vp.minScale, vp.scale * factor));
  const p = screenToImage(vp, sx, sy);
  return clamp({ ...vp, scale, tx: sx - p.x * scale, ty: sy - p.y * scale });
}

export function pan(vp: Viewport, dx: number, dy: number): Viewport {
  return clamp({ ...vp, tx: vp.tx + dx, ty: vp.ty + dy });
}

const BADGE_GAP = 3;

/** Screen position of a hold's badge: centered above its bbox, or below when there's no room. */
export function badgeAnchor(
  bbox: { x: number; y: number; w: number; h: number },
  centroid: { x: number; y: number },
  vp: Viewport,
  radius: number,
): { x: number; y: number } {
  const x = centroid.x * vp.scale + vp.tx;
  const above = bbox.y * vp.scale + vp.ty - radius - BADGE_GAP;
  if (above >= radius) return { x, y: above };
  return { x, y: (bbox.y + bbox.h) * vp.scale + vp.ty + radius + BADGE_GAP };
}
