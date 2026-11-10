import {
  ARROW_PER_BODYWEIGHT,
  BODY_CHIP,
  CHIP,
  flatProjection,
  layoutStance,
  STANCE_COLOR,
} from './overlay';
import { solveStance, type StanceContacts } from './stance';

const H = 1000;
const contacts: StanceContacts = {
  lh: { holdId: 'a', point: [-100, 0], type: 'jug', dir: [0, 1, 0] },
  rh: { holdId: 'b', point: [100, 0], type: 'jug', dir: [0, 1, 0] },
  lf: { holdId: 'c', point: [-120, 750], type: 'edge', dir: null },
  rf: { holdId: 'd', point: [120, 750], type: 'edge', dir: null },
};
// Screen = image × 0.5, shifted by (200, 100).
const toScreen = flatProjection((p) => ({ x: 200 + p.x / 2, y: 100 + p.y / 2 }));

describe('layoutStance', () => {
  const stance = solveStance(contacts, { height: H, wallAngleDeg: 0 });
  const l = layoutStance(stance, contacts, H, toScreen)!;

  it('draws a solid figure with 11 bones, left limbs cyan and right limbs orange', () => {
    expect(l.dashed).toBe(false);
    expect(l.bones).toHaveLength(11);
    expect(l.bones.filter((b) => b.color === STANCE_COLOR.left)).toHaveLength(4);
    expect(l.bones.filter((b) => b.color === STANCE_COLOR.right)).toHaveLength(4);
  });

  it('puts a chip and a force arrow at each contact, scaled to the screen', () => {
    expect(l.chips.map((c) => c.text)).toEqual([CHIP.lh, CHIP.rh, CHIP.lf, CHIP.rf]);
    const lh = l.arrows[0]!;
    expect([lh.x, lh.y]).toEqual([150, 100]);
    expect(lh.uy).toBeGreaterThan(0); // the hand pulls down
    const f = stance.load.lh!.force;
    const expected = Math.hypot(f[0], f[1]) * ARROW_PER_BODYWEIGHT * H * 0.5;
    expect(lh.length).toBeCloseTo(expected, 6);
  });

  it('places the center of mass with a plumb line straight down', () => {
    expect(l.com.x).toBeCloseTo(200 + stance.com[0] / 2, 6);
    expect(l.plumb.b.x).toBe(l.plumb.a.x);
    expect(l.plumb.b.y).toBeGreaterThan(l.plumb.a.y);
  });

  it('shows where the hips can move as a range through the center of mass', () => {
    expect(l.range).not.toBeNull();
    expect(l.range!.a.y).toBeCloseTo(l.com.y, 6);
    expect(l.range!.a.x).toBeLessThanOrEqual(l.com.x);
    expect(l.range!.b.x).toBeGreaterThanOrEqual(l.com.x);
  });

  it('keeps matched hands’ chips apart', () => {
    const matched: StanceContacts = { ...contacts, rh: { ...contacts.lh!, holdId: 'a' } };
    const out = layoutStance(
      solveStance(matched, { height: H, wallAngleDeg: 0 }),
      matched,
      H,
      toScreen,
    )!;
    const [lh, rh] = out.chips;
    expect(rh!.x - lh!.x).toBeGreaterThanOrEqual(24);
  });

  it('dashes a stance that can’t be held and shows the gap to an unreachable hold', () => {
    const far: StanceContacts = { ...contacts, lf: { ...contacts.lf!, point: [-120, 1200] } };
    const s = solveStance(far, { height: H, wallAngleDeg: 0 });
    const out = layoutStance(s, far, H, toScreen)!;
    expect(out.dashed).toBe(true);
    expect(out.reachGaps).toHaveLength(1);
    expect(out.reachGaps[0]!.b).toEqual({ x: 140, y: 700 });
  });

  it('has nothing to draw without a skeleton', () => {
    const s = solveStance({}, { height: H, wallAngleDeg: 0 });
    expect(layoutStance(s, {}, H, toScreen)).toBeNull();
  });
});

// Amendment 2026-11-04, M1: a grey chip where the hips rest on the wall.
describe('layoutStance › the body on the wall (M1)', () => {
  const hang: StanceContacts = { lh: contacts.lh, rh: contacts.rh };
  it('puts a "Body" chip at the hips, only when they rest on the wall', () => {
    const s = solveStance(hang, { height: H, wallAngleDeg: 0 });
    const l = layoutStance(s, hang, H, toScreen)!;
    const chip = l.chips.find((c) => c.text === BODY_CHIP)!;
    expect(chip.color).toBe(STANCE_COLOR.wall);
    expect(chip.x).toBeCloseTo(200 + s.joints!.pelvis[0] / 2, 6);
    expect(chip.y).toBeCloseTo(100 + s.joints!.pelvis[1] / 2, 6);
    const feet = layoutStance(
      solveStance(contacts, { height: H, wallAngleDeg: 0 }),
      contacts,
      H,
      toScreen,
    )!;
    expect(feet.chips.some((c) => c.text === BODY_CHIP)).toBe(false);
  });
});

// Amendment 2026-11-04, M3: a hooked foot's chip says how it hooks.
describe('layoutStance › hooks (M3)', () => {
  it('labels a hooked foot "LF·heel" / "RF·toe"', () => {
    const hooked: StanceContacts = {
      ...contacts,
      lf: { ...contacts.lf!, hook: 'heel' },
      rf: { ...contacts.rf!, hook: 'toe' },
    };
    const l = layoutStance(
      solveStance(hooked, { height: H, wallAngleDeg: 35 }),
      hooked,
      H,
      toScreen,
    )!;
    expect(l.chips.map((c) => c.text)).toEqual([CHIP.lh, CHIP.rh, 'LF·heel', 'RF·toe']);
  });
});
