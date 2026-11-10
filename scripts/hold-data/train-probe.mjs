// Dev-only (T39): trains the linear probe on CLIP embeddings (plain Node, no dependencies) and runs
// the ship gate from SPEC-hold-classification › Amendment 2026-10-30.
//
// Train: ClinbingHoldType (all splits) + Beta Guide (if present). Test: gyms the probe never saw
// (capstone, Kaggle real photos, the private held-out set), each reported separately, plus the
// zero-shot baseline on the same embeddings. Writes src/data/clip-probe.json only with --write.
// Usage: node scripts/hold-data/train-probe.mjs [--write]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'tests/fixtures/hold-data';
const DIM = 512;
/** Dataset label → catalog id (D6). null drops the example. */
const MAP = {
  Crimp: 'crimp',
  crimp: 'crimp',
  Jug: 'jug',
  jug: 'jug',
  Pinch: 'pinch',
  pinch: 'pinch',
  Pocket: 'pocket',
  pocket: 'pocket',
  Sloper: 'sloper',
  sloper: 'sloper',
  Slope: 'sloper',
  Volume: 'volume',
  volume: 'volume',
  Foothold: 'foot-chip',
  foot: 'foot-chip',
  jib: 'foot-chip',
  edge: 'edge',
  Other: null,
};
const CLASSES = ['jug', 'crimp', 'sloper', 'pinch', 'pocket', 'volume', 'foot-chip'];
const MIN_TRAIN = 30;

function load(set) {
  const f = join(ROOT, `${set}.jsonl`);
  if (!existsSync(f)) return [];
  return readFileSync(f, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((r) => r.ok && MAP[r.label] !== undefined)
    .map((r) => ({ ...r, y: MAP[r.label] === null ? null : MAP[r.label], x: unit(r.embedding) }))
    .filter((r) => r.y !== null);
}
function unit(v) {
  const n = Math.hypot(...v) || 1;
  return Float32Array.from(v, (x) => x / n);
}

/**
 * Multinomial logistic regression, L2-regularized, full-batch gradient descent with class weights.
 * Embeddings are mean-centered first (CLIP image embeddings share one large common direction that
 * carries no class information); the mean ships with the probe so the app centers the same way.
 */
function train(rows, classes, { l2 = 1e-4, lr = 2, epochs = 1500 } = {}) {
  const K = classes.length;
  const idx = new Map(classes.map((c, i) => [c, i]));
  const mean = new Float32Array(DIM);
  for (const r of rows) for (let d = 0; d < DIM; d++) mean[d] += r.x[d] / rows.length;
  rows = rows.map((r) => ({ ...r, x: center(r.x, mean) }));
  const W = new Float32Array(K * DIM);
  const b = new Float32Array(K);
  const count = classes.map((c) => rows.filter((r) => r.y === c).length);
  const weight = count.map((n) => rows.length / (K * Math.max(1, n))); // balance classes
  const gW = new Float32Array(K * DIM);
  const gb = new Float32Array(K);
  for (let e = 0; e < epochs; e++) {
    gW.fill(0);
    gb.fill(0);
    for (const r of rows) {
      const p = softmax(logits(r.x, W, b, K));
      const t = idx.get(r.y);
      const w = weight[t];
      for (let k = 0; k < K; k++) {
        const g = (p[k] - (k === t ? 1 : 0)) * w;
        gb[k] += g;
        const o = k * DIM;
        for (let d = 0; d < DIM; d++) gW[o + d] += g * r.x[d];
      }
    }
    const n = rows.length;
    for (let i = 0; i < W.length; i++) W[i] -= lr * (gW[i] / n + l2 * W[i]);
    for (let k = 0; k < K; k++) b[k] -= lr * (gb[k] / n);
  }
  return {
    classes,
    mean: [...mean],
    weights: Array.from({ length: K }, (_, k) => [...W.subarray(k * DIM, (k + 1) * DIM)]),
    bias: [...b],
  };
}
const center = (x, mean) => Float32Array.from(x, (v, d) => v - mean[d]);
function logits(x, W, b, K) {
  const out = new Float32Array(K);
  for (let k = 0; k < K; k++) {
    let s = b[k];
    const o = k * DIM;
    for (let d = 0; d < DIM; d++) s += W[o + d] * x[d];
    out[k] = s;
  }
  return out;
}
function softmax(z) {
  const m = Math.max(...z);
  const e = Array.from(z, (v) => Math.exp(v - m));
  const s = e.reduce((a, v) => a + v, 0);
  return e.map((v) => v / s);
}
function predict(probe, x) {
  const K = probe.classes.length;
  const W = Float32Array.from(probe.weights.flat());
  const p = softmax(logits(center(x, probe.mean), W, Float32Array.from(probe.bias), K));
  return probe.classes.map((c, i) => ({ type: c, prob: p[i] })).sort((a, b) => b.prob - a.prob);
}

/** The app's size prior (D1): a hold under 0.8% of the photo can't be a volume. */
const MIN_VOLUME_SHARE = 0.008;
const sizePrior = (ranked, areaFrac) =>
  areaFrac >= MIN_VOLUME_SHARE ? ranked : ranked.filter((t) => t.type !== 'volume');

/** Zero-shot baseline: the app's text embeddings (cosine × 100, softmax) over the given type names. */
const TEXT = JSON.parse(readFileSync('src/data/clip-text-embeddings.json', 'utf8')).embeddings;
const zeroShotOver = (names) => (x) => {
  const z = names.map((n) => 100 * TEXT[n].reduce((s, v, i) => s + v * x[i], 0));
  const p = softmax(Float32Array.from(z));
  return names.map((type, i) => ({ type, prob: p[i] })).sort((a, b) => b.prob - a.prob);
};
const zeroShot = zeroShotOver(Object.keys(TEXT));
const zeroShotNoChip = zeroShotOver(Object.keys(TEXT).filter((n) => n !== 'foot-chip'));

/** Top-1/top-3 and a confusion matrix. Edge labels count as crimp when `merge` (D6). */
function evaluate(rows, rank, merge) {
  const norm = (t) => (merge && t === 'edge' ? 'crimp' : t);
  let top1 = 0;
  let top3 = 0;
  const conf = {};
  const recall = {};
  const predicted = {};
  for (const r of rows) {
    const y = norm(r.y);
    const top = sizePrior(rank(r.x), r.areaFrac ?? 1).map((t) => norm(t.type));
    predicted[top[0]] = (predicted[top[0]] ?? 0) + 1;
    if (top[0] === y) top1++;
    if (top.slice(0, 3).includes(y)) top3++;
    (conf[y] ??= {})[top[0]] = ((conf[y] ??= {})[top[0]] ?? 0) + 1;
  }
  for (const [y, row] of Object.entries(conf)) {
    const n = Object.values(row).reduce((a, v) => a + v, 0);
    recall[y] = `${Math.round((100 * (row[y] ?? 0)) / n)}% (${n})`;
  }
  return {
    n: rows.length,
    top1: pct(top1, rows.length),
    top3: pct(top3, rows.length),
    recall,
    conf,
    predicted,
  };
}
const pct = (a, n) => (n ? `${Math.round((100 * a) / n)}%` : '–');

// ---- run ----
// --train=beta-guide trains on Beta Guide alone (default: ClinbingHoldType + Beta Guide train split).
const trainArg = process.argv.find((a) => a.startsWith('--train='))?.slice(8);
const trainRows = [
  ...(trainArg === 'beta-guide' ? [] : load('clinb')),
  ...load('beta-guide').filter((r) => r.split === 'train'),
];
const counts = Object.fromEntries(
  CLASSES.map((c) => [c, trainRows.filter((r) => r.y === c).length]),
);
console.log('train examples per class:', counts);
const classes = CLASSES.filter((c) => counts[c] >= MIN_TRAIN);
if (classes.length < CLASSES.length)
  console.log(
    'too few to train (fall back to zero-shot):',
    CLASSES.filter((c) => !classes.includes(c)),
  );
const usable = trainRows.filter((r) => classes.includes(r.y));
// Quick same-gym check: hold out every 5th source photo.
const holdout = usable.filter((r) => Number(r.group) % 5 === 0);
const probeHo = train(
  usable.filter((r) => Number(r.group) % 5 !== 0),
  classes,
);
const ho = evaluate(holdout, (x) => predict(probeHo, x), false);
console.log(
  `held-out 20% of training photos: top-1 ${ho.top1}, top-3 ${ho.top3}, recall ${JSON.stringify(ho.recall)}`,
);
const probe = train(usable, classes);
probe.trainedOn = [
  'ClinbingHoldType (CC BY 4.0)',
  ...(load('beta-guide').length ? ['Beta Guide (CC BY 4.0)'] : []),
];
probe.trainedAt = new Date().toISOString().slice(0, 10);

const fit = evaluate(usable, (x) => predict(probe, x), false);
console.log(`train fit (same data): top-1 ${fit.top1}, predicted ${JSON.stringify(fit.predicted)}`);

const tests = {
  'beta-guide valid+test photos (same dataset, unseen photos)': load('beta-guide').filter(
    (r) => r.split !== 'train',
  ),
  'clinb test split (same gym)': load('clinb').filter((r) => r.split === 'test'),
  'kaggle real photos (unseen gym)': load('kaggle'),
  'capstone (unseen gym)': load('capstone'),
  'private held-out (unseen gym)': load('heldout'),
};
const report = {};
for (const [name, rows] of Object.entries(tests)) {
  if (!rows.length) continue;
  const inScope = rows.filter((r) => classes.includes(r.y) || r.y === 'edge');
  report[name] = {
    probe: evaluate(inScope, (x) => predict(probe, x), true),
    probeStrict: evaluate(inScope, (x) => predict(probe, x), false),
    zeroShot: evaluate(inScope, zeroShot, true),
    zeroShotNoChip: evaluate(inScope, zeroShotNoChip, true),
  };
  console.log(`\n== ${name}: ${inScope.length} holds`);
  for (const [k, v] of Object.entries(report[name]))
    console.log(
      `  ${k.padEnd(14)} top-1 ${v.top1.padStart(4)}  top-3 ${v.top3.padStart(4)}  predicted ${JSON.stringify(v.predicted)}`,
    );
  console.log('  probe confusion (rows = truth):', JSON.stringify(report[name].probe.conf));
}
writeFileSync(
  join(ROOT, 'probe-report.json'),
  JSON.stringify({ counts, classes, report }, null, 2),
);
if (process.argv.includes('--write')) {
  // 5 decimals keep the file small (~35 KB); the scores change by < 1e-4.
  const round = (v) => Math.round(v * 1e5) / 1e5;
  const compact = {
    ...probe,
    mean: probe.mean.map(round),
    weights: probe.weights.map((r) => r.map(round)),
    bias: probe.bias.map(round),
  };
  writeFileSync('src/data/clip-probe.json', JSON.stringify(compact) + '\n');
  console.log('\nwrote src/data/clip-probe.json');
} else console.log('\n(dry run: pass --write to ship the probe)');

// --ceiling: a diagnostic only. Trains on the Kaggle real photos (in the app's exact domain, but
// CC BY-SA, so it never ships) and tests on held-out Kaggle photos and the private held-out set.
// Shows what an in-domain training set could reach, i.e. whether more wall-photo data is the lever.
if (process.argv.includes('--ceiling')) {
  const kag = load('kaggle');
  const groups = [...new Set(kag.map((r) => r.group))].sort();
  const test = new Set(groups.filter((_, i) => i % 4 === 0));
  const tr = kag.filter((r) => !test.has(r.group));
  const te = kag.filter((r) => test.has(r.group));
  const cls = CLASSES.filter((c) => tr.filter((r) => r.y === c).length >= MIN_TRAIN);
  const p = train(
    tr.filter((r) => cls.includes(r.y)),
    cls,
  );
  console.log(
    `\n== CEILING: trained on ${tr.length} Kaggle holds (${groups.length - test.size} photos), classes ${cls.join(',')}`,
  );
  for (const [name, rows] of [
    ['kaggle held-out photos', te],
    ['private held-out (unseen gym)', load('heldout')],
  ]) {
    const r = evaluate(
      rows.filter((x) => cls.includes(x.y) || x.y === 'edge'),
      (x) => predict(p, x),
      true,
    );
    console.log(`  ${name}: top-1 ${r.top1}, top-3 ${r.top3}, recall ${JSON.stringify(r.recall)}`);
  }
}
