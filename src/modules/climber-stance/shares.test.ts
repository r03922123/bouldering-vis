import { roundShares } from './shares';

describe('roundShares', () => {
  it('rounds to whole numbers that add up to 100', () => {
    const r = roundShares({ lh: 16.6, rh: 16.6, lf: 33.4, rf: 33.4 });
    expect(Object.values(r).reduce((s, v) => s + v!, 0)).toBe(100);
    expect(r).toEqual({ lh: 17, rh: 17, lf: 33, rf: 33 });
  });

  it('keeps a negative share (an undercling pulls you down)', () => {
    const r = roundShares({ lh: -10.4, rh: -10.4, lf: 60.4, rf: 60.4 });
    expect(Object.values(r).reduce((s, v) => s + v!, 0)).toBe(100);
    expect(r.lh).toBeLessThan(0);
  });
});
