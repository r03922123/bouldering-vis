import { deltaE76, srgbToLab } from './color';

describe('srgbToLab (D65)', () => {
  it('maps white to L=100, a=b=0', () => {
    const [L, a, b] = srgbToLab(255, 255, 255);
    expect(L).toBeCloseTo(100, 1);
    expect(a).toBeCloseTo(0, 1);
    expect(b).toBeCloseTo(0, 1);
  });

  it('maps black to L=0', () => {
    expect(srgbToLab(0, 0, 0)[0]).toBeCloseTo(0, 5);
  });

  it('matches the reference value for pure red within 0.5', () => {
    const [L, a, b] = srgbToLab(255, 0, 0);
    expect(Math.abs(L - 53.24)).toBeLessThan(0.5);
    expect(Math.abs(a - 80.09)).toBeLessThan(0.5);
    expect(Math.abs(b - 67.2)).toBeLessThan(0.5);
  });

  it('matches the reference L for mid grey 128 within 0.5', () => {
    expect(Math.abs(srgbToLab(128, 128, 128)[0] - 53.59)).toBeLessThan(0.5);
  });
});

describe('deltaE76', () => {
  it('is the Euclidean distance in Lab', () => {
    expect(deltaE76([50, 0, 0], [53, 4, 0])).toBeCloseTo(5, 10);
  });
});

describe('labImage', () => {
  it('matches srgbToLab for every pixel', async () => {
    const { labImage } = await import('./color');
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 128, 128, 128, 255, 12, 200, 99, 255]);
    const lab = labImage(rgba);
    [
      [255, 0, 0],
      [128, 128, 128],
      [12, 200, 99],
    ].forEach(([r, g, b], i) => {
      const ref = srgbToLab(r!, g!, b!);
      for (let k = 0; k < 3; k++) expect(lab[i * 3 + k]).toBeCloseTo(ref[k]!, 3);
    });
  });
});
