export interface KMeansResult {
  /** k × dim, row-major. */
  centers: Float32Array;
  /** Cluster index per point. */
  labels: Uint8Array;
  counts: number[];
}

function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}

function dist2(points: Float32Array, i: number, centers: Float32Array, c: number, dim: number) {
  let d = 0;
  for (let j = 0; j < dim; j++) d += (points[i * dim + j]! - centers[c * dim + j]!) ** 2;
  return d;
}

/** Lloyd's k-means with seeded k-means++ init; deterministic for a given seed. k ≤ 255. */
export function kmeans(
  points: Float32Array,
  dim: number,
  k: number,
  { seed = 1, maxIter = 20 }: { seed?: number; maxIter?: number } = {},
): KMeansResult {
  const n = points.length / dim;
  const rand = lcg(seed);
  const centers = new Float32Array(k * dim);
  const nearest = new Float64Array(n).fill(Infinity);

  // k-means++: each new center is picked with probability ∝ squared distance to the closest one.
  let pick = Math.floor(rand() * n);
  for (let c = 0; c < k; c++) {
    centers.set(points.subarray(pick * dim, pick * dim + dim), c * dim);
    let total = 0;
    for (let i = 0; i < n; i++) {
      nearest[i] = Math.min(nearest[i]!, dist2(points, i, centers, c, dim));
      total += nearest[i]!;
    }
    let r = rand() * total;
    for (pick = 0; pick < n - 1 && (r -= nearest[pick]!) > 0; pick++);
  }

  const labels = new Uint8Array(n);
  const counts = new Array<number>(k).fill(0);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = iter === 0;
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = dist2(points, i, centers, c, dim);
        if (d < bestD) [best, bestD] = [c, d];
      }
      if (labels[i] !== best) changed = true;
      labels[i] = best;
    }
    if (!changed) break;
    const sums = new Float64Array(k * dim);
    counts.fill(0);
    for (let i = 0; i < n; i++) {
      const c = labels[i]!;
      counts[c]!++;
      for (let j = 0; j < dim; j++) sums[c * dim + j]! += points[i * dim + j]!;
    }
    for (let c = 0; c < k; c++) {
      if (counts[c])
        for (let j = 0; j < dim; j++) centers[c * dim + j] = sums[c * dim + j]! / counts[c]!;
    }
  }
  counts.fill(0);
  for (const c of labels) counts[c]!++;
  return { centers, labels, counts };
}
