import type { DepthMap } from '../depth-estimation';
import type { HoldMask } from '../hold-segmentation';
import { buildPointCloud, flyingPixels, intrinsics, pickStride, recolor, unproject } from './build';

describe('intrinsics + unproject', () => {
  const k = intrinsics(1536, 1152);

  it('uses a 60° horizontal field of view with the principal point at the center', () => {
    expect(k.f).toBeCloseTo(768 / Math.tan(Math.PI / 6), 6);
    expect([k.cx, k.cy]).toEqual([768, 576]);
  });

  it('puts the center pixel on the optical axis at z = 1 − relief·d', () => {
    const [x, y, z] = unproject(768, 576, 0.5, k, 0.35);
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(0, 9);
    expect(z).toBeCloseTo(-(1 - 0.35 * 0.5), 9);
  });

  it('puts the left edge at depth 0 at x = −tan(30°)', () => {
    expect(unproject(0, 576, 0, k, 0.35)[0]).toBeCloseTo(-Math.tan(Math.PI / 6), 6);
  });

  it('flips image y so +y is up', () => {
    expect(unproject(768, 0, 0, k, 0.35)[1]).toBeGreaterThan(0);
  });

  it('gives a flat plane when relief is 0', () => {
    expect(unproject(10, 20, 0.9, k, 0)[2]).toBe(-1);
    expect(unproject(1500, 1100, 0.1, k, 0)[2]).toBe(-1);
  });
});

describe('pickStride', () => {
  it('keeps the total under the budget for a 1536×1152 image', () => {
    for (const selected of [0, 50_000]) {
      const s = pickStride(1536, 1152, 300_000, selected);
      expect(Math.ceil(1536 / s) * Math.ceil(1152 / s) + selected).toBeLessThanOrEqual(300_000);
      // …and is the smallest stride that does.
      if (s > 1)
        expect(Math.ceil(1536 / (s - 1)) * Math.ceil(1152 / (s - 1)) + selected).toBeGreaterThan(
          300_000,
        );
    }
  });

  it('is 1 for a small image', () => {
    expect(pickStride(100, 100, 300_000, 0)).toBe(1);
  });
});

describe('flyingPixels', () => {
  it('marks pixels next to a depth step and leaves a smooth ramp alone', () => {
    const w = 20;
    const step = new Float32Array(w * w).map((_, i) => (i % w < 10 ? 0.1 : 0.6));
    const ramp = new Float32Array(w * w).map((_, i) => (i % w) * 0.01);
    const s = flyingPixels(step, w, w);
    expect(s[5 * w + 9]).toBe(1);
    expect(s[5 * w + 10]).toBe(1);
    expect(s[5 * w + 3]).toBe(0);
    expect(flyingPixels(ramp, w, w).every((v) => v === 0)).toBe(true);
  });
});

function scene() {
  const w = 40;
  const h = 30;
  const n = w * h;
  const depth = new Float32Array(n).fill(0.2);
  for (let i = 0; i < n; i++) if (i % w >= 30) depth[i] = 0.8; // a step at x = 30
  const map: DepthMap = {
    imageId: 'img',
    width: w,
    height: h,
    depth,
    normals: new Float32Array(n * 3),
  };
  const rgba = (r: number) => {
    const data = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) data.set([r, 10, 20, 255], i * 4);
    return { width: w, height: h, data, colorSpace: 'srgb' } as ImageData;
  };
  const mask = new Uint8Array(n);
  for (let y = 10; y < 14; y++) for (let x = 10; x < 14; x++) mask[y * w + x] = 1; // 16 px hold
  const hold = { id: 'h', mask } as HoldMask;
  return { w, h, map, source: rgba(200), composite: rgba(43), hold };
}

describe('buildPointCloud', () => {
  it('includes every selected-hold pixel and respects the budget', () => {
    const { w, map, source, composite, hold } = scene();
    const c = buildPointCloud({
      depth: map,
      source,
      composite,
      holds: [hold],
      colorMode: 'route',
      relief: 0.35,
      budget: 200,
    });
    expect(c.count).toBeLessThanOrEqual(200);
    const idx = new Set(c.indices);
    for (let y = 10; y < 14; y++)
      for (let x = 10; x < 14; x++) expect(idx.has(y * w + x)).toBe(true);
    expect(c.positions).toHaveLength(c.count * 3);
    expect(c.colors).toHaveLength(c.count * 3);
    expect(c.sizes).toHaveLength(c.count);
  });

  it('drops points at the depth step', () => {
    const { w, map, source, composite } = scene();
    const c = buildPointCloud({
      depth: map,
      source,
      composite,
      holds: [],
      colorMode: 'route',
      relief: 0.35,
      budget: 1e6,
    });
    for (const i of c.indices) expect([29, 30]).not.toContain(i % w);
  });

  it('enlarges selected holds and colors by mode', () => {
    const { w, map, source, composite, hold } = scene();
    const route = buildPointCloud({
      depth: map,
      source,
      composite,
      holds: [hold],
      colorMode: 'route',
      relief: 0.35,
      budget: 1e6,
    });
    const at = route.indices.indexOf(11 * w + 11);
    const wall = route.indices.indexOf(2 * w + 2);
    expect(route.sizes[at]).toBeCloseTo(1.6, 6);
    expect(route.sizes[wall]).toBe(1);
    expect(route.colors[wall * 3]).toBeCloseTo(43 / 255, 6);
    const photo = buildPointCloud({
      depth: map,
      source,
      composite,
      holds: [hold],
      colorMode: 'photo',
      relief: 0.35,
      budget: 1e6,
    });
    expect(photo.colors[wall * 3]).toBeCloseTo(200 / 255, 6);
  });

  it('recolor changes only colors, from the same pixels', () => {
    const { map, source, composite, hold } = scene();
    const c = buildPointCloud({
      depth: map,
      source,
      composite,
      holds: [hold],
      colorMode: 'route',
      relief: 0.35,
      budget: 1e6,
    });
    const positions = c.positions.slice();
    const colors = recolor(c.indices, source);
    expect(colors[0]).toBeCloseTo(200 / 255, 6);
    expect(Array.from(c.positions)).toEqual(Array.from(positions));
  });
});
