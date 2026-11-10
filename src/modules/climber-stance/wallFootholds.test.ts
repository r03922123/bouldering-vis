import { isWallFoothold, wallFootholds, WALL_FOOT_PREFIX } from './wallFootholds';

// SPEC-climber-stance › Amendment 2026-10-31 (b), AC 19 (rules 2–3).

const W = 2000;
const H = 1600;

const blank = (w = W, h = H) => new Uint8Array(w * h);

function rect(mask: Uint8Array, x: number, y: number, w: number, h: number, value = 1, mw = W) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) mask[yy * mw + xx] = value;
  return mask;
}

/** The toe is a blob pixel with no pixel of the same blob directly above it. */
function onUpperContour(mask: Uint8Array, toe: { x: number; y: number }, w = W) {
  return mask[toe.y * w + toe.x] === 1 && (toe.y === 0 || mask[(toe.y - 1) * w + toe.x] === 0);
}

describe('wallFootholds', () => {
  it('summarises a 40 × 20 rectangle: area, bounding box, centroid and toe', () => {
    const mask = rect(blank(), 100, 50, 40, 20);
    const f = wallFootholds(mask, W, H, 'img');
    expect(f).toMatchObject({ imageId: 'img', width: W, height: H });
    expect(f.blobs).toHaveLength(1);
    expect(f.blobs[0]).toEqual({
      id: 'blob:1',
      label: 1,
      area: 800,
      bbox: { x: 100, y: 50, w: 40, h: 20 },
      centroid: { x: 119.5, y: 59.5 },
      toe: { x: 119, y: 50 },
    });
  });

  it('puts the toe on the upper contour of a blob with a notch in its top edge', () => {
    // A 6 px notch in the central columns: the median column (119) has no pixel at the top row.
    const mask = rect(rect(blank(), 100, 50, 40, 20), 116, 50, 6, 6, 0);
    const [blob] = wallFootholds(mask, W, H, 'img').blobs;
    expect(onUpperContour(mask, blob!.toe)).toBe(true);
    // Central columns 108–131 sorted by (top y, x); the lower median of the 24 is the 12th.
    expect(blob!.toe).toEqual({ x: 125, y: 50 });
    expect(blob!.area).toBe(800 - 36);
  });

  it('labels the pixels in a Uint16Array, 0 = wall, ids blob:1…n in row-major order', () => {
    const mask = blank();
    rect(mask, 1500, 900, 40, 20); // lower: found second
    rect(mask, 300, 400, 40, 20); // higher: found first
    rect(mask, 900, 400, 10, 30); // same top row, further right
    const f = wallFootholds(mask, W, H, 'img');
    expect(f.labels).toBeInstanceOf(Uint16Array);
    expect(f.labels).toHaveLength(W * H);
    expect(f.blobs.map((b) => b.id)).toEqual(['blob:1', 'blob:2', 'blob:3']);
    expect(f.blobs.map((b) => b.bbox.x)).toEqual([300, 900, 1500]);
    expect(f.labels[0]).toBe(0);
    expect(f.labels[400 * W + 300]).toBe(1);
    expect(f.labels[400 * W + 900]).toBe(2);
    expect(f.labels[919 * W + 1539]).toBe(3);
    for (const b of f.blobs) expect(onUpperContour(mask, b.toe)).toBe(true);
  });

  it('joins diagonal neighbours (8-connected)', () => {
    const mask = blank();
    rect(mask, 100, 100, 10, 10);
    rect(mask, 110, 110, 10, 10);
    expect(wallFootholds(mask, W, H, 'img').blobs).toHaveLength(1);
  });

  it('is deterministic: the same mask twice gives deep-equal output', () => {
    const mask = blank();
    rect(mask, 100, 50, 40, 20);
    rect(rect(mask, 700, 600, 120, 80), 740, 600, 10, 15, 0);
    rect(mask, 1960, 1590, 40, 10); // cut by the image corner
    const { labels: a, ...first } = wallFootholds(mask, W, H, 'img');
    const { labels: b, ...second } = wallFootholds(mask, W, H, 'img');
    expect(first).toEqual(second);
    expect(first.blobs).toHaveLength(3);
    // Element-wise: toEqual walks a 3.2 M-entry typed array too slowly.
    expect(a.length).toBe(b.length);
    expect(a.every((l, i) => l === b[i])).toBe(true);
  });

  it('gives no blobs for an all-zero mask', () => {
    const f = wallFootholds(blank(), W, H, 'img');
    expect(f.blobs).toEqual([]);
    expect(f.labels.every((l) => l === 0)).toBe(true);
  });

  it('throws when the mask has more than 65 535 components', () => {
    // 256 × 256 isolated pixels, two apart, so not even diagonal neighbours touch.
    const n = 512;
    const mask = blank(n, n);
    for (let y = 0; y < n; y += 2) for (let x = 0; x < n; x += 2) mask[y * n + x] = 1;
    expect(() => wallFootholds(mask, n, n, 'img')).toThrow(/65.?535/);
  });
});

describe('isWallFoothold', () => {
  it('recognises blob ids only', () => {
    expect(WALL_FOOT_PREFIX).toBe('blob:');
    expect(isWallFoothold('blob:3')).toBe(true);
    expect(isWallFoothold('hold-1')).toBe(false);
    expect(isWallFoothold('wall')).toBe(false);
    expect(isWallFoothold(null)).toBe(false);
  });
});
