import { HOLD_TYPES } from './classify';
import type { Probe } from './probe';
import { rankEmbedding } from './rank';

const DIM = 512;
const basis = (i: number) => {
  const v = new Float32Array(DIM);
  v[i] = 1;
  return v;
};

describe('rankEmbedding', () => {
  it('uses zero-shot text embeddings when no probe is shipped, over every type but foot chip', () => {
    // The foot-chip prompt sits at cosine 0.95–0.98 to every other type, so zero-shot would call
    // most holds a foot chip (measured: 222 of 275 real holds). It stays a picker/probe-only type.
    const ranked = rankEmbedding(basis(3), null);
    expect(ranked.map((t) => t.type).sort()).toEqual(
      HOLD_TYPES.filter((t) => t !== 'foot-chip').sort(),
    );
    expect(ranked.reduce((s, t) => s + t.prob, 0)).toBeCloseTo(1, 5);
  });

  it('uses the probe when one is shipped, and only its classes', () => {
    const probe: Probe = {
      classes: ['jug', 'sloper'],
      weights: [Array.from(basis(0), (v) => v * 4), Array.from(basis(1), (v) => v * 4)],
      bias: [0, 0],
    };
    const ranked = rankEmbedding(basis(1), probe);
    expect(ranked.map((t) => t.type)).toEqual(['sloper', 'jug']);
  });
});
