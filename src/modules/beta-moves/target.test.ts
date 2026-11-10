import { ladder, ladderHolds, ladderStart, moveTo, routeHold, step } from './fixtures';
import { targetAt } from './target';

const ids = () => crypto.randomUUID();
const ctx = ladder({ ids, wallFeet: [{ id: 'wf:300:1450', point: [300, 1450] }] });
const start = ladderStart(ctx);
const id = (label: string) => step(ctx, { lh: label }).lh;

describe('targetAt (AC 30)', () => {
  it('gives a hand the nearest route hold within reach of the tap', () => {
    expect(targetAt(ctx, start, 'rh', { x: 590, y: 710 }, 50)).toBe(id('4'));
    expect(targetAt(ctx, start, 'lh', { x: 495, y: 160 }, 50)).toBe(id('7F'));
  });

  it('gives a hand nothing beyond maxDist', () => {
    expect(targetAt(ctx, start, 'rh', { x: 800, y: 550 }, 50)).toBeUndefined();
  });

  it('gives a foot a smear beyond maxDist, on the photo', () => {
    expect(targetAt(ctx, start, 'lf', { x: 800.4, y: 549.6 }, 50)).toBe('smear:800:550');
  });

  it('gives nothing off the photo', () => {
    expect(targetAt(ctx, start, 'lf', { x: -5, y: 500 }, 50)).toBeUndefined();
    expect(targetAt(ctx, start, 'lf', { x: 999.6, y: 500 }, 50)).toBeUndefined();
    expect(targetAt(ctx, start, 'rh', { x: 1200, y: 700 }, 500)).toBeUndefined();
  });

  it('never gives a hand a wall foothold or a smear', () => {
    expect(targetAt(ctx, start, 'lh', { x: 300, y: 1450 }, 50)).toBeUndefined();
  });

  it('gives a foot a wall foothold under feet: any, never under marked', () => {
    expect(targetAt(ctx, start, 'lf', { x: 305, y: 1452 }, 50)).toBe('wf:300:1450');
    const marked = ladder({ holds: ctx.holds, wallFeet: ctx.wallFeet, rules: { feet: 'marked' } });
    expect(targetAt(marked, start, 'lf', { x: 305, y: 1452 }, 50)).toBe('smear:305:1452');
  });

  it('never gives a foot the finish or a hold a hand is on', () => {
    expect(targetAt(ctx, start, 'lf', { x: 500, y: 150 }, 50)).toBe('smear:500:150');
    expect(targetAt(ctx, start, 'rf', { x: 600, y: 1000 }, 50)).toBe('smear:600:1000');
    const moved = moveTo(start, { rh: id('4') });
    expect(targetAt(ctx, moved, 'rf', { x: 600, y: 1000 }, 50)).toBe(id('2S'));
  });

  it('never gives a hand a hold a foot is on (B12)', () => {
    expect(targetAt(ctx, start, 'rh', { x: 580, y: 1580 }, 50)).toBeUndefined();
  });

  it('breaks a tie by order, whatever the ids', () => {
    for (const [a, b] of [
      ['a', 'b'],
      ['z', 'y'],
    ]) {
      const holds = [
        ...ladderHolds(ids).filter((h) => h.role !== 'route'),
        routeHold(10, '4', 700, 700, 'route', b!),
        routeHold(9, '3', 500, 700, 'route', a!),
      ];
      const c = ladder({ holds });
      expect(targetAt(c, step(c, { lh: '1S', rh: '2S' }), 'rh', { x: 600, y: 700 }, 150)).toBe(a);
    }
  });

  it('breaks a tie between wall feet by (y, x), after holds', () => {
    const c = ladder({
      holds: ctx.holds,
      wallFeet: [
        { id: 'wf:110:1500', point: [110, 1500] },
        { id: 'wf:90:1500', point: [90, 1500] },
        { id: 'wf:100:1490', point: [100, 1490] },
      ],
    });
    expect(targetAt(c, start, 'lf', { x: 100, y: 1500 }, 50)).toBe('wf:100:1490');
    const c2 = ladder({
      holds: ctx.holds,
      wallFeet: [
        { id: 'wf:110:1500', point: [110, 1500] },
        { id: 'wf:90:1500', point: [90, 1500] },
      ],
    });
    expect(targetAt(c2, start, 'lf', { x: 100, y: 1500 }, 50)).toBe('wf:90:1500');
  });

  it('compares distances after rounding to 0.1 px', () => {
    const holds = [
      ...ladderHolds(ids).filter((h) => h.role !== 'route'),
      routeHold(9, '3', 500, 700, 'route', 'first'),
      routeHold(10, '4', 700.02, 700, 'route', 'second'),
    ];
    const c = ladder({ holds });
    // 100 vs 100.02 px: equal at 0.1 px, so order decides.
    expect(targetAt(c, step(c, { lh: '1S', rh: '2S' }), 'rh', { x: 600, y: 700 }, 150)).toBe(
      'first',
    );
  });
});
