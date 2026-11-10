import { kmeans } from './kmeans';

function twoClusters(): Float32Array {
  const pts: number[] = [];
  for (let i = 0; i < 50; i++) pts.push(0 + (i % 5) * 0.1, 0 + (i % 3) * 0.1);
  for (let i = 0; i < 30; i++) pts.push(10 + (i % 5) * 0.1, 10 + (i % 3) * 0.1);
  return new Float32Array(pts);
}

describe('kmeans', () => {
  it('separates two well-separated clusters', () => {
    const r = kmeans(twoClusters(), 2, 2, { seed: 7 });
    expect([...r.counts].sort((a, b) => a - b)).toEqual([30, 50]);
    const big = r.counts.indexOf(50);
    expect(r.centers[big * 2]).toBeCloseTo(0.2, 1);
    expect(r.centers[(1 - big) * 2]).toBeCloseTo(10.2, 1);
  });

  it('labels every point with a cluster index', () => {
    const r = kmeans(twoClusters(), 2, 2, { seed: 7 });
    expect(r.labels).toHaveLength(80);
    expect(r.labels[0]).not.toBe(r.labels[79]);
  });

  it('is deterministic for a fixed seed', () => {
    const a = kmeans(twoClusters(), 2, 3, { seed: 42 });
    const b = kmeans(twoClusters(), 2, 3, { seed: 42 });
    expect(Array.from(a.centers)).toEqual(Array.from(b.centers));
    expect(Array.from(a.labels)).toEqual(Array.from(b.labels));
  });
});
