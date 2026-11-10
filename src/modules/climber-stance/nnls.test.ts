import { nnls } from './nnls';

/** Seeded so failures reproduce. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296 - 0.5;
  };
}

const objective = (A: number[][], x: number[], b: number[]) =>
  A.reduce((sum, row, i) => {
    const r = row.reduce((acc, a, j) => acc + a * x[j]!, 0) - b[i]!;
    return sum + r * r;
  }, 0);

/** Unconstrained least squares on the columns in `cols` (normal equations, tiny sizes). */
function lsq(A: number[][], b: number[], cols: number[]): number[] | null {
  const k = cols.length;
  const M = cols.map((p) => cols.map((q) => A.reduce((s, row) => s + row[p]! * row[q]!, 0)));
  const v = cols.map((p) => A.reduce((s, row, i) => s + row[p]! * b[i]!, 0));
  for (let i = 0; i < k; i++) {
    let piv = i;
    for (let r = i + 1; r < k; r++) if (Math.abs(M[r]![i]!) > Math.abs(M[piv]![i]!)) piv = r;
    if (Math.abs(M[piv]![i]!) < 1e-12) return null;
    [M[i], M[piv]] = [M[piv]!, M[i]!];
    [v[i], v[piv]] = [v[piv]!, v[i]!];
    for (let r = 0; r < k; r++) {
      if (r === i) continue;
      const f = M[r]![i]! / M[i]![i]!;
      for (let c = i; c < k; c++) M[r]![c]! -= f * M[i]![c]!;
      v[r]! -= f * v[i]!;
    }
  }
  return v.map((x, i) => x / M[i]![i]!);
}

/** The best non-negative x by trying every support set. */
function bruteForce(A: number[][], b: number[], n: number): number {
  let best = objective(A, new Array(n).fill(0), b);
  for (let mask = 1; mask < 1 << n; mask++) {
    const cols = [...Array(n).keys()].filter((j) => mask & (1 << j));
    const sol = lsq(A, b, cols);
    if (!sol || sol.some((v) => v < 0)) continue;
    const x = new Array(n).fill(0);
    cols.forEach((c, i) => (x[c] = sol[i]));
    best = Math.min(best, objective(A, x, b));
  }
  return best;
}

describe('nnls', () => {
  it('matches a brute-force search on 20 random problems', () => {
    const r = rng(7);
    for (let t = 0; t < 20; t++) {
      const m = 6;
      const n = 3 + (t % 3);
      const A = Array.from({ length: m }, () => Array.from({ length: n }, r));
      const b = Array.from({ length: m }, r);
      const { x } = nnls(A, b);
      expect(x.every((v) => v >= 0)).toBe(true);
      expect(Math.abs(objective(A, x, b) - bruteForce(A, b, n))).toBeLessThan(1e-6);
    }
  });

  it('returns zero when every column points away from b', () => {
    const { x } = nnls([[1], [1]], [-1, -1]);
    expect(x).toEqual([0]);
  });

  it('meets the optimality (KKT) conditions on rank-deficient, solver-sized problems', () => {
    const r = rng(11);
    for (let t = 0; t < 20; t++) {
      // 4 contacts × 8 edges (each contact's edges span only 3 directions) + 6 free ±axis columns.
      const m = 18;
      const basis = Array.from({ length: 5 }, () => Array.from({ length: m }, r));
      const A = Array.from({ length: m }, () => new Array(38).fill(0));
      for (let j = 0; j < 38; j++) {
        const mix = [r(), r(), r(), r(), r()];
        for (let i = 0; i < m; i++) {
          A[i]![j] = 100 * mix.reduce((s, k, q) => s + k * basis[q]![i]!, 0);
        }
      }
      const b = Array.from({ length: m }, () => 100 * r());
      const { x } = nnls(A, b);
      expect(x.every((v) => Number.isFinite(v) && v >= 0)).toBe(true);
      // Gradient g = Aᵀ(b − Ax): ≤ 0 where x = 0, ≈ 0 where x > 0.
      const res = b.map((bi, i) => bi - A[i]!.reduce((s, a, j) => s + a * x[j]!, 0));
      const scale = Math.max(1, ...A.flat().map(Math.abs)) ** 2;
      for (let j = 0; j < 38; j++) {
        const g = A.reduce((s, row, i) => s + row[j]! * res[i]!, 0) / scale;
        if (x[j]! > 0) expect(Math.abs(g)).toBeLessThan(1e-6);
        else expect(g).toBeLessThan(1e-6);
      }
    }
  });
});
