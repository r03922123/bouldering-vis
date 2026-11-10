import type { HoldGeometry } from './geometry';
import { forceWithOverride } from './force';
import { describePull, isCustomPull, PRESET_DIR, snapPull } from './pull';

const deg = (d: number) => (d * Math.PI) / 180;
/** Down (image frame +y), turned `a` degrees toward +x. */
const downTurned = (a: number): [number, number, number] => [Math.sin(deg(a)), Math.cos(deg(a)), 0];

const flat: HoldGeometry = {
  holdId: 'a',
  normal: [0, 0, 1],
  wallNormal: [0, 0, 1],
  consistency: 0.9,
  orientation: 'standard',
  facing: 'left',
};

describe('snapPull', () => {
  it('snaps to a preset within 12°', () => {
    expect(snapPull(downTurned(11))).toBe('down');
    expect(snapPull([0.1, 0, -1])).toBe('into');
  });

  it('keeps a drawn direction (unit length) beyond 12°', () => {
    const p = snapPull(downTurned(25));
    expect(isCustomPull(p)).toBe(true);
    if (!isCustomPull(p)) return;
    expect(Math.hypot(...p.custom)).toBeCloseTo(1, 9);
    expect(p.custom[0]).toBeCloseTo(Math.sin(deg(25)), 9);
  });

  it('never snaps when aiming freely', () => {
    expect(isCustomPull(snapPull(downTurned(5), true))).toBe(true);
  });

  it('has presets that are unit vectors in the image frame', () => {
    expect(PRESET_DIR.down).toEqual([0, 1, 0]);
    expect(PRESET_DIR.into).toEqual([0, 0, -1]);
  });
});

describe('describePull', () => {
  it('names the main direction and a clear second one', () => {
    expect(describePull([0, 1, 0])).toBe('Pull down');
    expect(describePull(downTurned(-20))).toBe('Pull down and a little left');
    expect(describePull(downTurned(45))).toBe('Pull down and right');
    expect(describePull([0, 0, -1])).toBe('Push into the wall');
    expect(describePull([0, 0.5, -0.85])).toBe('Push into the wall and down');
    expect(describePull([0, 0, 1])).toBe('Pull out from the wall');
  });
});

describe('forceWithOverride with a drawn direction', () => {
  it('uses the drawn vector, marks it as set by the user, and words it', () => {
    const f = forceWithOverride(flat, 'jug', { custom: downTurned(-20) });
    expect(f.source).toBe('user');
    expect(f.dir![0]).toBeCloseTo(Math.sin(deg(-20)), 9);
    expect(f.cue).toBe('Pull down and a little left (set by you)');
  });
});
