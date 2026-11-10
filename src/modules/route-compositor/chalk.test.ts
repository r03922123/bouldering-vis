import type { HoldMask } from '../hold-segmentation';
import { chalkHatch, chalkLabel, detectChalk } from './chalk';

type RGB = [number, number, number];
const W = 40;
const H = 40;

/** A 20×20 square hold at (10,10) in `color`; pixels where `chalky(x,y)` are painted white. */
function scene(color: RGB, chalky: (x: number, y: number) => boolean = () => false) {
  const data = new Uint8ClampedArray(W * H * 4);
  const mask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const inHold = x >= 10 && x < 30 && y >= 10 && y < 30;
      const c: RGB = inHold ? (chalky(x, y) ? [245, 245, 242] : color) : [207, 210, 204];
      data.set([...c, 255], (y * W + x) * 4);
      if (inHold) mask[y * W + x] = 1;
    }
  }
  const source = { width: W, height: H, data, colorSpace: 'srgb' } as ImageData;
  const hold = { id: 'h1', mask, area: 400, bbox: { x: 10, y: 10, w: 20, h: 20 } } as HoldMask;
  return { source, hold };
}

const RED: RGB = [200, 30, 30];

describe('detectChalk', () => {
  it('rates a red hold with a 20% white patch as heavy, with the centroid in the patch', () => {
    // Patch: the top 4 rows of the hold = 80 of 400 px.
    const { source, hold } = scene(RED, (_x, y) => y < 14);
    const c = detectChalk(source, hold);
    expect(c.level).toBe('heavy');
    expect(c.ratio).toBeGreaterThanOrEqual(0.18);
    expect(c.ratio).toBeLessThanOrEqual(0.22);
    expect(c.centroid!.y).toBeLessThan(14);
    expect(c.holdId).toBe('h1');
  });

  it('rates a clean red hold as none, with no centroid', () => {
    const { source, hold } = scene(RED);
    const c = detectChalk(source, hold);
    expect(c.level).toBe('none');
    expect(c.ratio).toBe(0);
    expect(c.centroid).toBeNull();
  });

  it('rates a small patch (5%) as light', () => {
    const { source, hold } = scene(RED, (x, y) => y === 10 && x < 30); // 20 of 400 px
    expect(detectChalk(source, hold).level).toBe('light');
  });

  it('cannot judge a white hold', () => {
    const { source, hold } = scene([240, 240, 236], (_x, y) => y < 14);
    const c = detectChalk(source, hold);
    expect(c.level).toBe('unknown');
    expect(c.ratio).toBe(0);
  });

  it('marks chalk pixels in its mask and nothing outside the hold', () => {
    const { source, hold } = scene(RED, (_x, y) => y < 14);
    const c = detectChalk(source, hold);
    expect(c.mask[11 * W + 15]).toBe(1);
    expect(c.mask[20 * W + 15]).toBe(0);
    expect(c.mask[0]).toBe(0);
  });
});

describe('chalkLabel', () => {
  it.each([
    ['heavy', 'Chalk: heavy · likely grip spot'],
    ['light', 'Chalk: light'],
    ['none', 'Chalk: none'],
    ['unknown', 'Chalk: n/a on white hold'],
  ] as const)('%s → %s', (level, text) => {
    expect(chalkLabel(level)).toBe(text);
  });
});

describe('chalkHatch', () => {
  it('draws diagonal cyan stripes only on chalk pixels', () => {
    const mask = new Uint8Array(W * H);
    for (let i = 0; i < 6; i++) mask[i] = 1; // first 6 pixels of row 0
    const img = chalkHatch([{ mask, bbox: { x: 0, y: 0, w: 6, h: 1 } }], W, H);
    const alpha = (i: number) => img.data[i * 4 + 3];
    const stripes = [0, 1, 2, 3, 4, 5].map((i) => (alpha(i)! > 0 ? 1 : 0));
    expect(stripes).toContain(1);
    expect(stripes).toContain(0);
    expect(alpha(10)).toBe(0);
    expect(Array.from(img.data.slice(0, 3))).toEqual([0, 229, 255]);
  });
});
