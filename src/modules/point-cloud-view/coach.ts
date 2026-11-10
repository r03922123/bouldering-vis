/** Remembers, per device, that the aiming coach mark has done its job (Cairn review I4). */
export const AIM_COACH_KEY = 'bouldering-vis:aim-coach';

type Store = Pick<Storage, 'getItem' | 'setItem'>;
const storage = (): Store | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // blocked storage (private mode, iframe): the mark shows every visit, which is fine
  }
};

export function hasSeenAimCoach(store: Store | null = storage()): boolean {
  try {
    return store?.getItem(AIM_COACH_KEY) === 'seen';
  } catch {
    return false;
  }
}

export function markAimCoachSeen(store: Store | null = storage()): void {
  try {
    store?.setItem(AIM_COACH_KEY, 'seen');
  } catch {
    // nothing to do: the mark will simply show again next time
  }
}
