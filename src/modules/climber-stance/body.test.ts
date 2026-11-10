import { bodyDims, centerOfMass, MASS, type Joints } from './body';
import type { Vec3 } from './vec';

const H = 1000;

/** Standing straight on the floor (y = 0), arms hanging, facing the wall. Image frame: +y down. */
function standing(): Joints {
  const d = bodyDims(H);
  const at = (x: number, heightAboveFloor: number): Vec3 => [x, -heightAboveFloor, 0];
  const sh = d.shoulderHalf;
  const hp = d.hipHalf;
  const shoulderY = d.legLength + d.trunk;
  return {
    pelvis: at(0, d.legLength),
    neck: at(0, shoulderY),
    head: at(0, shoulderY + d.headOffset),
    lShoulder: at(-sh, shoulderY),
    rShoulder: at(sh, shoulderY),
    lElbow: at(-sh, shoulderY - d.upperArm),
    rElbow: at(sh, shoulderY - d.upperArm),
    lHand: at(-sh, shoulderY - d.upperArm - d.forearm),
    rHand: at(sh, shoulderY - d.upperArm - d.forearm),
    lHip: at(-hp, d.legLength),
    rHip: at(hp, d.legLength),
    lKnee: at(-hp, d.shank),
    rKnee: at(hp, d.shank),
    lFoot: at(-hp, 0),
    rFoot: at(hp, 0),
  };
}

describe('body model', () => {
  it('uses de Leva mass fractions that add up to 100 %', () => {
    const total =
      MASS.head +
      MASS.trunk +
      2 * (MASS.upperArm + MASS.forearm + MASS.hand) +
      2 * (MASS.thigh + MASS.shank + MASS.foot);
    expect(total).toBeGreaterThan(0.999);
    expect(total).toBeLessThan(1.001);
  });

  it('puts the standing center of mass at 55–58 % of height', () => {
    const com = centerOfMass(standing());
    expect(-com[1] / H).toBeGreaterThanOrEqual(0.55);
    expect(-com[1] / H).toBeLessThanOrEqual(0.58);
    expect(com[0]).toBeCloseTo(0, 9);
  });

  it('scales every length with height', () => {
    const a = bodyDims(1000);
    const b = bodyDims(2000);
    expect(b.upperArm).toBeCloseTo(2 * a.upperArm, 9);
    expect(b.legLength).toBeCloseTo(2 * a.legLength, 9);
  });
});
