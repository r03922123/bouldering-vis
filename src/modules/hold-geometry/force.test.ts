import { forceDirection } from './force';
import type { HoldGeometry } from './geometry';

const geom = (
  normal: [number, number, number],
  orientation: HoldGeometry['orientation'] = 'standard',
  consistency = 0.9,
): HoldGeometry => ({
  holdId: 'h',
  normal,
  wallNormal: [0, 0, 1],
  consistency,
  orientation,
  facing: 'out',
});
const unit = (v: number[]) => Math.hypot(...v);

describe('forceDirection', () => {
  it('pushes perpendicular into a reliable surface: a left-facing sidepull is pulled to the right, into the wall', () => {
    const f = forceDirection(geom([-0.6, 0, 0.8], 'sidepull'), 'jug');
    expect(f.source).toBe('surface');
    expect(f.dir![0]).toBeCloseTo(0.6, 6);
    expect(f.dir![2]).toBeCloseTo(-0.8, 6);
    expect(f.cue).toBe('Pull sideways into the wall; turn your chest to the hold');
  });

  it('pulls an undercling up and out', () => {
    // Faces down (+y in image coordinates), so the force points up (−y).
    const f = forceDirection(geom([0, 0.6, 0.8], 'undercling'), null);
    expect(f.dir![1]).toBeLessThan(0);
    expect(f.cue).toBe('Pull up and out; drop your hips');
  });

  it('falls back to the type rule when the surface faces the camera', () => {
    const f = forceDirection(geom([0, 0, 1]), 'crimp');
    expect(f.source).toBe('type');
    [0, 1, 0].forEach((v, i) => expect(f.dir![i]).toBeCloseTo(v, 9)); // straight down the wall
    expect(f.cue).toBe('Pull down; keep your elbow under the edge');
  });

  it('falls back to the type rule when the surface normal is unreliable', () => {
    const f = forceDirection(geom([-0.6, 0, 0.8], 'sidepull', 0.2), 'jug');
    expect(f.source).toBe('type');
    expect(f.cue).toBe('Pull down into the incut');
  });

  it('presses a sloper into the wall and down', () => {
    const f = forceDirection(geom([0, 0, 1]), 'sloper');
    expect(f.dir![1]).toBeGreaterThan(0); // down
    expect(f.dir![2]).toBeLessThan(0); // into the wall
    expect(unit(f.dir!)).toBeCloseTo(1, 9);
    expect(f.cue).toBe('Press into the wall; get your hips under the hold');
  });

  it('gives no arrow for a pinch, only a cue', () => {
    expect(forceDirection(geom([0, 0, 1]), 'pinch')).toEqual({
      dir: null,
      source: 'none',
      cue: 'Squeeze; no single pull direction',
    });
  });

  it('treats a foot chip as a foothold: no hand pull, step on it', () => {
    expect(forceDirection(geom([0, 0, 1]), 'foot-chip')).toEqual({
      dir: null,
      source: 'none',
      cue: 'Foothold: step on it with the tip of your shoe',
    });
  });

  it('gives nothing for a volume or an unknown type', () => {
    expect(forceDirection(geom([0, 0, 1]), 'volume')).toEqual({
      dir: null,
      source: 'none',
      cue: null,
    });
    expect(forceDirection(geom([0, 0, 1]), null)).toEqual({ dir: null, source: 'none', cue: null });
  });

  it('measures "down" along the wall when the wall itself tilts', () => {
    const g = { ...geom([0, 0.6, 0.8]), wallNormal: [0, 0.6, 0.8] as [number, number, number] };
    const f = forceDirection(g, 'jug');
    // Perpendicular to the wall normal and pointing down the wall.
    expect(f.dir![0] * 0 + f.dir![1] * 0.6 + f.dir![2] * 0.8).toBeCloseTo(0, 9);
    expect(f.dir![1]).toBeGreaterThan(0);
  });
});

describe('forceWithOverride (the user corrects the direction)', () => {
  it('uses the computed force when there is no override', async () => {
    const { forceWithOverride } = await import('./force');
    const g = geom([0, 0, 1]);
    expect(forceWithOverride(g, 'crimp', null)).toEqual(forceDirection(g, 'crimp'));
  });

  it.each([
    ['down', [0, 1, 0], 'Pull down (set by you)'],
    ['up', [0, -1, 0], 'Pull up (set by you)'],
    ['left', [-1, 0, 0], 'Pull left (set by you)'],
    ['right', [1, 0, 0], 'Pull right (set by you)'],
    ['into', [0, 0, -1], 'Push into the wall (set by you)'],
  ] as const)('override %s points %j', async (pull, dir, cue) => {
    const { forceWithOverride } = await import('./force');
    const f = forceWithOverride(geom([0, 0, 1]), 'pinch', pull);
    expect(f).toEqual({ dir, source: 'user', cue });
  });

  // Pro review: a thin vertical edge is a sidepull, pulled sideways toward the body, not down.
  describe('sidepull from the hold shape', () => {
    const upright = (x: number): HoldGeometry => ({
      ...geom([0, 0, 1]),
      shape: { elongation: 3.5, tiltDeg: 8, x },
    });

    it('pulls a vertical edge left of the body toward the body (rightward)', () => {
      const f = forceDirection(upright(100), 'crimp', 300);
      expect(f.dir![0]).toBeGreaterThan(0.8);
      expect(Math.abs(f.dir![1])).toBeLessThan(0.2);
      expect(f.cue).toMatch(/^Sidepull/);
    });

    it('pulls a vertical edge right of the body leftward', () => {
      expect(forceDirection(upright(500), 'edge', 300).dir![0]).toBeLessThan(-0.8);
    });

    // SPEC-climber-stance Amendment 2026-11-04, M4 (narrowed, D2-A): an upright hold with no type
    // is a sidepull too (AC 50); a pinch keeps no single pull (two faces, the climber picks one).
    it('pulls an untyped upright hold sideways toward the body', () => {
      const f = forceDirection(
        { ...geom([0, 0, 1]), shape: { elongation: 3, tiltDeg: 10, x: 100 } },
        null,
        300,
      );
      expect(f.source).toBe('type');
      expect(f.dir![0]).toBeGreaterThan(0.8);
      expect(f.cue).toMatch(/^Sidepull/);
    });

    it('keeps a pinch two-sided: no single pull, whatever its shape', () => {
      const f = forceDirection(
        { ...geom([0, 0, 1]), shape: { elongation: 3, tiltDeg: 10, x: 100 } },
        'pinch',
        300,
      );
      expect(f).toEqual({ dir: null, source: 'none', cue: 'Squeeze; no single pull direction' });
    });

    it('keeps an untyped hold that isn’t upright without a pull', () => {
      expect(
        forceDirection(
          { ...geom([0, 0, 1]), shape: { elongation: 1.3, tiltDeg: 5, x: 100 } },
          null,
          300,
        ).dir,
      ).toBeNull();
    });

    it('keeps pulling down on a short or flat hold, or without a body position', () => {
      expect(
        forceDirection(
          { ...geom([0, 0, 1]), shape: { elongation: 1.3, tiltDeg: 5, x: 100 } },
          'crimp',
          300,
        ).dir![1],
      ).toBeGreaterThan(0.9);
      expect(
        forceDirection(
          { ...geom([0, 0, 1]), shape: { elongation: 4, tiltDeg: 85, x: 100 } },
          'crimp',
          300,
        ).dir![1],
      ).toBeGreaterThan(0.9);
      expect(forceDirection(upright(100), 'crimp').dir![1]).toBeGreaterThan(0.9);
    });
  });
});
