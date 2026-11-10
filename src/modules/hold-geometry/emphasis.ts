import type { Force } from './force';

export type Emphasis = 'default' | 'notable';

/**
 * Most holds get the type rule's "pull down": that's the expected case, so it's drawn subtle.
 * Anything else (a measured surface, a sloper press, a sidepull…) is the information: drawn bold.
 */
export function forceEmphasis(f: Force): Emphasis | null {
  if (!f.dir) return null;
  // A direction the user chose is always shown bold.
  return f.source === 'type' && f.dir[1] >= 0.95 ? 'default' : 'notable';
}
