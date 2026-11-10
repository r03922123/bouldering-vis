import { create } from 'zustand';
import type { Profile } from '../gym-hub';

// SPEC-play-shell › Amendment 2026-11-02 H1 and H3: Play's two view aids, "Hold directions" and
// "Plausible holds". Builder's call: they are session toggles kept here, not in gym-hub's Profile,
// because neither changes the referee or the tray (S8) and the profile's saved shape belongs to
// `progression` (step 5). Like the plans, they last for the session, in memory only.

export type ViewAid = 'directions' | 'plausible';

interface ViewAids {
  /** null until the player toggles it: then it follows the profile (below). */
  directions: boolean | null;
  plausible: boolean;
  set: (aid: ViewAid, on: boolean) => void;
}

export const useViewAids = create<ViewAids>((set) => ({
  directions: null,
  plausible: false,
  set: (aid, on) => set({ [aid]: on }),
}));

/**
 * Hold directions start on where hints are on (beginners: "coach hints"), off otherwise ("hints
 * only on request", amendment (b)). Plausible holds is always off until asked for (H3).
 */
export function viewAidsFor(
  profile: Profile,
  s: Pick<ViewAids, 'directions' | 'plausible'>,
): Record<ViewAid, boolean> {
  return { directions: s.directions ?? profile.hints, plausible: s.plausible };
}

/** Tests only. */
export function resetViewAids(): void {
  useViewAids.setState({ directions: null, plausible: false });
}
