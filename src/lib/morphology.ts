// Binary morphology with a square size×size kernel. Pixels outside the image are ignored,
// so masks touching the border don't shrink. Separable: a row pass, then a column pass.

type Op = 'erode' | 'dilate';

function pass(src: Uint8Array, w: number, h: number, r: number, horizontal: boolean, op: Op) {
  const out = new Uint8Array(src.length);
  const len = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const prefix = new Int32Array(len + 1);
  for (let line = 0; line < lines; line++) {
    const at = (i: number) => (horizontal ? line * w + i : i * w + line);
    for (let i = 0; i < len; i++) prefix[i + 1] = prefix[i]! + src[at(i)]!;
    for (let i = 0; i < len; i++) {
      const lo = Math.max(0, i - r);
      const hi = Math.min(len - 1, i + r);
      const ones = prefix[hi + 1]! - prefix[lo]!;
      out[at(i)] = op === 'erode' ? (ones === hi - lo + 1 ? 1 : 0) : ones > 0 ? 1 : 0;
    }
  }
  return out;
}

function apply(mask: Uint8Array, w: number, h: number, size: number, op: Op) {
  const r = Math.floor(size / 2);
  return pass(pass(mask, w, h, r, true, op), w, h, r, false, op);
}

export const erode = (m: Uint8Array, w: number, h: number, size: number) =>
  apply(m, w, h, size, 'erode');
export const dilate = (m: Uint8Array, w: number, h: number, size: number) =>
  apply(m, w, h, size, 'dilate');
export const open = (m: Uint8Array, w: number, h: number, size: number) =>
  dilate(erode(m, w, h, size), w, h, size);
export const close = (m: Uint8Array, w: number, h: number, size: number) =>
  erode(dilate(m, w, h, size), w, h, size);
