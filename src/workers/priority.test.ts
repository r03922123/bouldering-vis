import { MlClient } from './client';
import { createWorkerHost, type Handlers, type Preparers } from './host';
import type { Endpoint, FromWorker, ToWorker } from './protocol';

/** Wires a client and a host together in memory, the way a Worker would. */
function channel(handlers: Handlers, prepare: Preparers = {}) {
  const toWorker: Endpoint<ToWorker> = { postMessage: (m) => queueMicrotask(() => host(m)) };
  const toClient: Endpoint<FromWorker> = {
    postMessage: (m) => queueMicrotask(() => client.receive(m)),
  };
  const host = createWorkerHost(handlers, toClient, prepare);
  const client = new MlClient(toWorker);
  return client;
}

function rgba(w: number, h: number) {
  return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) } as ImageData;
}

describe('job priorities (SPEC.md › Tech Stack; Cairn review I1)', () => {
  it('runs hold-type jobs before depth, so the cards fill in first (I1)', async () => {
    const order: string[] = [];
    let release = () => {};
    const client = channel({
      'sam:embed': async (req) => ({ type: 'sam:ready', imageId: req.imageId }),
      'wall:segment': async (req) => {
        await new Promise<void>((r) => (release = r)); // the queue is busy while the rest arrives
        return { type: 'wall:mask', imageId: req.imageId, mask: new Uint8Array(1) };
      },
      'depth:run': async (req) => {
        order.push('depth');
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
      'clip:embed': async (req) => {
        order.push(`clip ${req.holdId}`);
        return { type: 'clip:embedding', holdId: req.holdId, embedding: new Float32Array(1) };
      },
    });
    await client.request({ type: 'sam:embed', imageId: 'a', pixels: rgba(1, 1) });
    const wall = client.request({ type: 'wall:segment', imageId: 'a', pixels: rgba(1, 1) });
    await new Promise((r) => setTimeout(r, 0));
    // Depth arrives first here on purpose: the priorities alone must still put the CLIP jobs ahead.
    const depth = client.request({ type: 'depth:run', imageId: 'a', pixels: rgba(1, 1) });
    const clips = ['h1', 'h2'].map((holdId) =>
      client.request({ type: 'clip:embed', imageId: 'a', holdId, crop: rgba(1, 1) }),
    );
    await new Promise((r) => setTimeout(r, 0));
    release();
    await Promise.all([wall, depth, ...clips]);
    expect(order).toEqual(['clip h1', 'clip h2', 'depth']);
  });

  it('ranks wall footholds with the wall mask: after a tap, before depth (Amendment 2026-10-31 (b))', async () => {
    const order: string[] = [];
    let release = () => {};
    const client = channel({
      'sam:embed': async (req) => ({ type: 'sam:ready', imageId: req.imageId }),
      'sam:decode': async (req) => {
        order.push('decode');
        return { type: 'sam:hold', imageId: req.imageId, seq: 0, hold: null };
      },
      'wall:segment': async (req) => {
        await new Promise<void>((r) => (release = r)); // the queue is busy while the rest arrives
        return { type: 'wall:mask', imageId: req.imageId, mask: new Uint8Array(1) };
      },
      'wall:footholds': async (req) => {
        order.push('footholds');
        return {
          type: 'wall:blobs',
          imageId: req.imageId,
          footholds: {
            imageId: req.imageId,
            width: 1,
            height: 1,
            labels: new Uint16Array(1),
            blobs: [],
          },
        };
      },
      'depth:run': async (req) => {
        order.push('depth');
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
    await client.request({ type: 'sam:embed', imageId: 'a', pixels: rgba(1, 1) });
    const wall = client.request({ type: 'wall:segment', imageId: 'a', pixels: rgba(1, 1) });
    await new Promise((r) => setTimeout(r, 0));
    const depth = client.request({ type: 'depth:run', imageId: 'a', pixels: rgba(1, 1) });
    const footholds = client.request({ type: 'wall:footholds', imageId: 'a', pixels: rgba(1, 1) });
    const decode = client.request({
      type: 'sam:decode',
      imageId: 'a',
      point: { x: 0, y: 0 },
      selected: [],
      seen: 0,
    });
    await new Promise((r) => setTimeout(r, 0));
    release();
    await Promise.all([wall, depth, footholds, decode]);
    expect(order).toEqual(['decode', 'footholds', 'depth']);
  });

  it('loads a model outside the queue, so a tap never waits for a download (C1 follow-up)', async () => {
    const order: string[] = [];
    let finishDownload = () => {};
    const download = new Promise<void>((r) => (finishDownload = r));
    const client = channel(
      {
        'sam:embed': async (req) => ({ type: 'sam:ready', imageId: req.imageId }),
        'sam:decode': async (req) => {
          order.push('decode');
          return { type: 'sam:hold', imageId: req.imageId, seq: 0, hold: null };
        },
        'depth:run': async (req) => {
          order.push('depth');
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
      },
      { 'depth:run': () => download },
    );
    await client.request({ type: 'sam:embed', imageId: 'a', pixels: rgba(1, 1) });
    const depth = client.request({ type: 'depth:run', imageId: 'a', pixels: rgba(1, 1) });
    await new Promise((r) => setTimeout(r, 0));
    await client.request({
      type: 'sam:decode',
      imageId: 'a',
      point: { x: 0, y: 0 },
      selected: [],
      seen: 0,
    });
    expect(order).toEqual(['decode']); // the tap ran while depth was still downloading
    finishDownload();
    await depth;
    expect(order).toEqual(['decode', 'depth']);
  });

  it('drops a job whose image was replaced while its model downloaded', async () => {
    let finishDownload = () => {};
    const download = new Promise<void>((r) => (finishDownload = r));
    const ran: string[] = [];
    const client = channel(
      {
        'sam:embed': async (req) => ({ type: 'sam:ready', imageId: req.imageId }),
        'clip:embed': async (req) => {
          ran.push(req.holdId);
          return { type: 'clip:embedding', holdId: req.holdId, embedding: new Float32Array(1) };
        },
      },
      { 'clip:embed': () => download },
    );
    await client.request({ type: 'sam:embed', imageId: 'a', pixels: rgba(1, 1) });
    const old = client.request({
      type: 'clip:embed',
      imageId: 'a',
      holdId: 'h1',
      crop: rgba(1, 1),
    });
    await client.request({ type: 'sam:embed', imageId: 'b', pixels: rgba(1, 1) });
    finishDownload();
    await expect(old).rejects.toThrow(/stale image/);
    expect(ran).toEqual([]);
  });
});
