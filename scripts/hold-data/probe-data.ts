// Dev-only (T38): turn labeled hold photos into CLIP embeddings exactly the way the app does:
// a tap at the hold's center → SAM mask (pickMask, cleanMask) → cropHold (outside-mask grey) → CLIP.
// Driven by scripts/hold-data/embed.mjs (ADR-0003 (h)), which calls window.embedPhoto and saves
// the results.
import type { HoldMask } from '../../src/modules/hold-segmentation';
import { cleanMask, maskStats, pickMask } from '../../src/modules/hold-segmentation/worker';
import { cropHold } from '../../src/modules/hold-classification/worker';
import { loadImage } from '../../src/modules/image-input';
import { createMlClient } from '../../src/workers/client';

const client = createMlClient();
let seq = 0;

interface Tap {
  /** Tap point as a fraction of the photo (0..1). */
  fx: number;
  fy: number;
  label: string;
}
interface Out {
  label: string;
  ok: boolean;
  reason?: string;
  areaFrac?: number;
  embedding?: number[];
  /** With `debug`, the crop CLIP saw, as a PNG data URL. */
  crop?: string;
}

/** Small images (ClinbingHoldType is 128 px) are upscaled like a close-up photo; big ones go through loadImage. */
async function working(url: string, minEdge: number) {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob);
  if (Math.min(bmp.width, bmp.height) >= 256)
    return { img: await loadImage(blob, url), closeUp: false };
  const s = minEdge / Math.min(bmp.width, bmp.height);
  const c = new OffscreenCanvas(Math.round(bmp.width * s), Math.round(bmp.height * s));
  const g = c.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, 0, 0, c.width, c.height);
  const img = {
    id: `u${seq++}`,
    width: c.width,
    height: c.height,
    pixels: g.getImageData(0, 0, c.width, c.height),
    scale: s,
    sourceName: url,
  };
  return { img, closeUp: true };
}

function pickCloseUp(
  masks: readonly Uint8Array[],
  scores: readonly number[],
  p: { x: number; y: number },
  w: number,
  h: number,
): Uint8Array | null {
  const at = p.y * w + p.x;
  let best: Uint8Array | null = null;
  let bestScore = -Infinity;
  masks.forEach((m, i) => {
    let area = 0;
    for (const v of m) area += v;
    if (m[at] === 1 && (scores[i] ?? -Infinity) > bestScore && area <= 0.7 * w * h) {
      best = m;
      bestScore = scores[i]!;
    }
  });
  return best;
}

(window as unknown as { embedPhoto: unknown }).embedPhoto = async (
  url: string,
  taps: Tap[],
  minEdge = 512,
  debug = false,
): Promise<Out[]> => {
  const { img, closeUp } = await working(url, minEdge);
  const { width: w, height: h } = img;
  await client.request({ type: 'sam:embed', imageId: img.id, pixels: img.pixels });
  const taken = new Uint8Array(w * h);
  const out: Out[] = [];
  for (const t of taps) {
    const p = {
      x: Math.min(w - 1, Math.round(t.fx * w)),
      y: Math.min(h - 1, Math.round(t.fy * h)),
    };
    const r = await client.request({ type: 'sam:candidates', imageId: img.id, point: p });
    // Close-ups (the hold fills the frame) can't pass the app's 8%-of-photo limit, so they use the
    // same rule (best-scoring mask under the tap) with a 70% limit that still rejects "everything".
    const picked = closeUp
      ? pickCloseUp(r.masks, r.scores, p, w, h)
      : pickMask(r.masks, r.scores, p, w, h);
    if (!picked) {
      out.push({ label: t.label, ok: false, reason: 'no-mask' });
      continue;
    }
    const mask = cleanMask(picked, p, w, h, taken);
    const stats = maskStats(mask, w, h);
    if (stats.area < 50) {
      out.push({ label: t.label, ok: false, reason: 'tiny' });
      continue;
    }
    mask.forEach((v, i) => v && (taken[i] = 1)); // like the app: this hold's pixels are now its own
    const hold = { id: `h${out.length}`, mask, ...stats } as HoldMask;
    const crop = cropHold(img.pixels, hold);
    const e = await client.request({ type: 'clip:embed', imageId: img.id, holdId: hold.id, crop });
    let png: string | undefined;
    if (debug) {
      const c = new OffscreenCanvas(crop.width, crop.height);
      c.getContext('2d')!.putImageData(crop, 0, 0);
      const b = await c.convertToBlob({ type: 'image/png' });
      png = await new Promise((r) => {
        const fr = new FileReader();
        fr.onload = () => r(fr.result as string);
        fr.readAsDataURL(b);
      });
    }
    out.push({
      label: t.label,
      ok: true,
      areaFrac: stats.area / (w * h),
      embedding: [...e.embedding],
      crop: png,
    });
  }
  return out;
};
document.getElementById('out')!.textContent = 'READY';
