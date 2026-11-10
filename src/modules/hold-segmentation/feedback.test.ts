import { PULSE_MS, pulseRing } from './feedback';

describe('pulseRing', () => {
  it('starts fully visible at the hold and ends invisible, 14 px out', () => {
    expect(pulseRing(0)).toEqual({ grow: 0, alpha: 1 });
    expect(pulseRing(PULSE_MS)).toEqual({ grow: 14, alpha: 0 });
  });

  it('eases out: most of the growth happens early', () => {
    expect(pulseRing(PULSE_MS / 2)!.grow).toBeGreaterThan(7);
  });

  it('is finished (null) after the duration', () => {
    expect(pulseRing(PULSE_MS + 1)).toBeNull();
  });

  it('holds a steady ring when the user prefers reduced motion', () => {
    expect(pulseRing(PULSE_MS / 2, true)).toEqual({ grow: 4, alpha: 1 });
  });
});
