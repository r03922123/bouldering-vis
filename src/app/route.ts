import { useSyncExternalStore } from 'react';
import { SAMPLES } from '../modules/image-input';

// SPEC-game › Amendment (b) › The Studio inside the world. Hash routes, so the static site needs
// no rewrite rules: #/gym is the gym, #/studio the Setting Room (today's Studio), #/wall/<id> a
// wall. SPEC-launch-wall-2 R3: #/ (and anything unknown) opens Wall 2, the one wall that ships.

export type Route = { name: 'gym' } | { name: 'studio' } | { name: 'wall'; id: string };

/** The front door: Wall 2 (SPEC-launch-wall-2 R3). The gym has no visible way in from it. */
export const FRONT_WALL = 'wall-b';
const FRONT: Route = { name: 'wall', id: FRONT_WALL };

/** The wall id of the player's own photo (SPEC-play-shell S14). */
export const MY_WALL = 'mine';

/** The walls there are: the sample bays and your own photo. */
const isWall = (id: string) => id === MY_WALL || SAMPLES.some((s) => s.id === id);

/** Anything unknown or malformed opens the front door, an unknown wall id included. */
export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/');
  if (parts.length === 1 && parts[0] === 'gym') return { name: 'gym' };
  if (parts.length === 1 && parts[0] === 'studio') return { name: 'studio' };
  if (parts.length === 2 && parts[0] === 'wall' && parts[1]) {
    try {
      const id = decodeURIComponent(parts[1]);
      return isWall(id) ? { name: 'wall', id } : FRONT;
    } catch {
      return FRONT;
    }
  }
  return FRONT;
}

export function routeHash(route: Route): string {
  if (route.name === 'studio') return '#/studio';
  if (route.name === 'wall') return `#/wall/${encodeURIComponent(route.id)}`;
  return '#/gym';
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

const currentHash = () => window.location.hash;

/** The current route; re-renders on links, back and forward. */
export function useRoute(): Route {
  return parseRoute(useSyncExternalStore(subscribe, currentHash));
}

/** The hash a route is written as, or null when `hash` already is it (or is empty). */
export function canonicalHash(hash: string): string | null {
  if (hash === '' || hash === '#') return null;
  const canon = routeHash(parseRoute(hash));
  return hash === canon ? null : canon;
}
