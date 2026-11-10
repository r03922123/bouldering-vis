import { convexHull, feasibleRegion, REGION_GRID } from './region';

describe('convexHull', () => {
  it('keeps the corners and drops inner, collinear and repeated points', () => {
    const hull = convexHull([
      [0, 0],
      [2, 0],
      [1, 0],
      [2, 2],
      [0, 2],
      [1, 1],
      [0, 0],
    ]);
    expect(hull).toHaveLength(4);
    expect(hull).toEqual(
      expect.arrayContaining([
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
      ]),
    );
  });
});

describe('feasibleRegion', () => {
  it('outlines the samples the test accepts, plus the extra point', () => {
    const hull = feasibleRegion(
      { x0: 0, x1: 100, y0: 0, y1: 100 },
      (x) => x >= 25 && x <= 75,
      [50, 150],
    );
    const xs = hull.map((p) => p[0]);
    const cell = 100 / REGION_GRID;
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(25);
    expect(Math.min(...xs)).toBeLessThan(25 + cell);
    expect(Math.max(...xs)).toBeLessThanOrEqual(75);
    expect(hull).toContainEqual([50, 150]);
  });

  it('is empty when nothing is feasible', () => {
    expect(feasibleRegion({ x0: 0, x1: 1, y0: 0, y1: 1 }, () => false, null)).toEqual([]);
  });
});
