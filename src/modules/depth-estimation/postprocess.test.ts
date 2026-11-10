import { computeNormals, depthToColormap, normalizeDepth, upsampleBilinear } from './postprocess';

describe('upsampleBilinear', () => {
  it('keeps corners and interpolates between them (2×2 → 3×3)', () => {
    const out = upsampleBilinear(new Float32Array([0, 1, 2, 3]), 2, 2, 3, 3);
    expect(Array.from(out)).toEqual([0, 0.5, 1, 1, 1.5, 2, 2, 2.5, 3]);
  });

  it('returns the requested size', () => {
    expect(upsampleBilinear(new Float32Array(4), 2, 2, 7, 5)).toHaveLength(35);
  });
});

describe('normalizeDepth', () => {
  it('maps the 1st–99th percentile range onto 0–1 and clips outliers', () => {
    const d = new Float32Array(1000);
    for (let i = 0; i < 1000; i++) d[i] = i;
    d[999] = 1e6; // one outlier (e.g. a lamp)
    const n = normalizeDepth(d);
    expect(Math.min(...n)).toBe(0);
    expect(Math.max(...n)).toBe(1);
    expect(n[500]).toBeCloseTo((500 - 10) / (990 - 10), 2);
  });

  it('returns zeros for a constant input', () => {
    expect(Array.from(normalizeDepth(new Float32Array([5, 5, 5])))).toEqual([0, 0, 0]);
  });
});

const angle = (n: Float32Array, i: number, e: [number, number, number]) => {
  const dot = n[i * 3]! * e[0] + n[i * 3 + 1]! * e[1] + n[i * 3 + 2]! * e[2];
  return (Math.acos(Math.min(1, dot)) * 180) / Math.PI;
};

describe('computeNormals', () => {
  it('gives (0, 0, 1) everywhere on a flat depth map', () => {
    const n = computeNormals(new Float32Array(20 * 20).fill(0.4), 20, 20);
    for (let i = 0; i < 400; i++) {
      expect(n[i * 3]).toBeCloseTo(0, 6);
      expect(n[i * 3 + 1]).toBeCloseTo(0, 6);
      expect(n[i * 3 + 2]).toBeCloseTo(1, 6);
    }
  });

  it('matches the analytic normal of an x-ramp within 2° away from the border', () => {
    const w = 40;
    const h = 30;
    const slope = 0.01; // depth units per pixel
    const d = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = x * slope;
    const gain = 40;
    const n = computeNormals(d, w, h, { gain });
    const ex = -gain * slope;
    const len = Math.hypot(ex, 0, 1);
    const expected: [number, number, number] = [ex / len, 0, 1 / len];
    for (let y = 8; y < h - 8; y++)
      for (let x = 8; x < w - 8; x++) {
        expect(angle(n, y * w + x, expected)).toBeLessThan(2);
      }
  });

  it('tilts toward −y on a y-ramp (nearer at the bottom)', () => {
    const w = 20;
    const d = new Float32Array(w * w);
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) d[y * w + x] = y * 0.01;
    const n = computeNormals(d, w, w);
    const c = 10 * w + 10;
    expect(n[c * 3 + 1]).toBeLessThan(0);
    expect(n[c * 3]).toBeCloseTo(0, 6);
  });

  it('points outward on a sphere cap (left side faces left, right side faces right)', () => {
    const w = 41;
    const d = new Float32Array(w * w);
    for (let y = 0; y < w; y++)
      for (let x = 0; x < w; x++) {
        const r2 = (x - 20) ** 2 + (y - 20) ** 2;
        d[y * w + x] = Math.max(0, 1 - r2 / 400) * 0.3;
      }
    const n = computeNormals(d, w, w);
    expect(n[(20 * w + 10) * 3]).toBeLessThan(0);
    expect(n[(20 * w + 30) * 3]).toBeGreaterThan(0);
  });

  it('returns unit vectors', () => {
    const d = Float32Array.from({ length: 100 }, (_, i) => Math.sin(i));
    const n = computeNormals(d, 10, 10);
    for (let i = 0; i < 100; i++)
      expect(Math.hypot(n[i * 3]!, n[i * 3 + 1]!, n[i * 3 + 2]!)).toBeCloseTo(1, 5);
  });
});

describe('computeNormals with auto gain', () => {
  it('scales so the 90th-percentile slope reads as 45°, whatever the depth scale', () => {
    for (const slope of [0.001, 0.004]) {
      const w = 60;
      const h = 30;
      const d = new Float32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = x * slope;
      const n = computeNormals(d, w, h, { gain: 'auto' });
      const i = (15 * w + 30) * 3;
      expect(n[i]).toBeCloseTo(-Math.SQRT1_2, 2);
      expect(n[i + 2]).toBeCloseTo(Math.SQRT1_2, 2);
    }
  });

  it('keeps a flat map flat', () => {
    const n = computeNormals(new Float32Array(400).fill(0.3), 20, 20, { gain: 'auto' });
    expect(n[2]).toBeCloseTo(1, 6);
  });
});

describe('depthToColormap (viridis)', () => {
  it('maps far (0) to dark purple #440154 and near (1) to yellow #FDE725', () => {
    const img = depthToColormap(new Float32Array([0, 1]), 2, 1);
    const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]!) <= 3);
    expect(near(Array.from(img.data.slice(0, 3)), [0x44, 0x01, 0x54])).toBe(true);
    expect(near(Array.from(img.data.slice(4, 7)), [0xfd, 0xe7, 0x25])).toBe(true);
    expect(img.data[3]).toBe(255);
  });
});
