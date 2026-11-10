// SPEC-pixel-kit › Decisions P9. All randomness in the pixel layer (chalk-puff jitter, sound noise)
// comes from this seeded generator, so a replay looks the same every time.
//
// mulberry32 by Tommy Ettinger, written in 2017 and published as a C gist:
// https://gist.github.com/tommyettinger/46a874533244883189143505d203312c
// Licence: the author dedicated it to the public domain under CC0 1.0
// (http://creativecommons.org/publicdomain/zero/1.0/), checked on 2026-11-01. This is our own
// TypeScript port of that published algorithm.

/** mulberry32: a seeded 32-bit generator returning floats in [0, 1). */
export function createRng(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let z = Math.imul(state ^ (state >>> 15), state | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a (32-bit) over the little-endian bytes of each part, taken as an int32 → uint32. */
export function hashSeed(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const p = part | 0;
    for (let k = 0; k < 4; k++) {
      h ^= (p >>> (8 * k)) & 0xff;
      h = Math.imul(h, 0x01000193);
    }
  }
  return h >>> 0;
}
