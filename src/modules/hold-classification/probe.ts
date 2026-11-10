// SPEC-hold-classification › Amendment 2026-10-30 (D7): a linear probe on the frozen CLIP image
// embedding. Trained offline by scripts/hold-data/train-probe.mjs; ships as src/data/clip-probe.json.

export interface Probe {
  /** Catalog ids the probe predicts (edge is never one: the data's crimp covers both, D6). */
  classes: string[];
  /** Subtracted from the normalized embedding before scoring (the training set's mean). */
  mean?: number[];
  /** One 512-wide row per class. */
  weights: number[][];
  bias: number[];
}

/** Softmax over the probe's logits for an L2-normalized embedding; all classes, best first. */
export function classifyWithProbe(
  embedding: Float32Array,
  probe: Probe,
): { type: string; prob: number }[] {
  const norm = Math.hypot(...embedding) || 1;
  const mean = probe.mean;
  const logits = probe.classes.map((_, k) => {
    const w = probe.weights[k]!;
    let s = probe.bias[k] ?? 0;
    for (let d = 0; d < w.length; d++) s += w[d]! * (embedding[d]! / norm - (mean?.[d] ?? 0));
    return s;
  });
  const max = Math.max(...logits);
  const exps = logits.map((z) => Math.exp(z - max));
  const sum = exps.reduce((a, v) => a + v, 0);
  return probe.classes
    .map((type, k) => ({ type, prob: exps[k]! / sum }))
    .sort((a, b) => b.prob - a.prob);
}
