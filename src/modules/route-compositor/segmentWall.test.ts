import { segmentWall } from './segmentWall';

type RGB = [number, number, number];

/** A w×h wall of `wall` color with filled discs painted on top. */
function paint(
  w: number,
  h: number,
  wall: RGB | ((x: number, y: number) => RGB),
  discs: { x: number; y: number; r: number; c: RGB }[],
) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const hit = discs.find((d) => (x - d.x) ** 2 + (y - d.y) ** 2 <= d.r * d.r);
      const c = hit ? hit.c : typeof wall === 'function' ? wall(x, y) : wall;
      data.set([...c, 255], (y * w + x) * 4);
    }
  }
  return { width: w, height: h, data, colorSpace: 'srgb' } as ImageData;
}

const GREY: RGB = [207, 210, 204];
const at = (m: Uint8Array, w: number, x: number, y: number) => m[y * w + x];

describe('segmentWall', () => {
  const W = 300;
  const H = 200;
  const discs = [
    { x: 60, y: 60, r: 18, c: [214, 40, 40] as RGB },
    { x: 200, y: 120, r: 22, c: [29, 78, 216] as RGB },
    { x: 120, y: 150, r: 15, c: [17, 17, 17] as RGB },
  ];

  it('marks colored holds and leaves the wall clear', () => {
    const m = segmentWall(paint(W, H, GREY, discs));
    for (const d of discs) expect(at(m, W, d.x, d.y)).toBe(1);
    expect(at(m, W, 10, 10)).toBe(0);
    expect(at(m, W, 280, 30)).toBe(0);
  });

  it('removes specks smaller than 0.02% of the image (screw holes)', () => {
    // 300×200 → 0.02% = 12 px; a 2-px-radius dot is ~13 px before opening, gone after.
    const m = segmentWall(paint(W, H, GREY, [...discs, { x: 250, y: 30, r: 2, c: [20, 20, 20] }]));
    expect(at(m, W, 250, 30)).toBe(0);
  });

  it('treats two large panel colors as wall', () => {
    const twoPanels = (x: number): RGB => (x < W / 2 ? GREY : [120, 140, 160]);
    const m = segmentWall(paint(W, H, twoPanels, discs));
    expect(at(m, W, 20, 20)).toBe(0);
    expect(at(m, W, 280, 20)).toBe(0);
    for (const d of discs) expect(at(m, W, d.x, d.y)).toBe(1);
  });

  it('is deterministic for a fixed seed', () => {
    const img = paint(W, H, GREY, discs);
    expect(Array.from(segmentWall(img, 3))).toEqual(Array.from(segmentWall(img, 3)));
  });

  it('returns a 0/1 mask of the image size', () => {
    const m = segmentWall(paint(W, H, GREY, discs));
    expect(m).toBeInstanceOf(Uint8Array);
    expect(m).toHaveLength(W * H);
    expect(m.every((v) => v === 0 || v === 1)).toBe(true);
  });

  it('drops regions over 8% of the image (ceiling, beams, mats are not holds)', () => {
    // A dark band across the top 12% of the image, like the ceiling above a wall: too small
    // for a wall color (< 15%), too big for one hold (> 8%).
    const ceiling = (_x: number, y: number): RGB => (y < H * 0.12 ? [25, 25, 30] : GREY);
    const m = segmentWall(paint(W, H, ceiling, discs));
    expect(at(m, W, 150, 10)).toBe(0);
    for (const d of discs) expect(at(m, W, d.x, d.y)).toBe(1);
  });
});
