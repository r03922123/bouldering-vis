import type { Level } from './profile';

// SPEC-gym-hub G1, G9, G10: one straight floor, left to right, with places 56 art px apart.

export type PlaceKind = 'desk' | 'lockers' | 'bay' | 'new-wall' | 'setting-room';

export interface Place {
  id: string;
  kind: PlaceKind;
  /** Art px along the floor. */
  x: number;
  label: string;
  sampleId?: string;
}

export const PLACE_GAP = 56;
/** The first place's x: half a gap in from the left wall. */
const FIRST_X = PLACE_GAP / 2;
/** How close (art px) the climber must stand to use a place. */
const REACH = 8;

/** The places for this level, in floor order. A beginner's gym has no Setting Room door yet (G9). */
export function placesFor(
  level: Level,
  samples: readonly { id: string; name: string }[],
): readonly Place[] {
  const kinds: Omit<Place, 'x'>[] = [
    { id: 'desk', kind: 'desk', label: 'Front desk' },
    { id: 'lockers', kind: 'lockers', label: 'Lockers' },
    ...samples.map((s) => ({
      id: `bay:${s.id}`,
      kind: 'bay' as const,
      label: s.name,
      sampleId: s.id,
    })),
    { id: 'new-wall', kind: 'new-wall', label: 'New wall' },
    ...(level === 'beginner'
      ? []
      : [{ id: 'setting-room', kind: 'setting-room' as const, label: 'Setting Room' }]),
  ];
  return kinds.map((p, i) => ({ ...p, x: FIRST_X + i * PLACE_GAP }));
}

/** The quick-travel strip's order: a pro gets the Setting Room and New wall first (G9). */
export function stripFor(level: Level, places: readonly Place[]): readonly Place[] {
  if (level !== 'pro') return places;
  const first = (['setting-room', 'new-wall'] as const)
    .map((kind) => places.find((p) => p.kind === kind))
    .filter((p): p is Place => p !== undefined);
  return [...first, ...places.filter((p) => !first.includes(p))];
}

/** The place the climber is standing at, if any. */
export function placeAt(places: readonly Place[], x: number): Place | null {
  return places.find((p) => Math.abs(p.x - x) <= REACH) ?? null;
}
