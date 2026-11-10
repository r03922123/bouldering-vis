import { classifyWithProbe, type Probe } from './probe';

const DIM = 512;
const basis = (i: number, scale = 1) => {
  const v = new Array(DIM).fill(0);
  v[i] = scale;
  return v;
};

const probe: Probe = {
  classes: ['jug', 'crimp', 'sloper'],
  weights: [basis(0, 4), basis(1, 4), basis(2, 4)],
  bias: [0, 0, 0],
};

describe('classifyWithProbe', () => {
  it('ranks the class whose weights match the embedding first, probabilities summing to 1', () => {
    const top = classifyWithProbe(Float32Array.from(basis(1)), probe);
    expect(top[0]!.type).toBe('crimp');
    expect(top[0]!.prob).toBeGreaterThan(0.5);
    expect(top.reduce((s, t) => s + t.prob, 0)).toBeCloseTo(1, 5);
  });

  it('normalizes the embedding, so scale never changes the answer', () => {
    const a = classifyWithProbe(Float32Array.from(basis(2)), probe);
    const b = classifyWithProbe(Float32Array.from(basis(2, 7)), probe);
    expect(a[0]!.prob).toBeCloseTo(b[0]!.prob, 6);
  });

  it('includes the bias', () => {
    const biased = { ...probe, bias: [10, 0, 0] };
    expect(classifyWithProbe(Float32Array.from(basis(1)), biased)[0]!.type).toBe('jug');
  });

  it("subtracts the probe's mean before scoring, as the trainer did", () => {
    // Centering on basis(1) removes the crimp evidence from a basis(1) embedding entirely.
    const centered: Probe = { ...probe, mean: basis(1) };
    const top = classifyWithProbe(Float32Array.from(basis(1)), centered);
    expect(top.map((t) => t.prob)).toEqual([1 / 3, 1 / 3, 1 / 3].map((v) => expect.closeTo(v, 6)));
  });
});
