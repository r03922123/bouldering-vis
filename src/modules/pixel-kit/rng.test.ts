import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRng, hashSeed } from './rng';

// SPEC-pixel-kit › Decisions P9, AC 23 (RNG part).

describe('createRng (mulberry32)', () => {
  it('matches the review test vectors for seed 1 (AC 23)', () => {
    const r = createRng(1);
    expect(r()).toBeCloseTo(0.6270739406, 10);
    expect(r()).toBeCloseTo(0.0027357212, 10);
    expect(r()).toBeCloseTo(0.52744704, 10);
  });

  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = createRng(0x5eed);
    const b = createRng(0x5eed);
    for (let i = 0; i < 1000; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(createRng(2)()).not.toBe(createRng(1)());
  });

  it('records its source and licence, and uses no Math.random', () => {
    const src = readFileSync(join(import.meta.dirname, 'rng.ts'), 'utf8');
    expect(src).toMatch(/Tommy Ettinger/);
    expect(src).toMatch(/CC0/);
    expect(src).not.toMatch(/Math\.random|Date\.now|performance\.now/);
  });
});

describe('hashSeed (FNV-1a over int32 parts)', () => {
  /** FNV-1a 32 straight from its definition, over the little-endian bytes of each part. */
  const reference = (...parts: number[]) => {
    let h = 0x811c9dc5;
    for (const p of parts)
      for (let k = 0; k < 4; k++) {
        h ^= ((p | 0) >>> (8 * k)) & 0xff;
        h = Number((BigInt(h) * 0x01000193n) & 0xffffffffn);
      }
    return h;
  };

  it('starts from the FNV offset basis', () => {
    expect(hashSeed()).toBe(0x811c9dc5);
  });

  it('matches the reference and returns a uint32', () => {
    for (const parts of [[0], [1], [0x61], [-1], [3, 141, 59], [2 ** 31 - 1, -(2 ** 31)]]) {
      const h = hashSeed(...parts);
      expect(h).toBe(reference(...parts));
      expect(Number.isInteger(h) && h >= 0 && h < 2 ** 32).toBe(true);
    }
  });

  it('depends on the order of the parts', () => {
    expect(hashSeed(1, 2)).not.toBe(hashSeed(2, 1));
  });
});
