import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createBuffer } from './buffer';
import { COLOR } from './palette';
import {
  MAX_PUFFS,
  PUFF_MAX_LIFE_MS,
  PUFF_PARTICLES,
  puffParticles,
  rasterPuff,
  type ChalkPuff,
} from './puffs';
import { createRng } from './rng';
import { artGrid, artPixel } from './view';

// SPEC-pixel-kit › Rendering Rules › Chalk puffs, AC 24 and AC 25 (puffs).

const identity = (w: number, h: number) =>
  artGrid({ scale: 1, tx: 0, ty: 0, boxW: w, boxH: h, dpr: 1 }, 1);

describe('constants', () => {
  it('caps puffs at 8 particles, 600 ms and 6 puffs', () => {
    expect([PUFF_PARTICLES, PUFF_MAX_LIFE_MS, MAX_PUFFS]).toEqual([8, 600, 6]);
  });
});

describe('puffParticles (AC 24)', () => {
  it('is identical across calls and returns at most 8 particles', () => {
    for (const a of [0, 50, 119, 120, 300, 420, 599]) {
      const p = puffParticles(7, a);
      expect(p).toEqual(puffParticles(7, a));
      expect(p.length).toBeLessThanOrEqual(8);
    }
    expect(puffParticles(7, 0)).toHaveLength(8);
  });

  it('returns none before birth or from 600 ms on', () => {
    expect(puffParticles(7, -1)).toEqual([]);
    expect(puffParticles(7, 600)).toEqual([]);
    expect(puffParticles(7, 10_000)).toEqual([]);
    expect(puffParticles(7, NaN)).toEqual([]);
  });

  it('differs between seeds 1 and 2 at 100 ms', () => {
    expect(puffParticles(1, 100)).not.toEqual(puffParticles(2, 100));
  });

  it('follows the spec formulas: 5 draws per particle, gravity 30 art px/s²', () => {
    const seed = 42;
    const ageMs = 200;
    const r = createRng(seed);
    const a = ageMs / 1000;
    const expected = [];
    for (let i = 0; i < 8; i++) {
      const theta = -Math.PI / 2 + (r() - 0.5) * ((5 * Math.PI) / 6);
      const v = 10 + 14 * r();
      const life = 350 + 250 * r();
      const x0 = (r() - 0.5) * 2;
      const y0 = (r() - 0.5) * 2;
      if (ageMs >= life) continue;
      expected.push({
        x: Math.floor(x0 + v * Math.cos(theta) * a),
        y: Math.floor(y0 + v * Math.sin(theta) * a + 0.5 * 30 * a * a),
        size: 1,
        dither: ageMs >= 0.7 * life,
      });
    }
    expect(puffParticles(seed, ageMs)).toEqual(expected);
  });

  it('draws 2 × 2 particles before 120 ms and 1 × 1 after', () => {
    expect(puffParticles(3, 119).every((p) => p.size === 2)).toBe(true);
    expect(puffParticles(3, 120).every((p) => p.size === 1)).toBe(true);
  });

  it('dithers in the last 30 % of a life and drops particles past their life', () => {
    expect(puffParticles(3, 100).some((p) => p.dither)).toBe(false);
    // Lives are 350–600 ms: by 420 ms every particle is dithering or gone.
    expect(puffParticles(3, 420).every((p) => p.dither)).toBe(true);
    const counts = [0, 349, 400, 500, 599].map((t) => puffParticles(3, t).length);
    expect(counts[0]).toBe(8);
    for (let i = 1; i < counts.length; i++) expect(counts[i]!).toBeLessThanOrEqual(counts[i - 1]!);
  });

  it('uses no Math.random or clock', () => {
    const src = readFileSync(join(import.meta.dirname, 'puffs.ts'), 'utf8');
    expect(src).not.toMatch(/Math\.random|Date\.now|performance\.now|setTimeout/);
  });
});

describe('rasterPuff', () => {
  const g = identity(40, 40);
  const puff: ChalkPuff = { seed: 9, at: { x: 20.4, y: 25.8 }, bornMs: 1000 };

  it('draws chalk pixels with no outline, relative to floor(toArt(at))', () => {
    const b = createBuffer(40, 40);
    rasterPuff(b, g, puff, 1050);
    const o = artPixel(g, puff.at);
    const lit = new Set<number>();
    b.data.forEach((v, i) => {
      if (v) {
        expect(v).toBe(COLOR.chalk);
        lit.add(i);
      }
    });
    const expected = new Set<number>();
    for (const p of puffParticles(9, 50))
      for (let dy = 0; dy < p.size; dy++)
        for (let dx = 0; dx < p.size; dx++) expected.add((o.y + p.y + dy) * 40 + o.x + p.x + dx);
    expect(lit).toEqual(expected);
  });

  it('draws dithered particles only on even (x + y) pixels', () => {
    const b = createBuffer(40, 40);
    rasterPuff(b, g, puff, 1000 + 450);
    const dithered = puffParticles(9, 450).filter((p) => p.dither);
    expect(dithered.length).toBeGreaterThan(0);
    b.data.forEach((v, i) => {
      if (v) expect(((i % 40) + Math.floor(i / 40)) % 2).toBe(0);
    });
  });

  it('draws nothing before birth or after the puff is gone', () => {
    for (const t of [999, 1600, 5000]) {
      const b = createBuffer(40, 40);
      rasterPuff(b, g, puff, t);
      expect(b.data.every((v) => v === 0)).toBe(true);
    }
  });

  it('leaves the buffer unchanged for a puff wholly outside, and clips one partly outside (AC 25)', () => {
    const b = createBuffer(40, 40);
    rasterPuff(b, g, { ...puff, at: { x: -50, y: -50 } }, 1050);
    rasterPuff(b, g, { ...puff, at: { x: 500, y: 20 } }, 1050);
    expect(b.data.every((v) => v === 0)).toBe(true);
    const edge = createBuffer(40, 40);
    expect(() => rasterPuff(edge, g, { ...puff, at: { x: 0.5, y: 0.5 } }, 1050)).not.toThrow();
    expect(edge.data.some((v) => v !== 0)).toBe(true);
    expect(() => rasterPuff(createBuffer(0, 0), identity(0, 0), puff, 1050)).not.toThrow();
    const nan = createBuffer(40, 40);
    rasterPuff(nan, g, { ...puff, at: { x: NaN, y: 3 } }, 1050);
    expect(nan.data.every((v) => v === 0)).toBe(true);
  });
});
