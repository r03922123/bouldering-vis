import type { PixelBuffer } from './buffer';
import { COLOR } from './palette';
import { createRng } from './rng';
import type { Pt } from './types';
import { artPixel, type ArtGrid } from './view';

// SPEC-pixel-kit › Rendering Rules › Chalk puffs. Pure: a puff's particles depend only on its
// seed and age. Chalk puffs are the one drawing with no ink outline.

/** at: image px. */
export interface ChalkPuff {
  seed: number;
  at: Pt;
  bornMs: number;
}

/** Art px from floor(toArt(at)). */
export interface Particle {
  x: number;
  y: number;
  size: 1 | 2;
  dither: boolean;
}

export const PUFF_PARTICLES = 8 as const;
export const PUFF_MAX_LIFE_MS = 600 as const;
export const MAX_PUFFS = 6 as const;

/** Art px / s², downward. */
const GRAVITY = 30;
const BIG_UNTIL_S = 0.12;
const DITHER_FROM = 0.7;

/** The live particles of a puff `ageMs` after its birth (none before birth or from 600 ms). */
export function puffParticles(seed: number, ageMs: number): readonly Particle[] {
  if (!(ageMs >= 0 && ageMs < PUFF_MAX_LIFE_MS)) return [];
  const r = createRng(seed);
  const a = ageMs / 1000;
  const out: Particle[] = [];
  for (let i = 0; i < PUFF_PARTICLES; i++) {
    // Five draws per particle, in this order, whether or not it is still alive.
    const theta = -Math.PI / 2 + (r() - 0.5) * ((5 * Math.PI) / 6);
    const v = 10 + 14 * r();
    const life = 350 + 250 * r();
    const x0 = (r() - 0.5) * 2;
    const y0 = (r() - 0.5) * 2;
    if (ageMs >= life) continue;
    out.push({
      x: Math.floor(x0 + v * Math.cos(theta) * a),
      y: Math.floor(y0 + v * Math.sin(theta) * a + 0.5 * GRAVITY * a * a),
      size: a < BIG_UNTIL_S ? 2 : 1,
      dither: ageMs >= DITHER_FROM * life,
    });
  }
  return out;
}

/** Draws one puff at `timeMs`, in chalk, clipped; dithered particles only on even (x + y). */
export function rasterPuff(buf: PixelBuffer, grid: ArtGrid, puff: ChalkPuff, timeMs: number): void {
  const { width: w, height: h, data } = buf;
  if (!w || !h) return;
  const o = artPixel(grid, puff.at);
  if (!Number.isFinite(o.x) || !Number.isFinite(o.y)) return;
  for (const p of puffParticles(puff.seed, timeMs - puff.bornMs)) {
    for (let dy = 0; dy < p.size; dy++) {
      for (let dx = 0; dx < p.size; dx++) {
        const x = o.x + p.x + dx;
        const y = o.y + p.y + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        if (p.dither && (x + y) % 2) continue;
        data[y * w + x] = COLOR.chalk;
      }
    }
  }
}
