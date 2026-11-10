import { pointBudget, pointSize, routeTarget, verticalFovDeg } from './camera';

describe('camera helpers', () => {
  it('derives the vertical FOV from a 60° horizontal FOV and the image aspect', () => {
    // tan(v/2) = tan(30°) × h/w
    const v = verticalFovDeg(1536, 1152);
    expect(Math.tan(((v / 2) * Math.PI) / 180)).toBeCloseTo(Math.tan(Math.PI / 6) * 0.75, 9);
  });

  it('uses a 120k point budget on touch devices and 300k otherwise', () => {
    expect(pointBudget(true)).toBe(120_000);
    expect(pointBudget(false)).toBe(300_000);
  });

  it('sizes points so neighbours on the stride grid touch at z = 1', () => {
    // stride 3 px at f = 1330 px → spacing 3/1330 world units at z = 1.
    expect(pointSize(3, 1330)).toBeCloseTo((3 / 1330) * 1.5, 9);
  });

  it('orbits around a point on the optical axis at the route depth (keeps the photo framing)', () => {
    const positions = new Float32Array([0, 0, -0.8, 2, 2, -0.6, 10, 10, -1]);
    const sizes = new Float32Array([1.6, 1.6, 1]);
    const [x, y, z] = routeTarget(positions, sizes);
    expect([x, y]).toEqual([0, 0]);
    expect(z).toBeCloseTo(-0.7, 6);
    expect(routeTarget(positions, new Float32Array([1, 1, 1]))).toEqual([0, 0, -1]);
  });
});

describe('fitCamera (contain the photo in any box, never stretch it)', () => {
  const tanHalf = (deg: number) => Math.tan(((deg / 2) * Math.PI) / 180);

  it('uses the box aspect so pixels stay square', async () => {
    const { fitCamera } = await import('./camera');
    expect(fitCamera(1536, 1152, 1248, 504).aspect).toBeCloseTo(1248 / 504, 9);
  });

  it('fits the photo height in a box wider than the photo', async () => {
    const { fitCamera } = await import('./camera');
    expect(fitCamera(1536, 1152, 1248, 504).vfovDeg).toBeCloseTo(verticalFovDeg(1536, 1152), 9);
  });

  it('fits the 60° photo width in a box narrower than the photo', async () => {
    const { fitCamera } = await import('./camera');
    const { aspect, vfovDeg } = fitCamera(1536, 1152, 375, 600);
    // Horizontal FOV = 2·atan(tan(v/2)·aspect) must equal 60°.
    expect(tanHalf(vfovDeg) * aspect).toBeCloseTo(Math.tan(Math.PI / 6), 9);
  });
});
