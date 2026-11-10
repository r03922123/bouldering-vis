import { coneEdges, coneFor, SLOPER_HALF_ANGLE, SLOPER_MU } from './cones';
import { solveForces, type Contact } from './equilibrium';
import { dot, norm, unit, type Vec3 } from './vec';

const H = 1000;
const DOWN: Vec3 = [0, 1, 0];
const deg = (d: number) => (d * Math.PI) / 180;
const jug = coneFor('lh', 'jug', DOWN);
const expectVec = (v: Vec3, w: Vec3) => v.forEach((x, i) => expect(x).toBeCloseTo(w[i]!, 9));

describe('coneFor', () => {
  it('turns a hand pull into a reaction cone around the opposite direction', () => {
    expectVec(jug.axis, [0, -1, 0]);
    expect(jug.halfAngle).toBeCloseTo(deg(55), 9);
  });

  it('uses the type angles from the spec', () => {
    expect(coneFor('rh', 'crimp', DOWN).halfAngle).toBeCloseTo(deg(35), 9);
    expect(coneFor('rh', 'sloper', DOWN).halfAngle).toBeCloseTo(SLOPER_HALF_ANGLE, 9);
    expect(coneFor('rh', 'pinch', null).halfAngle).toBeCloseTo(deg(60), 9);
    const unknown = coneFor('rh', null, null);
    expectVec(unknown.axis, [0, -1, 0]);
    expect(unknown.halfAngle).toBeCloseTo(deg(40), 9);
  });

  it('gives feet an up-and-out cone, and a smear its own cone', () => {
    const foot = coneFor('lf', 'edge', DOWN);
    expect(foot.axis[1]).toBeLessThan(0);
    expect(foot.axis[2]).toBeGreaterThan(0);
    expectVec(coneFor('lf', 'smear', null).axis, [0, 0, 1]);
    expect(coneFor('lf', 'smear', null).halfAngle).toBeCloseTo(deg(35), 9);
  });
});

// Amendment 2026-11-01 (c), picked footholds (builder's call; the user can veto): a foot stands on
// top of a tagged hold whatever its hand type, so it gets the foothold cone.
describe('coneFor: a foot on any tagged route hold', () => {
  const foothold = coneFor('lf', null, null);

  it('is the foothold cone, axis unit(0, −1, 0.6) at 45°', () => {
    expectVec(foothold.axis, unit([0, -1, 0.6]));
    expect(foothold.halfAngle).toBeCloseTo(deg(45), 9);
  });

  it.each(['sloper', 'volume', 'jug', 'crimp', 'edge', 'pinch', 'pocket'])(
    'on a hold typed %s',
    (type) => {
      for (const foot of ['lf', 'rf'] as const) {
        expect(coneFor(foot, type, DOWN)).toEqual(foothold);
        expect(coneFor(foot, type, null)).toEqual(foothold);
        expect(coneFor(foot, type, DOWN, { normal: [0, -0.5, 0.87], source: 'measured' })).toEqual(
          foothold,
        );
      }
    },
  );

  it('leaves hands on their type cones', () => {
    expect(coneFor('rh', 'sloper', DOWN).halfAngle).toBeCloseTo(SLOPER_HALF_ANGLE, 9);
    expectVec(coneFor('lh', 'sloper', DOWN).axis, [0, -1, 0]);
    expect(coneFor('lh', 'crimp', DOWN).halfAngle).toBeCloseTo(deg(35), 9);
    expect(coneFor('rh', 'volume', null, { normal: [0, 0, 1], source: 'assumed' })).toEqual({
      axis: [0, 0, 1],
      halfAngle: SLOPER_HALF_ANGLE,
    });
  });
});

// Amendment 2026-10-31 (b), AC 30: the sloper rows of the cone table.
describe('coneFor on slopers and volumes', () => {
  const tilted = unit([0, -0.94, 0.34]);

  it('takes the half-angle from skin-on-hold friction, atan(0.72)', () => {
    expect(SLOPER_MU).toBe(0.72);
    expect(SLOPER_HALF_ANGLE).toBeCloseTo(0.624, 4);
  });

  it('centres a hand cone on the grip surface’s normal when it has one', () => {
    for (const type of ['sloper', 'volume']) {
      const c = coneFor('lh', type, [0, 0.6, -1], { normal: tilted, source: 'measured' });
      expectVec(c.axis, tilted);
      expect(c.halfAngle).toBeCloseTo(SLOPER_HALF_ANGLE, 9);
    }
  });

  it('keeps today’s axis without a surface: −dir, or up at 40° when there is no pull', () => {
    for (const type of ['sloper', 'volume']) {
      const pulled = coneFor('rh', type, [0, 0.6, -1]);
      expectVec(pulled.axis, unit([0, -0.6, 1]));
      expect(pulled.halfAngle).toBeCloseTo(SLOPER_HALF_ANGLE, 9);
      const free = coneFor('rh', type, null);
      expectVec(free.axis, [0, -1, 0]);
      expect(free.halfAngle).toBeCloseTo(deg(40), 9);
    }
  });

  // Amended 2026-11-01 (c): a foot on a sloper or volume had the smear cone; it now stands on the
  // hold with the foothold cone. A smear is unchanged, and a surface never turns a foot's cone.
  it('leaves the smear cone alone, and puts a foot on a sloper on the foothold cone', () => {
    const surface = { normal: tilted, source: 'measured' } as const;
    const smear = coneFor('lf', 'smear', null, surface);
    expectVec(smear.axis, [0, 0, 1]);
    expect(smear.halfAngle).toBeCloseTo(deg(35), 9);
    for (const type of ['sloper', 'volume']) {
      expect(coneFor('lf', type, null, surface)).toEqual(coneFor('lf', null, null));
    }
  });
});

describe('coneEdges', () => {
  it('puts 8 unit edges at the half-angle from the axis', () => {
    const edges = coneEdges({ axis: [0, 0.6, 0.8], halfAngle: deg(40) });
    expect(edges).toHaveLength(8);
    for (const e of edges) {
      expect(norm(e)).toBeCloseTo(1, 9);
      expect(dot(e, [0, 0.6, 0.8])).toBeCloseTo(Math.cos(deg(40)), 9);
    }
  });
});

describe('solveForces', () => {
  const hand = (limb: Contact['limb'], x: number, cone = jug): Contact => ({
    limb,
    point: [x, 0, 0],
    cone,
  });

  it('hangs from one jug with the center of mass straight below', () => {
    const s = solveForces([hand('lh', 0)], [0, 500, 0], DOWN, H);
    expect(s.feasible).toBe(true);
    expect(s.forces.lh![1]).toBeCloseTo(-1, 3);
  });

  it('cannot hang from one hand with the center of mass off to the side', () => {
    expect(solveForces([hand('lh', 0)], [300, 500, 0], DOWN, H).feasible).toBe(false);
  });

  it('shares the weight evenly between two symmetric hands', () => {
    const s = solveForces([hand('lh', -100), hand('rh', 100)], [0, 500, 0], DOWN, H);
    expect(s.feasible).toBe(true);
    expect(norm(s.forces.lh!)).toBeCloseTo(norm(s.forces.rh!), 3);
    expect(s.forces.lh![1] + s.forces.rh![1]).toBeCloseTo(-1, 3);
  });

  it('slips when the pull needed lies outside the cone', () => {
    const sloper = coneFor('lh', 'sloper', [0, 0.6, -1]);
    expect(solveForces([hand('lh', 0, sloper)], [0, 500, 0], DOWN, H).feasible).toBe(false);
  });

  it('with no contacts nothing holds the body', () => {
    expect(solveForces([], [0, 0, 0], DOWN, H).feasible).toBe(false);
  });
});

// SPEC-climber-stance Amendment 2026-11-04, M4 rule 3 (AC 49): a pinch keeps its 60° with a pull set.
describe('the pinch cone', () => {
  it('is 60° with a user or setter pull, as without one', () => {
    expect(coneFor('lh', 'pinch', DOWN).halfAngle).toBeCloseTo(Math.PI / 3, 12);
    const free = coneFor('lh', 'pinch', null);
    expect(free.halfAngle).toBeCloseTo(Math.PI / 3, 12);
    free.axis.forEach((v, i) => expect(v).toBeCloseTo([0, -1, 0][i]!, 12));
  });
});
