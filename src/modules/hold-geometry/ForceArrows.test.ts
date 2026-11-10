import type { HoldMask } from '../hold-segmentation';
import type { Force } from './force';
import { drawForceArrows } from './ForceArrows';

/** Records the 2D-context calls the drawer makes. */
function recorder() {
  const calls: string[] = [];
  const ctx = new Proxy(
    {},
    {
      get:
        (_t, prop: string) =>
        (...args: unknown[]) =>
          calls.push(`${prop}(${args.map((a) => JSON.stringify(a)).join(',')})`),
      set: (_t, prop: string, value) => (calls.push(`${prop}=${JSON.stringify(value)}`), true),
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

const hold = (id: string, x: number, y: number) => ({ id, centroid: { x, y } }) as HoldMask;
const force = (dir: Force['dir']): Force => ({ dir, source: 'type', cue: null });
const identity = (p: { x: number; y: number }) => p;

describe('drawForceArrows', () => {
  it('draws one green arrow per hold from the centroid along the on-screen force', () => {
    const { ctx, calls } = recorder();
    drawForceArrows(ctx, [hold('a', 100, 100)], new Map([['a', force([0, 1, 0])]]), identity);
    expect(calls).toContain('strokeStyle="#22c55e"');
    expect(calls).toContain('moveTo(100,100)');
    expect(calls).toContain('lineTo(100,126)'); // default (pull-down) arrows are a subtle 26 px
  });

  it('draws other directions bold, shortened by how much of the force goes into the wall', () => {
    const { ctx, calls } = recorder();
    drawForceArrows(ctx, [hold('a', 0, 0)], new Map([['a', force([0, 0.6, -0.8])]]), identity);
    expect(calls).toContain('lineTo(0,26)'); // notable 44 px × 0.6
    expect(calls).toContain('lineWidth=3.5');
  });

  it('marks a force almost straight into the wall with ⊗ instead of an arrow', () => {
    const { ctx, calls } = recorder();
    drawForceArrows(ctx, [hold('a', 10, 10)], new Map([['a', force([0.05, 0, -0.99])]]), identity);
    expect(calls.some((c) => c.startsWith('arc(10,10,'))).toBe(true);
    expect(calls.some((c) => c.startsWith('lineTo(10,'))).toBe(false);
  });

  it('draws nothing for holds without a force direction', () => {
    const { ctx, calls } = recorder();
    drawForceArrows(
      ctx,
      [hold('a', 10, 10), hold('b', 5, 5)],
      new Map([['a', force(null)]]),
      identity,
    );
    expect(calls.some((c) => c.startsWith('moveTo') || c.startsWith('arc'))).toBe(false);
  });
});
