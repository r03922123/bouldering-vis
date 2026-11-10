import { create } from 'zustand';
import { DEFAULT_PROFILE, profileFor, type Level, type Profile } from '../modules/gym-hub';

// SPEC-gym-hub G8 and Amendment 2026-11-02 W3: the climber profile, in memory only until
// `progression` saves it (step 5). Nothing asks the level for now, so everyone starts as the
// default (a gym climber); `answer` and `dismiss` stay for when the level is asked again (W5).

type Aid = 'hints' | 'numbers';

interface ProfileState {
  profile: Profile;
  /** The player's own aid toggles (S8). Kept apart from the answer, so a toggle never answers. */
  aids: Partial<Record<Aid, boolean>>;
  answer: (level: Level) => void;
  dismiss: () => void;
  setAid: (aid: Aid, on: boolean) => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
  profile: DEFAULT_PROFILE,
  aids: {},
  // The level sets the defaults; an aid the player toggled stays as they set it.
  answer: (level) => set((s) => ({ profile: { ...profileFor(level), ...s.aids } })),
  dismiss: () => set((s) => ({ profile: { ...DEFAULT_PROFILE, ...s.aids } })),
  setAid: (aid, on) =>
    set((s) => ({
      aids: { ...s.aids, [aid]: on },
      profile: { ...s.profile, [aid]: on },
    })),
}));

/** The profile Play uses: the profile with the player's aids. */
export function playProfile(s: Pick<ProfileState, 'profile' | 'aids'>): Profile {
  return { ...s.profile, ...s.aids };
}
