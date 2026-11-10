import { createFakeHandlers, fakeHandlers } from './fakeHandlers';

const noProgress = { progress: () => {} };

function rgba(w: number, h: number) {
  return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) } as ImageData;
}

describe('fake ML handlers', () => {
  it('answers every request type', () => {
    expect(Object.keys(fakeHandlers).sort()).toEqual(
      [
        'clip:embed',
        'depth:run',
        'models:prefetch',
        'sam:candidates',
        'sam:decode',
        'sam:embed',
        'wall:footholds',
        'wall:segment',
      ].sort(),
    );
  });

  it('isolates a deterministic disc hold at image size around the tap', async () => {
    await fakeHandlers['sam:embed'](
      { type: 'sam:embed', imageId: 'a', pixels: rgba(100, 80) },
      noProgress,
    );
    const req = {
      type: 'sam:decode' as const,
      imageId: 'a',
      point: { x: 30, y: 40 },
      selected: [] as string[],
      seen: 0,
    };
    const r1 = await fakeHandlers['sam:decode'](req, noProgress);
    expect(r1.seq).toBeGreaterThan(0);
    expect(r1.hold?.mask).toHaveLength(100 * 80);
    expect(r1.hold?.mask[40 * 100 + 30]).toBe(1);
    // The "whole" candidate (radius 14) wins: it scores highest and is under 8% of the image.
    expect(r1.hold?.area).toBeGreaterThan(Math.PI * 13 * 13);
    expect(r1.hold?.area).toBeLessThan(Math.PI * 15 * 15);
    expect(r1.hold?.tapPoint).toEqual({ x: 30, y: 40 });
    // A second tap on the same hold's pixels gets nothing new: the first hold owns them.
    const r2 = await fakeHandlers['sam:decode'](
      { ...req, seen: 1, selected: [r1.hold!.id] },
      noProgress,
    );
    expect(r2.hold).toBeNull();
    expect(r2.seq).toBe(r1.seq);
  });

  it('returns a left-to-right depth ramp in [0, 1]', async () => {
    const r = await fakeHandlers['depth:run'](
      { type: 'depth:run', imageId: 'a', pixels: rgba(4, 2) },
      noProgress,
    );
    expect([r.width, r.height]).toEqual([4, 2]);
    [0, 1 / 3, 2 / 3, 1].forEach((expected, x) => expect(r.depth[x]).toBeCloseTo(expected, 6));
  });

  it('returns unit normals with the depth ramp', async () => {
    const r = await fakeHandlers['depth:run'](
      { type: 'depth:run', imageId: 'a', pixels: rgba(8, 4) },
      noProgress,
    );
    expect(r.normals).toHaveLength(8 * 4 * 3);
    expect(Math.hypot(r.normals[0]!, r.normals[1]!, r.normals[2]!)).toBeCloseTo(1, 5);
  });

  it('returns a unit-length 512-d embedding that is stable per hold', async () => {
    const req = { type: 'clip:embed', imageId: 'a', holdId: 'h1', crop: rgba(224, 224) } as const;
    const a = await fakeHandlers['clip:embed'](req, noProgress);
    const b = await fakeHandlers['clip:embed'](req, noProgress);
    expect(a.embedding).toHaveLength(512);
    expect(Math.hypot(...a.embedding)).toBeCloseTo(1, 5);
    expect(a.embedding).toEqual(b.embedding);
  });

  it('finds the wall footholds from the same mask as wall:segment, segmenting once', async () => {
    const handlers = createFakeHandlers();
    const pixels = rgba(60, 40);
    // A light wall with one dark 12 × 8 hold, so the k-means split finds it.
    pixels.data.fill(220);
    for (let y = 10; y < 18; y++) {
      for (let x = 20; x < 32; x++) pixels.data.fill(20, (y * 60 + x) * 4, (y * 60 + x) * 4 + 3);
    }
    const seg = await handlers['wall:segment'](
      { type: 'wall:segment', imageId: 'w', pixels },
      noProgress,
    );
    const res = await handlers['wall:footholds'](
      { type: 'wall:footholds', imageId: 'w', pixels },
      noProgress,
    );
    expect(res.type).toBe('wall:blobs');
    expect(res.footholds).toMatchObject({ imageId: 'w', width: 60, height: 40 });
    const holdPixels = seg.mask.reduce((s, v) => s + v, 0);
    expect(res.footholds.blobs.reduce((s, b) => s + b.area, 0)).toBe(holdPixels);
  });
});
