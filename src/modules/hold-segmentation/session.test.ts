import { fakeMlClient } from '../../../tests/fakeClient';
import { holdAt, selectAt } from './session';
import type { HoldMask } from './types';

/** A 200×100 grey wall (the fake SAM's wall color) with a red patch at x 40–60, y 40–60. */
function wallImage() {
  const w = 200;
  const h = 100;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const x = i % w;
    const y = Math.floor(i / w);
    const red = x >= 40 && x <= 60 && y >= 40 && y <= 60;
    data.set(red ? [200, 30, 30, 255] : [207, 210, 204, 255], i * 4);
  }
  return { id: 'img', width: w, height: h, pixels: { width: w, height: h, data } as ImageData };
}

async function ready() {
  const client = fakeMlClient();
  const image = wallImage();
  await client.request({ type: 'sam:embed', imageId: image.id, pixels: image.pixels });
  return { client, image };
}

describe('holdAt', () => {
  it('finds the selected hold whose mask covers the point', () => {
    const mask = new Uint8Array(200 * 100);
    mask[50 * 200 + 50] = 1;
    const hold = { id: 'h1', mask } as HoldMask;
    expect(holdAt([hold], { x: 50.4, y: 49.6 }, 200)).toBe(hold);
    expect(holdAt([hold], { x: 10, y: 10 }, 200)).toBeNull();
  });
});

describe('selectAt', () => {
  it('adds a new hold with role route, stats and the next order', async () => {
    const { client, image } = await ready();
    const r = await selectAt(client, image, () => [], { x: 50, y: 50 });
    if (r.kind !== 'added') throw new Error('expected a hold');
    expect(r.hold.role).toBe('route');
    expect(r.hold.order).toBe(0);
    expect(r.hold.imageId).toBe('img');
    expect(r.hold.mask[50 * 200 + 50]).toBe(1);
    expect(r.hold.area).toBeGreaterThan(0);
    expect(r.hold.tapPoint).toEqual({ x: 50, y: 50 });
  });

  it('removes a selected hold when tapping inside it, without asking the model', async () => {
    const { client, image } = await ready();
    const first = await selectAt(client, image, () => [], { x: 50, y: 50 });
    if (first.kind !== 'added') throw new Error('expected a hold');
    const spy = vi.spyOn(client, 'request');
    const r = await selectAt(client, image, () => [first.hold], { x: 51, y: 51 });
    expect(r).toEqual({ kind: 'removed', id: first.hold.id });
    expect(spy).not.toHaveBeenCalled();
  });

  it('reports a miss on bare wall (only wall-sized candidates)', async () => {
    const { client, image } = await ready();
    expect(await selectAt(client, image, () => [], { x: 150, y: 20 })).toEqual({ kind: 'miss' });
  });

  it('never overlaps an existing hold', async () => {
    const { client, image } = await ready();
    const a = await selectAt(client, image, () => [], { x: 45, y: 45 });
    if (a.kind !== 'added') throw new Error('expected a hold');
    const b = await selectAt(client, image, () => [a.hold], { x: 58, y: 58 });
    if (b.kind !== 'added') throw new Error('expected a hold');
    for (let i = 0; i < a.hold.mask.length; i++) expect(a.hold.mask[i]! & b.hold.mask[i]!).toBe(0);
    expect(b.hold.order).toBe(1);
  });

  it('subtracts a hold that was added while this tap was being decoded', async () => {
    const { client, image } = await ready();
    let holds: HoldMask[] = [];
    const first = selectAt(client, image, () => holds, { x: 45, y: 45 });
    const second = selectAt(client, image, () => holds, { x: 58, y: 58 });
    const a = await first;
    if (a.kind !== 'added') throw new Error('expected a hold');
    // The second request went out before hold a landed (selected = [], seen = 0), so the worker
    // still subtracts a: its ledger keeps every hold the main thread has not seen yet.
    holds = [a.hold];
    const b = await second;
    if (b.kind !== 'added') throw new Error('expected a hold');
    for (let i = 0; i < a.hold.mask.length; i++) expect(a.hold.mask[i]! & b.hold.mask[i]!).toBe(0);
  });

  it("gives a deselected hold's pixels back: re-tapping there adds a full hold again", async () => {
    const { client, image } = await ready();
    const a = await selectAt(client, image, () => [], { x: 50, y: 50 });
    if (a.kind !== 'added') throw new Error('expected a hold');
    // The user removed hold a (the store no longer has it), then tapped the same spot.
    const b = await selectAt(client, image, () => [], { x: 50, y: 50 });
    if (b.kind !== 'added') throw new Error('expected a hold');
    expect(b.hold.area).toBe(a.hold.area);
  });

  it('still never overlaps a selected hold after the same image is embedded again (leaving 3D remounts the canvas)', async () => {
    const { client, image } = await ready();
    const a = await selectAt(client, image, () => [], { x: 45, y: 45 });
    if (a.kind !== 'added') throw new Error('expected a hold');
    await client.request({ type: 'sam:embed', imageId: image.id, pixels: image.pixels });
    const b = await selectAt(client, image, () => [a.hold], { x: 58, y: 58 });
    if (b.kind !== 'added') throw new Error('expected a hold');
    for (let i = 0; i < a.hold.mask.length; i++) expect(a.hold.mask[i]! & b.hold.mask[i]!).toBe(0);
  });

  it('keeps two in-flight taps apart after a re-embed of the same image', async () => {
    const { client, image } = await ready();
    // Two holds land (the main thread has now seen sequence 2), then both are removed.
    for (const p of [
      { x: 42, y: 42 },
      { x: 58, y: 58 },
    ]) {
      if ((await selectAt(client, image, () => [], p)).kind !== 'added') throw new Error('hold');
    }
    await client.request({ type: 'sam:embed', imageId: image.id, pixels: image.pixels });
    const first = selectAt(client, image, () => [], { x: 45, y: 45 });
    const second = selectAt(client, image, () => [], { x: 55, y: 55 });
    const [a, b] = await Promise.all([first, second]);
    if (a.kind !== 'added' || b.kind !== 'added') throw new Error('expected two holds');
    for (let i = 0; i < a.hold.mask.length; i++) expect(a.hold.mask[i]! & b.hold.mask[i]!).toBe(0);
  });

  it('gives a removed hold back even if it was removed while another tap was in flight', async () => {
    const { client, image } = await ready();
    let holds: HoldMask[] = [];
    const first = selectAt(client, image, () => holds, { x: 45, y: 45 });
    const second = selectAt(client, image, () => holds, { x: 58, y: 58 });
    const a = await first;
    if (a.kind !== 'added') throw new Error('expected a hold');
    const b = await second; // carved around a: it was sent before a was removed ("earlier wins")
    if (b.kind !== 'added') throw new Error('expected a hold');
    holds = [b.hold]; // a never got kept (or the user removed it)
    const c = await selectAt(client, image, () => holds, { x: 45, y: 45 });
    if (c.kind !== 'added') throw new Error('expected a hold');
    for (let i = 0; i < c.hold.mask.length; i++) expect(c.hold.mask[i]! & b.hold.mask[i]!).toBe(0);
    expect(c.hold.mask[45 * 200 + 45]).toBe(1); // a's centre is free again
  });

  it('in a view that cannot add holds, a tap off a hold is blocked without asking the model', async () => {
    const { client, image } = await ready();
    const spy = vi.spyOn(client, 'request');
    expect(await selectAt(client, image, () => [], { x: 50, y: 50 }, { allowAdd: false })).toEqual({
      kind: 'blocked',
    });
    expect(spy).not.toHaveBeenCalled();
  });
});
