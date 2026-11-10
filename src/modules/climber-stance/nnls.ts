// SPEC-climber-stance S9: non-negative least squares, min ‖Ax − b‖ subject to x ≥ 0
// (Lawson & Hanson 1974, "Solving Least Squares Problems", ch. 23). Sizes here are tiny (≤ 32 columns).

/** Relative to the problem's scale (balance rows are weighted ~1e2). */
const REL_TOL = 1e-12;

/** Solves M_PP y = v_P (Gaussian elimination with partial pivoting); null when singular. */
function solveSub(M: Float64Array, v: Float64Array, n: number, P: number[]): Float64Array | null {
  const k = P.length;
  const a = new Float64Array(k * k);
  const y = new Float64Array(k);
  P.forEach((p, i) => {
    y[i] = v[p]!;
    P.forEach((q, j) => (a[i * k + j] = M[p * n + q]!));
  });
  for (let i = 0; i < k; i++) {
    let piv = i;
    for (let r = i + 1; r < k; r++)
      if (Math.abs(a[r * k + i]!) > Math.abs(a[piv * k + i]!)) piv = r;
    if (Math.abs(a[piv * k + i]!) < 1e-14) return null;
    if (piv !== i) {
      for (let c = 0; c < k; c++) {
        const t = a[i * k + c]!;
        a[i * k + c] = a[piv * k + c]!;
        a[piv * k + c] = t;
      }
      const t = y[i]!;
      y[i] = y[piv]!;
      y[piv] = t;
    }
    for (let r = i + 1; r < k; r++) {
      const f = a[r * k + i]! / a[i * k + i]!;
      if (f === 0) continue;
      for (let c = i; c < k; c++) a[r * k + c]! -= f * a[i * k + c]!;
      y[r]! -= f * y[i]!;
    }
  }
  for (let i = k - 1; i >= 0; i--) {
    let s = y[i]!;
    for (let c = i + 1; c < k; c++) s -= a[i * k + c]! * y[c]!;
    y[i] = s / a[i * k + i]!;
  }
  return y;
}

export function nnls(A: readonly (readonly number[])[], b: readonly number[]): { x: number[] } {
  const m = A.length;
  const n = A[0]?.length ?? 0;
  // Normal equations once: every sub-problem reads from AᵀA and Aᵀb.
  const M = new Float64Array(n * n);
  const v = new Float64Array(n);
  for (let i = 0; i < m; i++) {
    const row = A[i]!;
    for (let p = 0; p < n; p++) {
      const ap = row[p]!;
      if (ap === 0) continue;
      v[p]! += ap * b[i]!;
      for (let q = 0; q < n; q++) M[p * n + q]! += ap * row[q]!;
    }
  }
  const x = new Float64Array(n);
  const passive = new Uint8Array(n);
  /** Columns whose sub-problem was singular: never picked again. */
  const blocked = new Uint8Array(n);
  const TOL = REL_TOL * Math.max(1, ...v.map(Math.abs));
  /** w = Aᵀb − AᵀA x: the descent direction for each column. */
  const gradient = (j: number) => {
    let g = v[j]!;
    for (let q = 0; q < n; q++) g -= M[j * n + q]! * x[q]!;
    return g;
  };

  for (let outer = 0; outer < 3 * n; outer++) {
    let j = -1;
    let best = TOL;
    for (let c = 0; c < n; c++) {
      if (passive[c] || blocked[c]) continue;
      const g = gradient(c);
      if (g > best) [best, j] = [g, c];
    }
    if (j < 0) break;
    passive[j] = 1;

    for (let inner = 0; inner < 3 * n; inner++) {
      const P = [...Array(n).keys()].filter((c) => passive[c]);
      const s = solveSub(M, v, n, P);
      if (!s) {
        passive[j] = 0;
        blocked[j] = 1;
        break;
      }
      if (s.every((val) => val > TOL)) {
        P.forEach((p, i) => (x[p] = s[i]!));
        break;
      }
      // Step from x toward s until the first variable hits zero, then drop it.
      let alpha = 1;
      P.forEach((p, i) => {
        // Only where x actually decreases toward zero (x = s = 0 would be 0/0).
        if (s[i]! <= TOL && x[p]! - s[i]! > 0) alpha = Math.min(alpha, x[p]! / (x[p]! - s[i]!));
      });
      P.forEach((p, i) => {
        x[p] = x[p]! + alpha * (s[i]! - x[p]!);
        if (x[p]! <= TOL) {
          x[p] = 0;
          passive[p] = 0;
        }
      });
    }
  }
  return { x: [...x] };
}
