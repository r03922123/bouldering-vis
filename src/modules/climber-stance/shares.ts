import type { Limb } from './types';

/**
 * Whole-number shares that still add up to the rounded total (largest remainder), so the panel's
 * rows always read 100 % together.
 */
export function roundShares<K extends string = Limb>(
  shares: Partial<Record<K, number>>,
): Partial<Record<K, number>> {
  const entries = Object.entries(shares) as [K, number][];
  const target = Math.round(entries.reduce((s, [, v]) => s + v, 0));
  const out: Partial<Record<K, number>> = {};
  let sum = 0;
  for (const [l, v] of entries) {
    out[l] = Math.floor(v);
    sum += out[l]!;
  }
  const byRemainder = [...entries].sort(
    (a, b) => b[1] - Math.floor(b[1]) - (a[1] - Math.floor(a[1])),
  );
  for (let i = 0; sum < target && i < byRemainder.length; i++, sum++) out[byRemainder[i]![0]]! += 1;
  return out;
}
