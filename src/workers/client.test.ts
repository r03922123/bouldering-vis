import { MlClient } from './client';
import { createWorkerHost, type Handlers } from './host';
import type { Endpoint, FromWorker, ToWorker } from './protocol';

/** Wires a client and a host together in memory, the way a Worker would. */
function channel(handlers: Handlers) {
  const toWorker: Endpoint<ToWorker> = { postMessage: (m) => queueMicrotask(() => host(m)) };
  const toClient: Endpoint<FromWorker> = {
    postMessage: (m) => queueMicrotask(() => client.receive(m)),
  };
  const host = createWorkerHost(handlers, toClient);
  const client = new MlClient(toWorker);
  return client;
}

function rgba(w: number, h: number) {
  return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) } as ImageData;
}

describe('MlClient ↔ worker host', () => {
  it('resolves a request with the matching handler response', async () => {
    const client = channel({
      'sam:embed': async (req) => ({ type: 'sam:ready', imageId: req.imageId }),
    });
    await expect(
      client.request({ type: 'sam:embed', imageId: 'a', pixels: rgba(2, 2) }),
    ).resolves.toEqual({ type: 'sam:ready', imageId: 'a' });
  });

  it('matches concurrent responses to their own requests', async () => {
    const client = channel({
      'sam:embed': async (req) => ({ type: 'sam:ready', imageId: req.imageId }),
      'sam:decode': async (req) => ({
        type: 'sam:hold',
        imageId: req.imageId,
        seq: req.point.x,
        hold: null,
      }),
    });
    await client.request({ type: 'sam:embed', imageId: 'a', pixels: rgba(2, 2) });
    const decode = (x: number) =>
      client.request({
        type: 'sam:decode',
        imageId: 'a',
        point: { x, y: 0 },
        selected: [],
        seen: 0,
      });
    const [r1, r2] = await Promise.all([decode(1), decode(2)]);
    expect(r1.seq).toBe(1);
    expect(r2.seq).toBe(2);
  });

  it('rejects with the handler error message', async () => {
    const client = channel({
      'depth:run': async () => {
        throw new Error('model download failed');
      },
    });
    await expect(
      client.request({ type: 'depth:run', imageId: 'a', pixels: rgba(2, 2) }),
    ).rejects.toThrow('model download failed');
  });

  it('rejects requests that have no handler', async () => {
    const client = channel({});
    await expect(
      client.request({ type: 'depth:run', imageId: 'a', pixels: rgba(2, 2) }),
    ).rejects.toThrow(/no handler for depth:run/);
  });

  it('treats sam:embed as the start of a new image and rejects stale queued jobs', async () => {
    let release!: () => void;
    const slow = new Promise<void>((r) => (release = r));
    const client = channel({
      'sam:embed': async (req) => {
        if (req.imageId === 'old') await slow;
        return { type: 'sam:ready', imageId: req.imageId };
      },
      'depth:run': async (req) => ({
        type: 'depth:result',
        imageId: req.imageId,
        depth: new Float32Array(4),
        normals: new Float32Array(12),
        discontinuities: new Uint8Array(4),
        width: 2,
        height: 2,
      }),
    });
    const oldEmbed = client.request({ type: 'sam:embed', imageId: 'old', pixels: rgba(2, 2) });
    const oldDepth = client.request({ type: 'depth:run', imageId: 'old', pixels: rgba(2, 2) });
    await new Promise((r) => setTimeout(r, 0));
    const newEmbed = client.request({ type: 'sam:embed', imageId: 'new', pixels: rgba(2, 2) });
    release();
    await expect(oldDepth).rejects.toThrow(/stale/);
    await expect(oldEmbed).rejects.toThrow(/stale/);
    await expect(newEmbed).resolves.toEqual({ type: 'sam:ready', imageId: 'new' });
  });

  it('forwards model download progress to listeners', async () => {
    const seen: number[] = [];
    const client = channel({
      'depth:run': async (req, { progress }) => {
        progress({ model: 'depth', loaded: 50, total: 100 });
        return {
          type: 'depth:result',
          imageId: req.imageId,
          depth: new Float32Array(1),
          normals: new Float32Array(3),
          discontinuities: new Uint8Array(1),
          width: 1,
          height: 1,
        };
      },
    });
    client.onProgress((p) => seen.push(p.loaded / p.total));
    await client.request({ type: 'depth:run', imageId: 'a', pixels: rgba(1, 1) });
    expect(seen).toEqual([0.5]);
  });
});

describe('model prefetch while it downloads', () => {
  it('never blocks a tap or a new photo: the download runs beside the queue', async () => {
    const order: string[] = [];
    const never = new Promise<never>(() => {}); // a download that takes "forever"
    const client = channel({
      'models:prefetch': async () => {
        order.push('prefetch started');
        return never;
      },
      'sam:embed': async (req) => {
        order.push('embed');
        return { type: 'sam:ready', imageId: req.imageId };
      },
      'sam:decode': async (req) => {
        order.push('decode');
        return { type: 'sam:hold', imageId: req.imageId, seq: 0, hold: null };
      },
    });
    void client.request({ type: 'models:prefetch', imageId: 'a' });
    await new Promise((r) => setTimeout(r, 0));
    await client.request({
      type: 'sam:decode',
      imageId: 'a',
      point: { x: 0, y: 0 },
      selected: [],
      seen: 0,
    });
    await client.request({ type: 'sam:embed', imageId: 'b', pixels: rgba(1, 1) });
    expect(order).toEqual(['prefetch started', 'decode', 'embed']);
  });
});
