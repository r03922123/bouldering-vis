// SPEC-climber-stance › How It Works: "where your hips can be". The feasible CoM set is convex for
// fixed contacts (Bretl & Lall 2008), so the convex hull of feasible grid samples pictures it.

export type Point2 = [number, number];

/** Andrew's monotone chain; counter-clockwise in a y-down frame doesn't matter for drawing. */
export function convexHull(points: readonly Point2[]): Point2[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const turn = (o: Point2, a: Point2, b: Point2) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Point2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && turn(lower.at(-2)!, lower.at(-1)!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point2[] = [];
  for (const p of pts.reverse()) {
    while (upper.length >= 2 && turn(upper.at(-2)!, upper.at(-1)!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export const REGION_GRID = 18;

/**
 * Samples a REGION_GRID² grid over `bounds` and returns the hull of the points `feasible` accepts.
 * `extra` (the pose's own CoM, when it holds) is included so the dot never sits just outside.
 */
export function feasibleRegion(
  bounds: { x0: number; x1: number; y0: number; y1: number },
  feasible: (x: number, y: number) => boolean,
  extra: Point2 | null,
): Point2[] {
  const pts: Point2[] = extra ? [extra] : [];
  for (let i = 0; i < REGION_GRID; i++) {
    const x = bounds.x0 + ((bounds.x1 - bounds.x0) * (i + 0.5)) / REGION_GRID;
    for (let j = 0; j < REGION_GRID; j++) {
      const y = bounds.y0 + ((bounds.y1 - bounds.y0) * (j + 0.5)) / REGION_GRID;
      if (feasible(x, y)) pts.push([x, y]);
    }
  }
  return convexHull(pts);
}
