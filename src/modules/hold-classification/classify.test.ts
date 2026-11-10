import type { HoldMask } from '../hold-segmentation';
import { classifyFromEmbedding, cropHold, HOLD_TYPES, UNSURE_BELOW } from './classify';

const W = 100;
const H = 80;

function scene() {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) data.set([200, 30, 30, 255], i * 4); // everything red
  const source = { width: W, height: H, data, colorSpace: 'srgb' } as ImageData;
  const mask = new Uint8Array(W * H);
  for (let y = 30; y < 50; y++) for (let x = 40; x < 60; x++) mask[y * W + x] = 1; // 20×20 hold
  const hold = { id: 'h', mask, bbox: { x: 40, y: 30, w: 20, h: 20 } } as HoldMask;
  return { source, hold };
}

const px = (img: ImageData, x: number, y: number) =>
  Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));

describe('cropHold', () => {
  it('returns a square crop of the requested size', () => {
    const { source, hold } = scene();
    const c = cropHold(source, hold, 64);
    expect([c.width, c.height]).toEqual([64, 64]);
  });

  it('fills everything outside the mask with #808080', () => {
    const { source, hold } = scene();
    const c = cropHold(source, hold, 64);
    expect(px(c, 0, 0)).toEqual([0x80, 0x80, 0x80, 255]); // 20% padding is outside the hold
    expect(px(c, 63, 63)).toEqual([0x80, 0x80, 0x80, 255]);
  });

  it('keeps the hold centered with its own pixels', () => {
    const { source, hold } = scene();
    const c = cropHold(source, hold, 64);
    expect(px(c, 32, 32)).toEqual([200, 30, 30, 255]);
  });

  it('pads the bbox by 20% on each side (the hold spans 1/1.4 of the crop)', () => {
    const { source, hold } = scene();
    const c = cropHold(source, hold, 140);
    // Side = 20 × 1.4 = 28 image px from x = 36, so output column u samples x = 36 + (u + 0.5) × 0.2.
    expect(px(c, 19, 70)).toEqual([0x80, 0x80, 0x80, 255]); // x ≈ 39.9: padding
    expect(px(c, 20, 70)[0]).toBe(200); // x ≈ 40.1: first hold column
  });
});

describe('classifyFromEmbedding', () => {
  const unit = (i: number) => {
    const v = new Float32Array(512);
    v[i] = 1;
    return v;
  };
  const text = Object.fromEntries(HOLD_TYPES.map((t, i) => [t, unit(i)])) as Record<
    (typeof HOLD_TYPES)[number],
    Float32Array
  >;

  it('lists the 8 shape types (foot chip added, D6)', () => {
    expect(HOLD_TYPES).toEqual([
      'jug',
      'crimp',
      'edge',
      'sloper',
      'pinch',
      'pocket',
      'volume',
      'foot-chip',
    ]);
    expect(UNSURE_BELOW).toBe(0.35);
  });

  it('ranks the matching class first with probability > 0.5', () => {
    const top = classifyFromEmbedding(unit(3), text);
    expect(top[0]!.type).toBe('sloper');
    expect(top[0]!.prob).toBeGreaterThan(0.5);
  });

  it('returns the top 3 in descending order', () => {
    const top = classifyFromEmbedding(unit(1), text);
    expect(top).toHaveLength(3);
    expect(top[0]!.prob).toBeGreaterThanOrEqual(top[1]!.prob);
    expect(top[1]!.prob).toBeGreaterThanOrEqual(top[2]!.prob);
  });

  it('produces probabilities that sum to 1 across all classes', () => {
    const v = new Float32Array(512).map((_, i) => Math.sin(i));
    const all = classifyFromEmbedding(v, text, HOLD_TYPES.length);
    expect(all.reduce((s, t) => s + t.prob, 0)).toBeCloseTo(1, 5);
  });
});

describe('applySizePrior', () => {
  const all = [
    { type: 'volume' as const, prob: 0.4 },
    { type: 'jug' as const, prob: 0.3 },
    { type: 'sloper' as const, prob: 0.2 },
    { type: 'crimp' as const, prob: 0.1 },
  ];

  it('rules out "volume" for a hold under 0.8% of the image and renormalizes', async () => {
    const { applySizePrior, MIN_VOLUME_SHARE } = await import('./classify');
    expect(MIN_VOLUME_SHARE).toBe(0.008);
    const out = applySizePrior(all, 0.002);
    expect(out.map((t) => t.type)).toEqual(['jug', 'sloper', 'crimp']);
    expect(out[0]!.prob).toBeCloseTo(0.5, 9);
    expect(out.reduce((s, t) => s + t.prob, 0)).toBeCloseTo(1, 9);
  });

  it('keeps the model output for a hold big enough to be a volume', async () => {
    const { applySizePrior } = await import('./classify');
    expect(applySizePrior(all, 0.012)).toEqual(all);
  });
});
