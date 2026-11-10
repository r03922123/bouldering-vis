import type { Point } from '../workers/protocol';

export interface Labeling {
  /** 0 = not part of any component; components are 1..count. */
  labels: Int32Array;
  count: number;
  /** sizes[label] = pixel count; sizes[0] is unused. */
  sizes: number[];
  /** touchesBorder[label] */
  touchesBorder: boolean[];
}

const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
const N8 = [...N4, [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

/** Labels connected regions of pixels equal to `value` (default: foreground, 8-connected). */
export function labelComponents(
  mask: Uint8Array,
  w: number,
  h: number,
  { value = 1, connectivity = 8 }: { value?: number; connectivity?: 4 | 8 } = {},
): Labeling {
  const labels = new Int32Array(w * h);
  const sizes = [0];
  const touchesBorder = [false];
  const stack = new Int32Array(w * h);
  const nbrs = connectivity === 8 ? N8 : N4;
  let count = 0;
  for (let start = 0; start < w * h; start++) {
    if (mask[start] !== value || labels[start]) continue;
    const label = ++count;
    let size = 0;
    let border = false;
    let top = 0;
    stack[top++] = start;
    labels[start] = label;
    while (top) {
      const i = stack[--top]!;
      const x = i % w;
      const y = (i - x) / w;
      size++;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
      for (const [dx, dy] of nbrs) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (mask[j] === value && !labels[j]) {
          labels[j] = label;
          stack[top++] = j;
        }
      }
    }
    sizes.push(size);
    touchesBorder.push(border);
  }
  return { labels, count, sizes, touchesBorder };
}

export function keepComponentAt(mask: Uint8Array, w: number, h: number, p: Point): Uint8Array {
  const out = new Uint8Array(w * h);
  const { labels } = labelComponents(mask, w, h);
  const target = labels[Math.round(p.y) * w + Math.round(p.x)];
  if (!target) return out;
  for (let i = 0; i < out.length; i++) out[i] = labels[i] === target ? 1 : 0;
  return out;
}

export function removeSmallComponents(
  mask: Uint8Array,
  w: number,
  h: number,
  minArea: number,
): Uint8Array {
  const { labels, sizes } = labelComponents(mask, w, h);
  return Uint8Array.from(labels, (l) => (l && sizes[l]! >= minArea ? 1 : 0));
}

/** Fills enclosed background regions (4-connected, not touching the border) of area ≤ maxArea. */
export function fillHoles(mask: Uint8Array, w: number, h: number, maxArea: number): Uint8Array {
  const bg = labelComponents(mask, w, h, { value: 0, connectivity: 4 });
  const out = mask.slice();
  for (let i = 0; i < out.length; i++) {
    const l = bg.labels[i]!;
    if (l && !bg.touchesBorder[l] && bg.sizes[l]! <= maxArea) out[i] = 1;
  }
  return out;
}
