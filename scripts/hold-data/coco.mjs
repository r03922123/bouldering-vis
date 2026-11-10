// Dev-only (T38): turns a Roboflow COCO JSON export into embed jobs (one per photo), tapping each
// labeled hold at its outline's centroid (or its box center when there is no outline).

/** Polygon centroid (area-weighted); falls back to the vertex mean for a degenerate polygon. */
function centroid(poly) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  const n = poly.length / 2;
  for (let i = 0; i < n; i++) {
    const x0 = poly[2 * i];
    const y0 = poly[2 * i + 1];
    const x1 = poly[(2 * (i + 1)) % poly.length];
    const y1 = poly[(2 * (i + 1) + 1) % poly.length];
    const c = x0 * y1 - x1 * y0;
    a += c;
    cx += (x0 + x1) * c;
    cy += (y0 + y1) * c;
  }
  if (Math.abs(a) < 1e-9) {
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < n; i++) {
      sx += poly[2 * i];
      sy += poly[2 * i + 1];
    }
    return [sx / n, sy / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

/**
 * @param coco a parsed COCO JSON (images, categories, annotations)
 * @param prefix path of the photos under tests/fixtures/hold-data/, e.g. 'beta-guide/train'
 * @param split 'train' | 'valid' | 'test'
 * @param maxPerClassPerPhoto bounds the run time; the first holds of each class per photo are kept
 */
export function cocoJobs(coco, prefix, split, maxPerClassPerPhoto = Infinity) {
  const names = new Map(coco.categories.map((c) => [c.id, c]));
  const images = new Map(coco.images.map((im) => [im.id, im]));
  const byImage = new Map();
  for (const a of coco.annotations) {
    const cat = names.get(a.category_id);
    const im = images.get(a.image_id);
    // Roboflow adds a parent category (no supercategory) that labels nothing.
    if (!cat || !im || !cat.supercategory || cat.supercategory === 'none') continue;
    const poly = a.segmentation?.[0];
    const [x, y] =
      poly && poly.length >= 6
        ? centroid(poly)
        : [a.bbox[0] + a.bbox[2] / 2, a.bbox[1] + a.bbox[3] / 2];
    const taps = byImage.get(im.id) ?? [];
    if (taps.filter((t) => t.label === cat.name).length >= maxPerClassPerPhoto) continue;
    taps.push({ fx: x / im.width, fy: y / im.height, label: cat.name });
    byImage.set(im.id, taps);
  }
  return [...byImage].map(([id, taps]) => {
    const photo = `${prefix}/${images.get(id).file_name}`;
    return { photo, group: photo, split, taps };
  });
}
