export const MAX_WORKING_EDGE = 1536;

/** Long edge ≤ maxEdge, aspect ratio kept, never upscaled. */
export function computeWorkingSize(
  w: number,
  h: number,
  maxEdge: number = MAX_WORKING_EDGE,
): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}
