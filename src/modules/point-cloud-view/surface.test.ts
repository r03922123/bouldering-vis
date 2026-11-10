import type { DepthMap } from '../depth-estimation';
import { intrinsics, unproject } from './build';
import { buildSurface, LIGHT, shade, surfacePositions } from './surface';

function flatDepth(w: number, h: number, normal: [number, number, number] = [0, 0, 1]): DepthMap {
  const n = w * h;
  const normals = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) normals.set(normal, i * 3);
  return {
    imageId: 'x',
    width: w,
    height: h,
    depth: new Float32Array(n).fill(0.3),
    normals,
    discontinuities: new Uint8Array(n),
  };
}

describe('shade', () => {
  it('brightens surfaces that face the light and darkens those turned away, never to black', () => {
    const lit = shade(new Float32Array([1, 1, 1]), Int32Array.from([0]), Float32Array.from(LIGHT));
    const away = shade(
      new Float32Array([1, 1, 1]),
      Int32Array.from([0]),
      Float32Array.from(LIGHT.map((v) => -v)),
    );
    expect(lit[0]).toBeCloseTo(1, 6);
    expect(away[0]).toBeGreaterThan(0.4);
    expect(away[0]).toBeLessThan(lit[0]!);
  });

  it('keeps the hue: all channels scale together', () => {
    const out = shade(
      new Float32Array([0.8, 0.4, 0.2]),
      Int32Array.from([0]),
      new Float32Array([0, 0, 1]),
    );
    expect(out[1]! / out[0]!).toBeCloseTo(0.5, 6);
    expect(out[2]! / out[0]!).toBeCloseTo(0.25, 6);
  });
});

describe('buildSurface', () => {
  const rgba = (w: number, h: number) =>
    ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(w * h * 4).fill(200),
      colorSpace: 'srgb',
    }) as ImageData;

  it('makes two triangles per grid cell', () => {
    const s = buildSurface(flatDepth(3, 3), rgba(3, 3), 1);
    expect(s.vertexCount).toBe(9);
    expect(s.index.length).toBe(2 * 2 * 2 * 3); // 2×2 cells, 2 triangles each
    expect(s.colors.length).toBe(27);
  });

  it('skips triangles that touch a depth jump, so edges are not stretched into sheets', () => {
    const d = flatDepth(3, 3);
    d.discontinuities![4] = 1; // the center vertex is on a jump
    const s = buildSurface(d, rgba(3, 3), 1);
    expect([...s.index]).not.toContain(4); // no kept triangle uses the jump vertex
    expect(s.index.length).toBe(2 * 3); // two corner triangles don't touch the center
  });

  it('samples on a stride', () => {
    const s = buildSurface(flatDepth(9, 9), rgba(9, 9), 4);
    expect(s.vertexCount).toBe(9); // x, y ∈ {0, 4, 8}
  });

  it('drops triangles that span a steep slope across the grid cell (smears at grazing angles)', () => {
    const ramp = (slope: number) => {
      const d = flatDepth(9, 9);
      for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) d.depth[y * 9 + x] = x * slope;
      return buildSurface(d, rgba(9, 9), 4);
    };
    expect(ramp(0.005).index.length).toBeGreaterThan(0); // gentle: 0.02 per cell, kept
    expect(ramp(0.03).index.length).toBe(0); // 0.12 per cell, over the 0.08 jump: dropped
  });

  it('puts relief in positions only, so a relief change never rebuilds the triangles', () => {
    const d = flatDepth(9, 9);
    d.depth[40] = 0.5;
    const pos = surfacePositions(d, 0.6, 4);
    expect(pos.length).toBe(buildSurface(d, rgba(9, 9), 4).vertexCount * 3);
    // Vertex 4 = grid (1, 1) = pixel (4, 4) = index 40.
    const expected = unproject(4.5, 4.5, 0.5, intrinsics(9, 9), 0.6);
    expected.forEach((v, i) => expect(pos[4 * 3 + i]).toBeCloseTo(v, 6));
  });
});
