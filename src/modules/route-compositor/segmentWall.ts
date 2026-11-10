import { labImage } from '../../lib/color';
import { labelComponents } from '../../lib/components';
import { kmeans } from '../../lib/kmeans';
import { close, open } from '../../lib/morphology';

// SPEC-route-compositor › "Wall vs. hold mask". A color heuristic, not ML.
const SAMPLE_EDGE = 256;
const K = 6;
const WALL_SHARE = 0.15;
const HOLD_DELTA_E = 18;
const MIN_SPECK_FRACTION = 0.0002;
/** Same limit as a single SAM hold (hold-segmentation's MAX_HOLD_AREA_FRACTION). */
const MAX_REGION_FRACTION = 0.08;

/** 1 = hold (any color far from every large "wall" color cluster), 0 = wall. */
export function segmentWall(pixels: ImageData, seed = 1): Uint8Array {
  const { width: w, height: h, data } = pixels;
  const n = w * h;
  const lab = labImage(data);

  // 1–2. Cluster a ~256 px sample of the image in Lab.
  const step = Math.max(1, Math.ceil(Math.max(w, h) / SAMPLE_EDGE));
  const sample: number[] = [];
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 3;
      sample.push(lab[i]!, lab[i + 1]!, lab[i + 2]!);
    }
  }
  const { centers, counts } = kmeans(new Float32Array(sample), 3, K, { seed });
  const total = counts.reduce((a, b) => a + b, 0);
  const wall: number[] = [];
  counts.forEach((c, k) => c / total >= WALL_SHARE && wall.push(k));

  // 3. A pixel is "hold" when it is far from every wall color.
  const limit = HOLD_DELTA_E * HOLD_DELTA_E;
  const raw = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let nearest = Infinity;
    for (const k of wall) {
      const dl = lab[i * 3]! - centers[k * 3]!;
      const da = lab[i * 3 + 1]! - centers[k * 3 + 1]!;
      const db = lab[i * 3 + 2]! - centers[k * 3 + 2]!;
      nearest = Math.min(nearest, dl * dl + da * da + db * db);
    }
    raw[i] = nearest > limit ? 1 : 0;
  }

  // 4. Clean up: open 3×3, close 5×5, then keep regions of hold size: drop specks (screw
  //    holes, T-nuts) and regions too big to be one hold (ceiling, beams, mats).
  const cleaned = close(open(raw, w, h, 3), w, h, 5);
  const { labels, sizes } = labelComponents(cleaned, w, h);
  const min = Math.ceil(MIN_SPECK_FRACTION * n);
  const max = MAX_REGION_FRACTION * n;
  return Uint8Array.from(labels, (l) => (l && sizes[l]! >= min && sizes[l]! <= max ? 1 : 0));
}
