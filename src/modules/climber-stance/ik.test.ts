import { bodyDims } from './body';
import { hipAngle, JOINT_RANGE, legPole, minReach, twoBone } from './ik';
import { dot, norm, sub, type Vec3 } from './vec';

const root: Vec3 = [0, 0, 0];

describe('twoBone', () => {
  it('hits a reachable target and keeps both bone lengths', () => {
    const r = twoBone(root, [120, -150, 30], 100, 120, [0, 1, 0]);
    expect(r.reachable).toBe(true);
    expect(norm(sub(r.end, [120, -150, 30]))).toBeLessThan(0.5);
    expect(norm(sub(r.mid, root))).toBeCloseTo(100, 6);
    expect(norm(sub(r.end, r.mid))).toBeCloseTo(120, 6);
  });

  it('bends the middle joint toward the pole', () => {
    const target: Vec3 = [0, -180, 0];
    const down = twoBone(root, target, 100, 100, [1, 0, 0]);
    expect(down.mid[0]).toBeGreaterThan(0);
    const other = twoBone(root, target, 100, 100, [-1, 0, 0]);
    expect(other.mid[0]).toBeLessThan(0);
  });

  it('reports a target beyond the limb as unreachable and points the limb at it', () => {
    const r = twoBone(root, [0, -300, 0], 100, 100, [1, 0, 0]);
    expect(r.reachable).toBe(false);
    expect(r.reach).toBeCloseTo(1.5, 9);
    expect(dot(sub(r.end, root), [0, -1, 0])).toBeCloseTo(200, 6);
  });

  it('reports a target closer than the bones can fold as unreachable', () => {
    expect(twoBone(root, [0, -5, 0], 100, 140, [1, 0, 0]).reachable).toBe(false);
  });

  it('still bends when the pole lies along the limb', () => {
    const r = twoBone(root, [0, -150, 0], 100, 100, [0, -1, 0]);
    expect(r.reachable).toBe(true);
    expect(norm(sub(r.mid, root))).toBeCloseTo(100, 6);
  });
});

// Amendment 2026-11-04, M2: joint range of motion (CDC Normal Joint ROM, adults 20–44).
describe('joint range', () => {
  const d = bodyDims(1000);

  it('takes its limits from the CDC study, rounded to 5°', () => {
    expect(JOINT_RANGE).toEqual({ knee: 140, elbow: 145, hip: 130 });
  });

  it('gives each limb its chord at full flexion as the shortest reach (AC 44)', () => {
    expect(minReach('rf', d)).toBe(minReach('lf', d));
    expect(Math.abs(minReach('lf', d) - 185)).toBeLessThanOrEqual(1);
    expect(Math.abs(minReach('rh', d) - 117)).toBeLessThanOrEqual(1);
  });

  it('marks a target inside the shortest reach unreachable, but still poses the limb', () => {
    const min = minReach('lf', d);
    const r = twoBone(root, [0, 150, 0], d.thigh, d.shank, [1, 0, 0], min);
    expect(r.reachable).toBe(false);
    expect(norm(sub(r.end, [0, 150, 0]))).toBeLessThan(0.5);
    expect(twoBone(root, [0, min + 1, 0], d.thigh, d.shank, [1, 0, 0], min).reachable).toBe(true);
  });

  it('opens each knee to its own side and slightly down (B5)', () => {
    const right: Vec3 = [1, 0, 0];
    expect(legPole('lf', right)[0]).toBeLessThan(0);
    expect(legPole('rf', right)[0]).toBeGreaterThan(0);
    expect(legPole('lf', right)[1]).toBeGreaterThan(0);
    expect(legPole('rf', right)[2]).toBe(0);
  });

  it('measures the hip from the trunk’s down line (thigh straight down = 0°)', () => {
    const down: Vec3 = [0, 1, 0];
    expect(hipAngle([0, 245, 0], [0, 0, 0], down)).toBeCloseTo(0, 6);
    expect(hipAngle([245, 0, 0], [0, 0, 0], down)).toBeCloseTo(90, 6);
    expect(hipAngle([0, -245, 0], [0, 0, 0], down)).toBeCloseTo(180, 6);
  });
});
