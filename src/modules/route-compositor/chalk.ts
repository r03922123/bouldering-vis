import { srgbToLab } from '../../lib/color';
import { makeImageData } from '../../lib/imageData';
import type { HoldMask } from '../hold-segmentation';

export type ChalkLevel = 'none' | 'light' | 'heavy' | 'unknown';

export interface ChalkInfo {
  holdId: string;
  level: ChalkLevel;
  /** 0–1; 0 when 'unknown'. */
  ratio: number;
  /** Chalk pixels, working-image size. */
  mask: Uint8Array;
  /** The hold's bbox: every chalk pixel lies inside it. */
  bbox: HoldMask['bbox'];
  /** Centre of the chalk pixels: the likely grip spot. */
  centroid: { x: number; y: number } | null;
}

// SPEC-route-compositor › "Chalk hint".
const WHITE_HOLD_L = 75;
const WHITE_HOLD_CHROMA = 15;
const CHALK_DL = 20;
const CHALK_CHROMA = 12;
const LIGHT = 0.03;
const HEAVY = 0.15;

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};

/** Chalk = pixels much brighter and greyer than the hold's own (median) color. */
export function detectChalk(source: ImageData, hold: HoldMask): ChalkInfo {
  const { width: w, height: h, data } = source;
  const mask = new Uint8Array(w * h);
  const idx: number[] = [];
  const Ls: number[] = [];
  const As: number[] = [];
  const Bs: number[] = [];
  const { x: x0, y: y0, w: bw, h: bh } = hold.bbox;
  for (let y = y0; y < y0 + bh; y++) {
    for (let x = x0; x < x0 + bw; x++) {
      const i = y * w + x;
      if (!hold.mask[i]) continue;
      const [L, a, b] = srgbToLab(data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!);
      idx.push(i);
      Ls.push(L);
      As.push(a);
      Bs.push(b);
    }
  }
  const baseL = median(Ls);
  const baseChroma = Math.hypot(median(As), median(Bs));
  if (baseL > WHITE_HOLD_L && baseChroma < WHITE_HOLD_CHROMA) {
    return { holdId: hold.id, level: 'unknown', ratio: 0, mask, bbox: hold.bbox, centroid: null };
  }

  let count = 0;
  let sx = 0;
  let sy = 0;
  idx.forEach((i, k) => {
    if (Ls[k]! >= baseL + CHALK_DL && Math.hypot(As[k]!, Bs[k]!) < CHALK_CHROMA) {
      mask[i] = 1;
      count++;
      sx += i % w;
      sy += Math.floor(i / w);
    }
  });
  const ratio = idx.length ? count / idx.length : 0;
  const level: ChalkLevel = ratio >= HEAVY ? 'heavy' : ratio >= LIGHT ? 'light' : 'none';
  return {
    holdId: hold.id,
    level,
    ratio,
    mask,
    bbox: hold.bbox,
    centroid: level === 'none' || !count ? null : { x: sx / count, y: sy / count },
  };
}

export function chalkLabel(level: ChalkLevel): string {
  switch (level) {
    case 'heavy':
      return 'Chalk: heavy · likely grip spot';
    case 'light':
      return 'Chalk: light';
    case 'none':
      return 'Chalk: none';
    case 'unknown':
      return 'Chalk: n/a on white hold';
  }
}

/** Cyan diagonal hatch over chalk pixels, for the overlay layer. Scans only each hold's bbox. */
export function chalkHatch(
  chalk: readonly Pick<ChalkInfo, 'mask' | 'bbox'>[],
  w: number,
  h: number,
): ImageData {
  const out = makeImageData(w, h);
  for (const { mask, bbox } of chalk) {
    for (let y = bbox.y; y < bbox.y + bbox.h; y++) {
      for (let x = bbox.x; x < bbox.x + bbox.w; x++) {
        const i = y * w + x;
        if (mask[i] && (x + y) % 4 < 2) out.data.set([0, 229, 255, 220], i * 4);
      }
    }
  }
  return out;
}
