import { useSyncExternalStore } from 'react';

// SPEC-play-shell › Amendment 2026-11-02 (b) U2 and U3: the Play HUD has a wide layout (photo
// left, side panel right) at 900 CSS px and up, and a phone layout below (bottom bar, drawer).
// Amendment 2026-11-04 L1: a phone on its side (landscape, at most 500 px tall) is wide too; the
// portrait bottom bar covered half its height and hid the COACH.

export const WIDE_QUERY = '(min-width: 900px), (orientation: landscape) and (max-height: 500px)';

const query = (): MediaQueryList | null =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(WIDE_QUERY)
    : null;

function subscribe(onChange: () => void): () => void {
  const mq = query();
  if (!mq) return () => {};
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/**
 * True on a wide screen. Builder's call: with no media queries at all (jsdom, an old browser) it
 * is the wide, desktop-first layout, where every control is on screen at once.
 */
const snapshot = () => query()?.matches ?? true;

/** The layout follows the window live (a rotated tablet, a resized window). */
export function useWide(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => true);
}
