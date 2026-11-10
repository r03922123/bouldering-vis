import { createMaskCache } from './wallCache';
import { lightSamHandlers, snapToHold } from './lightSam';
import type { HandlerContext } from './host';

const W = 400;
const H = 300;
const ctx = { progress: () => {} } as unknown as HandlerContext;
const pixels = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4) } as ImageData;

/** A wall mask with two square holds: A at (50..89, 50..89) and B at (200..239, 100..139). */
function twoHolds(): Uint8Array {
  const m = new Uint8Array(W * H);
  for (let y = 50; y < 90; y++) for (let x = 50; x < 90; x++) m[y * W + x] = 1;
  for (let y = 100; y < 140; y++) for (let x = 200; x < 240; x++) m[y * W + x] = 1;
  return m;
}

async function ready(segment = vi.fn(twoHolds)) {
  const handlers = lightSamHandlers(createMaskCache(segment));
  await handlers['sam:embed']({ type: 'sam:embed', imageId: 'img', pixels }, ctx);
  const tap = (x: number, y: number) =>
    handlers['sam:decode'](
      { type: 'sam:decode', imageId: 'img', point: { x, y }, selected: [], seen: 0 },
      ctx,
    );
  return { handlers, segment, tap };
}

describe('light hold finder (SPEC-hold-segmentation › Amendment 2026-11-04)', () => {
  it('a tap on a hold returns that whole hold, not its neighbour', async () => {
    const { tap } = await ready();
    const { hold } = await tap(70, 70);
    expect(hold?.bbox).toEqual({ x: 50, y: 50, w: 40, h: 40 });
    expect(hold?.area).toBe(1600);
  });

  it('a tap just off a hold (within 1.5% of the short side) takes that hold', async () => {
    const { tap } = await ready();
    const { hold } = await tap(93, 70); // 4 px right of A; 1.5% of 300 px is 4.5 px
    expect(hold?.bbox).toEqual({ x: 50, y: 50, w: 40, h: 40 });
  });

  it('a tap on bare wall away from every hold is a miss', async () => {
    const { tap } = await ready();
    expect((await tap(350, 250)).hold).toBeNull();
  });

  it('never returns a hold twice (the ledger), but the other hold still comes back', async () => {
    const { tap } = await ready();
    expect((await tap(70, 70)).hold).not.toBeNull();
    expect((await tap(75, 75)).hold).toBeNull();
    expect((await tap(220, 120)).hold?.bbox).toEqual({ x: 200, y: 100, w: 40, h: 40 });
  });

  it('downloads nothing and runs the wall mask once per image, shared with wall:segment', async () => {
    const segment = vi.fn(twoHolds);
    const cache = createMaskCache(segment);
    const handlers = lightSamHandlers(cache);
    await handlers['sam:embed']({ type: 'sam:embed', imageId: 'img', pixels }, ctx);
    await handlers['sam:embed']({ type: 'sam:embed', imageId: 'img', pixels }, ctx);
    cache.mask('img', pixels); // what wall:segment and wall:footholds call
    expect(segment).toHaveBeenCalledTimes(1);
  });

  it('candidates are the hold under the tap, for the selection preview', async () => {
    const { handlers } = await ready();
    const r = await handlers['sam:candidates'](
      { type: 'sam:candidates', imageId: 'img', point: { x: 220, y: 120 } },
      ctx,
    );
    expect(r.masks).toHaveLength(1);
    expect(r.masks[0]!.reduce((s, v) => s + v, 0)).toBe(1600);
    expect(r.scores).toEqual([1]);
  });

  it('a tap before the photo is ready says so, like SAM', async () => {
    const handlers = lightSamHandlers(createMaskCache(twoHolds));
    await expect(
      handlers['sam:decode'](
        { type: 'sam:decode', imageId: 'other', point: { x: 1, y: 1 }, selected: [], seen: 0 },
        ctx,
      ),
    ).rejects.toThrow('no embedding for image other');
  });
});

describe('snapToHold', () => {
  it('keeps a point on a hold, finds the nearest hold pixel nearby, and gives up beyond r', () => {
    const m = twoHolds();
    expect(snapToHold(m, W, H, { x: 60, y: 60 }, 4)).toEqual({ x: 60, y: 60 });
    expect(snapToHold(m, W, H, { x: 92, y: 60 }, 4)).toEqual({ x: 89, y: 60 });
    expect(snapToHold(m, W, H, { x: 99, y: 60 }, 4)).toBeNull();
  });
});
