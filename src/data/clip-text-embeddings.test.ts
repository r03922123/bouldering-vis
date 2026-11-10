import data from './clip-text-embeddings.json';
import { HOLD_TYPES } from '../modules/hold-classification/worker';

describe('clip-text-embeddings.json', () => {
  it('has one 512-d unit vector per hold type', () => {
    expect(Object.keys(data.embeddings).sort()).toEqual([...HOLD_TYPES].sort());
    for (const v of Object.values(data.embeddings) as number[][]) {
      expect(v).toHaveLength(512);
      expect(Math.hypot(...v)).toBeCloseTo(1, 4);
    }
  });

  it('keeps the classes distinguishable (no two embeddings identical)', () => {
    const vs = Object.values(data.embeddings) as number[][];
    for (let i = 0; i < vs.length; i++) {
      for (let j = i + 1; j < vs.length; j++) {
        const cos = vs[i]!.reduce((s, x, k) => s + x * vs[j]![k]!, 0);
        expect(cos).toBeLessThan(0.99);
      }
    }
  });
});
