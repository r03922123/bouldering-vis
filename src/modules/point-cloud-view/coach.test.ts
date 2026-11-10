import { AIM_COACH_KEY, hasSeenAimCoach, markAimCoachSeen } from './coach';

function memory() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => m.set(k, v),
  };
}

describe('aim coach memory', () => {
  it('is unseen until marked, then stays seen', () => {
    const store = memory();
    expect(hasSeenAimCoach(store)).toBe(false);
    markAimCoachSeen(store);
    expect(hasSeenAimCoach(store)).toBe(true);
    expect(store.getItem(AIM_COACH_KEY)).toBe('seen');
  });

  it('treats missing or throwing storage as unseen, without throwing', () => {
    expect(hasSeenAimCoach(null)).toBe(false);
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(hasSeenAimCoach(broken)).toBe(false);
    expect(() => markAimCoachSeen(broken)).not.toThrow();
  });
});
