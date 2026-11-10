import { useSyncExternalStore } from 'react';

// SPEC-pixel-kit › Boundaries: honour prefers-reduced-motion, including changes while the page is
// open (no breathing and no puffs). Subscribes to the media query's change event.

const QUERY = '(prefers-reduced-motion: reduce)';

const query = (): MediaQueryList | null =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(QUERY)
    : null;

function subscribe(onChange: () => void): () => void {
  const mq = query();
  if (!mq) return () => {};
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

const snapshot = () => query()?.matches ?? false;

/** Subscribes to the media query's change event (not read once). */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
