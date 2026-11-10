import { MlClient } from './client';
import { createWorkerHost } from './host';
import type { Endpoint, FromWorker, ToWorker } from './protocol';
import { createMaskCache, wallHandlers } from './wallCache';

const W = 40;
const H = 30;

function rgba(w: number, h: number) {
  return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) } as ImageData;
}

/** A stand-in for segmentWall: one 10 × 5 hold at (5, 4), counted per call. */
function spySegment() {
  const calls: string[] = [];
  const segment = (pixels: ImageData) => {
    calls.push(`${pixels.width}x${pixels.height}`);
    const mask = new Uint8Array(pixels.width * pixels.height);
    for (let y = 4; y < 9; y++) for (let x = 5; x < 15; x++) mask[y * pixels.width + x] = 1;
    return mask;
  };
  return { calls, segment };
}

/**
 * Client and host in memory, with responses cloned and their buffers transferred (detached on the
 * worker side) the way a real Worker's postMessage does.
 */
function channel(segment: (pixels: ImageData) => Uint8Array) {
  const toWorker: Endpoint<ToWorker> = { postMessage: (m) => queueMicrotask(() => host(m)) };
  const toClient: Endpoint<FromWorker> = {
    postMessage: (m, transfer = []) => {
      const copy = structuredClone(m, { transfer });
      queueMicrotask(() => client.receive(copy));
    },
  };
  const host = createWorkerHost(wallHandlers(createMaskCache(segment)), toClient);
  const client = new MlClient(toWorker);
  return client;
}

const segmentReq = (imageId: string) =>
  ({ type: 'wall:segment', imageId, pixels: rgba(W, H) }) as const;
const footholdsReq = (imageId: string) =>
  ({ type: 'wall:footholds', imageId, pixels: rgba(W, H) }) as const;

describe('shared wall mask cache (Amendment 2026-10-31 (b), worker protocol)', () => {
  it('segments once for wall:segment then wall:footholds', async () => {
    const { calls, segment } = spySegment();
    const client = channel(segment);
    const mask = await client.request(segmentReq('a'));
    const blobs = await client.request(footholdsReq('a'));
    expect(calls).toEqual([`${W}x${H}`]);
    expect(mask.mask).toHaveLength(W * H);
    expect(blobs.footholds.blobs.map((b) => b.id)).toEqual(['blob:1']);
  });

  it('segments once for wall:footholds then wall:segment', async () => {
    const { calls, segment } = spySegment();
    const client = channel(segment);
    const blobs = await client.request(footholdsReq('a'));
    const mask = await client.request(segmentReq('a'));
    expect(calls).toHaveLength(1);
    expect(blobs.type).toBe('wall:blobs');
    expect(blobs.imageId).toBe('a');
    expect(blobs.footholds.labels).toHaveLength(W * H);
    expect(mask.mask).toHaveLength(W * H);
  });

  it('still hands out a full mask after a response transferred the previous one', async () => {
    const { segment } = spySegment();
    const client = channel(segment);
    const first = await client.request(segmentReq('a'));
    const second = await client.request(segmentReq('a'));
    expect(second.mask).toHaveLength(W * H);
    expect(Array.from(second.mask)).toEqual(Array.from(first.mask));
    const blobs = await client.request(footholdsReq('a'));
    expect(blobs.footholds.blobs[0]).toMatchObject({ area: 50, bbox: { x: 5, y: 4, w: 10, h: 5 } });
  });

  it('keeps one image: a new image segments again, and so does going back', async () => {
    const { calls, segment } = spySegment();
    const cache = createMaskCache(segment);
    cache.mask('a', rgba(W, H));
    cache.mask('b', rgba(W, H));
    cache.mask('b', rgba(W, H));
    cache.mask('a', rgba(W, H));
    expect(calls).toHaveLength(3);
  });

  it('gives each caller its own copy', () => {
    const { segment } = spySegment();
    const cache = createMaskCache(segment);
    const a = cache.mask('a', rgba(W, H));
    a.fill(0);
    expect(cache.mask('a', rgba(W, H)).reduce((s, v) => s + v, 0)).toBe(50);
  });
});
