/** How long the "hold added" ring animates. */
export const PULSE_MS = 450;
const GROW_PX = 14;

/**
 * The ring around a newly added hold at `t` ms: grows (ease-out) and fades. Reduced motion → a
 * steady ring for the same duration. Null when finished.
 */
export function pulseRing(
  t: number,
  reducedMotion = false,
): { grow: number; alpha: number } | null {
  if (t > PULSE_MS) return null;
  if (reducedMotion) return { grow: 4, alpha: 1 };
  const k = Math.min(1, Math.max(0, t / PULSE_MS));
  const eased = 1 - (1 - k) ** 3;
  return {
    grow: Math.round(GROW_PX * eased * 100) / 100,
    alpha: Math.round((1 - k) * 1000) / 1000,
  };
}
