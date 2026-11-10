import { labelComponents } from '../../lib/components';

// SPEC-climber-stance › Amendment 2026-10-31 (b), rules 2–3. The wall mask (route-compositor's
// segmentWall, 1 = hold) summarised once per image as footholds a foot can stand on. Pure; it
// runs in the worker, which wires the two modules together.

/** A foot on a wall foothold carries the id `blob:<label>`. */
export const WALL_FOOT_PREFIX = 'blob:';

/**
 * The toe sits this far below the blob's top edge (× H): on the hold, not on its rim. A tuning
 * constant (ours).
 */
export const TOE_INSET = 0.005;

/** The toe column is picked among the central 60 % of the blob's columns (20 % off each side). */
const TOE_SIDE = 0.2;

/** Uint16 labels. segmentWall's speck filter keeps far fewer components (at most 5 000). */
const MAX_LABEL = 65535;

export interface WallFoothold {
  /** `blob:<label>`. Stable for one image (row-major labelling of a deterministic mask). */
  id: string;
  label: number;
  /** Pixels. */
  area: number;
  bbox: { x: number; y: number; w: number; h: number };
  centroid: { x: number; y: number };
  /** On the blob's upper contour (rule 3). The contact point is (toe.x, toe.y + TOE_INSET·H). */
  toe: { x: number; y: number };
}

export interface WallFootholds {
  imageId: string;
  width: number;
  height: number;
  /** Component label per pixel, 0 = wall, row-major. segmentWall's speck filter bounds the count at 5 000. */
  labels: Uint16Array;
  blobs: WallFoothold[];
}

export const isWallFoothold = (id: string | null): boolean =>
  id?.startsWith(WALL_FOOT_PREFIX) ?? false;

/**
 * The toe: among the blob's central columns (all of them if none has a pixel), sorted by (top y,
 * x), the lower median. It always lies exactly on the upper contour.
 */
function toeOf(xs: number[], tops: number[], x0: number, w: number) {
  const lo = x0 + Math.floor(TOE_SIDE * w);
  const hi = x0 + Math.ceil((1 - TOE_SIDE) * w) - 1;
  let cols = xs.map((_, i) => i).filter((i) => xs[i]! >= lo && xs[i]! <= hi);
  if (!cols.length) cols = xs.map((_, i) => i);
  cols.sort((a, b) => tops[a]! - tops[b]! || xs[a]! - xs[b]!);
  const i = cols[Math.floor((cols.length - 1) / 2)]!;
  return { x: xs[i]!, y: tops[i]! };
}

/** Throws if the mask has more than 65 535 components (never for a segmentWall mask). */
export function wallFootholds(
  mask: Uint8Array,
  width: number,
  height: number,
  imageId: string,
): WallFootholds {
  const { labels: raw, count } = labelComponents(mask, width, height);
  if (count > MAX_LABEL) {
    throw new Error(`wallFootholds: ${count} components, more than ${MAX_LABEL}`);
  }
  const labels = Uint16Array.from(raw);

  const area = new Float64Array(count + 1);
  const sumX = new Float64Array(count + 1);
  const sumY = new Float64Array(count + 1);
  const minX = new Int32Array(count + 1).fill(width);
  const minY = new Int32Array(count + 1).fill(height);
  const maxX = new Int32Array(count + 1).fill(-1);
  const maxY = new Int32Array(count + 1).fill(-1);
  // The upper contour: the first pixel of each column, in a column-by-column scan.
  const lastCol = new Int32Array(count + 1).fill(-1);
  const colXs: number[][] = Array.from({ length: count + 1 }, () => []);
  const colTops: number[][] = Array.from({ length: count + 1 }, () => []);

  for (let x = 0; x < width; x++) {
    for (let y = 0, i = x; y < height; y++, i += width) {
      const l = labels[i]!;
      if (!l) continue;
      area[l]!++;
      sumX[l]! += x;
      sumY[l]! += y;
      if (x < minX[l]!) minX[l] = x;
      if (x > maxX[l]!) maxX[l] = x;
      if (y < minY[l]!) minY[l] = y;
      if (y > maxY[l]!) maxY[l] = y;
      if (lastCol[l] !== x) {
        lastCol[l] = x;
        colXs[l]!.push(x);
        colTops[l]!.push(y);
      }
    }
  }

  const blobs: WallFoothold[] = [];
  for (let l = 1; l <= count; l++) {
    const bbox = {
      x: minX[l]!,
      y: minY[l]!,
      w: maxX[l]! - minX[l]! + 1,
      h: maxY[l]! - minY[l]! + 1,
    };
    blobs.push({
      id: `${WALL_FOOT_PREFIX}${l}`,
      label: l,
      area: area[l]!,
      bbox,
      centroid: { x: sumX[l]! / area[l]!, y: sumY[l]! / area[l]! },
      toe: toeOf(colXs[l]!, colTops[l]!, bbox.x, bbox.w),
    });
  }
  return { imageId, width, height, labels, blobs };
}
