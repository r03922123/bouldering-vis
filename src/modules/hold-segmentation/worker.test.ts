import { HoldLedger } from './worker';

const W = 60;
const H = 60;

function rect(x0: number, y0: number, x1: number, y1: number): Uint8Array {
  const m = new Uint8Array(W * H);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m[y * W + x] = 1;
  return m;
}
const wall = () => new Uint8Array(W * H).fill(1);
const overlap = (a: Uint8Array, b: Uint8Array) => a.some((v, i) => v && b[i]);

describe('HoldLedger', () => {
  it('turns SAM candidates into a finished hold: picked, cleaned, measured, numbered', () => {
    const ledger = new HoldLedger(W, H);
    const { seq, hold } = ledger.finish([rect(10, 10, 15, 15), wall()], [0.8, 0.95], {
      x: 12,
      y: 12,
    });
    expect(seq).toBe(1);
    expect(hold).not.toBeNull();
    expect(hold!.area).toBe(36);
    expect(hold!.bbox).toEqual({ x: 10, y: 10, w: 6, h: 6 });
    expect(hold!.centroid).toEqual({ x: 12.5, y: 12.5 });
    expect(hold!.tapPoint).toEqual({ x: 12, y: 12 });
    expect(hold!.id).toMatch(/[0-9a-f-]{36}/);
  });

  it('reports a miss (no hold, same seq) when only wall-sized candidates contain the tap', () => {
    const ledger = new HoldLedger(W, H);
    const r = ledger.finish([wall(), wall()], [0.9, 0.9], { x: 5, y: 5 });
    expect(r.hold).toBeNull();
    expect(ledger.finish([wall()], [0.9], { x: 5, y: 5 }).seq).toBe(r.seq);
  });

  it('never overlaps a hold it returned earlier (the earlier one wins)', () => {
    const ledger = new HoldLedger(W, H);
    const a = ledger.finish([rect(10, 10, 20, 20)], [0.9], { x: 12, y: 12 }).hold!;
    const b = ledger.finish([rect(15, 15, 25, 25)], [0.9], { x: 23, y: 23 }).hold!;
    expect(overlap(a.mask, b.mask)).toBe(false);
    expect(b.area).toBe(11 * 11 - 6 * 6);
  });

  it('keeps its own copy of a returned mask, because the response buffer is transferred', () => {
    const ledger = new HoldLedger(W, H);
    const a = ledger.finish([rect(10, 10, 20, 20)], [0.9], { x: 12, y: 12 }).hold!;
    a.mask.fill(0); // simulates the buffer being detached or reused
    const b = ledger.finish([rect(15, 15, 25, 25)], [0.9], { x: 23, y: 23 }).hold!;
    expect(b.area).toBe(11 * 11 - 6 * 6);
  });

  it('forgets a hold the main thread has seen and no longer selects', () => {
    const ledger = new HoldLedger(W, H);
    const a = ledger.finish([rect(10, 10, 20, 20)], [0.9], { x: 12, y: 12 });
    ledger.prune([], a.seq); // seen seq 1, selected nothing: hold a was deselected
    const b = ledger.finish([rect(15, 15, 25, 25)], [0.9], { x: 23, y: 23 }).hold!;
    expect(b.area).toBe(11 * 11);
  });

  it('keeps a hold the main thread has not seen yet, even if it is not in the selection', () => {
    const ledger = new HoldLedger(W, H);
    const first = ledger.finish([rect(10, 10, 20, 20)], [0.9], { x: 12, y: 12 });
    const a = first.hold!;
    ledger.prune([], first.seq - 1); // a request sent before hold a landed
    const b = ledger.finish([rect(15, 15, 25, 25)], [0.9], { x: 23, y: 23 }).hold!;
    expect(overlap(a.mask, b.mask)).toBe(false);
  });

  it('keeps a seen hold that is still selected', () => {
    const ledger = new HoldLedger(W, H);
    const a = ledger.finish([rect(10, 10, 20, 20)], [0.9], { x: 12, y: 12 });
    ledger.prune([a.hold!.id], a.seq);
    const b = ledger.finish([rect(15, 15, 25, 25)], [0.9], { x: 23, y: 23 }).hold!;
    expect(overlap(a.hold!.mask, b.mask)).toBe(false);
  });

  it('numbers holds above anything an earlier ledger handed out', () => {
    const old = new HoldLedger(W, H).finish([rect(10, 10, 20, 20)], [0.9], { x: 12, y: 12 });
    const fresh = new HoldLedger(W, H).finish([rect(30, 30, 40, 40)], [0.9], { x: 32, y: 32 });
    expect(fresh.seq).toBeGreaterThan(old.seq);
  });
});
