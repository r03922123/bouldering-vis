import { TOE_INSET } from '../climber-stance';
import { contactsOf } from './contacts';
import { makeContext, toWallFeet } from './context';
import { LADDER_H, LADDER_PHOTO, ladder, ladderHolds, routeHold, step } from './fixtures';
import type { RouteHold } from './types';

const uuid = () => crypto.randomUUID();
const ids = () => uuid();

const base = (
  holds: readonly RouteHold[],
  extra: Partial<Parameters<typeof makeContext>[0]> = {},
) =>
  makeContext({
    holds,
    wallFeet: [],
    height: LADDER_H,
    wallAngleDeg: 0,
    photo: LADDER_PHOTO,
    ...extra,
  });

describe('makeContext (AC 5)', () => {
  const holds = ladderHolds(ids);
  const role = (h: RouteHold, r: RouteHold['role']): RouteHold => ({ ...h, role: r });

  it.each<[string, () => unknown]>([
    ['0 holds', () => base([])],
    ['0 starts', () => base(holds.map((h) => (h.role === 'start' ? role(h, 'route') : h)))],
    ['3 starts', () => base(holds.map((h) => (h.label === '3' ? role(h, 'start') : h)))],
    ['0 finishes', () => base(holds.map((h) => (h.role === 'finish' ? role(h, 'route') : h)))],
    ['2 finishes', () => base(holds.map((h) => (h.label === '6' ? role(h, 'finish') : h)))],
    ['duplicate ids', () => base(holds.map((h, i) => (i === 3 ? { ...h, id: holds[2]!.id } : h)))],
    ['duplicate labels', () => base(holds.map((h, i) => (i === 3 ? { ...h, label: '3' } : h)))],
    ['height 0', () => base(holds, { height: 0 })],
    ['photo 0', () => base(holds, { photo: { width: 0, height: 2000 } })],
    [
      'a centroid off the photo',
      () => base(holds.map((h, i) => (i === 2 ? { ...h, centroid: { x: 1200, y: 700 } } : h))),
    ],
    [
      'a grip point off the photo',
      () => base(holds.map((h, i) => (i === 2 ? { ...h, grip: { x: 400, y: -1 } } : h))),
    ],
    [
      'a wall-foot id that doesn’t match its point',
      () => base(holds, { wallFeet: [{ id: 'wf:10:20', point: [11, 20] }] }),
    ],
    [
      'a wall foot off the photo',
      () => base(holds, { wallFeet: [{ id: 'wf:-3:20', point: [-3, 20] }] }),
    ],
  ])('throws a RangeError for %s', (_, make) => {
    expect(make).toThrow(RangeError);
  });

  it('says what to tag in climbing words', () => {
    expect(() => base(holds.map((h) => (h.role === 'finish' ? role(h, 'route') : h)))).toThrow(
      'Tag 1–2 start holds and 1 finish',
    );
  });

  it('accepts a route with only 1S, 2S and 7F', () => {
    const ctx = base(holds.filter((h) => ['1S', '2S', '7F'].includes(h.label)));
    expect(ctx.holds.map((h) => h.label)).toEqual(['1S', '2S', '7F']);
  });

  it('sorts holds by order, quantises the height and fills in the default rules', () => {
    const ctx = base([...holds].reverse(), { height: 1000.04 });
    expect(ctx.holds.map((h) => h.order)).toEqual(holds.map((h) => h.order));
    expect(ctx.height).toBe(1000);
    expect(ctx.rules).toEqual({ feet: 'any', dynamic: true });
  });
});

/** A foothold-shaped blob (a 50 × 50 px or `side` px square, half full) with its toe at (x, y). */
const blob = (x: number, y: number, side = 50) => ({
  toe: { x, y },
  bbox: { x: x - side / 2, y, w: side, h: side },
  area: (side * side) / 2,
});

describe('toWallFeet', () => {
  it('maps each wall foothold to wf:<x>:<y> at its contact point, whole px', () => {
    const H = 424.3;
    const feet = toWallFeet(
      {
        blobs: [
          blob(960, 838),
          blob(1131.4, 845),
          blob(960, 838), // same point: one foothold
        ],
      },
      H,
    );
    const y = (t: number) => Math.round(t + TOE_INSET * H);
    expect(feet).toEqual([
      { id: `wf:960:${y(838)}`, point: [960, y(838)] },
      { id: `wf:1131:${y(845)}`, point: [1131, y(845)] },
    ]);
  });

  it('gives no wall feet without footholds', () => {
    expect(toWallFeet(null, 1000)).toEqual([]);
  });

  it('keeps ids stable when the mask is recomputed with new labels', () => {
    const a = toWallFeet({ blobs: [blob(10, 20, 60), blob(40, 50, 60)] }, 1000);
    const b = toWallFeet({ blobs: [blob(40, 50, 60), blob(10, 20, 60)] }, 1000);
    expect(b).toEqual(a);
  });

  // Q2 (builder's call, 2026-11-01): only blobs that pass climber-stance's rule 4 shape gates (the
  // ones auto-picking uses) are offered, so players aren't offered mask noise.
  it('drops blobs that fail the foothold shape gates', () => {
    const H = 1000;
    const ok = blob(500, 500, 60);
    const shaped = (w: number, h: number, fill = 0.5) => ({
      toe: { x: 100, y: 100 },
      bbox: { x: 80, y: 100, w, h },
      area: fill * w * h,
    });
    const at = (b: ReturnType<typeof shaped>, x: number) => ({ ...b, toe: { x, y: 100 } });
    const feet = toWallFeet(
      {
        blobs: [
          ok,
          at(shaped(450, 100), 110), // a side over 0.40 H: a sign, a volume cluster
          at(shaped(10, 80), 120), // thinner than 0.012 H
          at(shaped(400, 50), 130), // a strip (aspect over 6)
          at(shaped(100, 100, 0.95), 140), // a solid rectangle
        ],
      },
      H,
    );
    expect(feet.map((f) => f.point[0])).toEqual([500]);
  });
});

describe('contactsOf', () => {
  it('resolves route holds through climber-stance, and wall feet and smears at their own points', () => {
    const ctx = ladder({ ids, wallFeet: [{ id: 'wf:430:1590', point: [430, 1590] }] });
    const c = contactsOf(
      step(ctx, { lh: '1S', rh: '2S', lf: 'wf:430:1590', rf: 'smear:610:1600' }),
      ctx,
    );
    expect(c.lh).toMatchObject({ point: [400, 1000], type: 'jug', dir: [0, 1, 0] });
    expect(c.lf).toEqual({ holdId: 'wf:430:1590', point: [430, 1590], type: null, dir: null });
    expect(c.rf).toEqual({
      holdId: 'smear:610:1600',
      point: [610, 1600],
      type: 'smear',
      dir: null,
    });
  });

  it('quantises points to 0.1 px and directions to 4 decimals', () => {
    const holds = ladderHolds(ids).map((h) =>
      h.label === '1S'
        ? { ...h, centroid: { x: 400.0412, y: 999.96 }, dir: [0.123456, 0.987654, 0] as const }
        : h,
    ) as RouteHold[];
    const ctx = ladder({ holds });
    const c = contactsOf(step(ctx, { lh: '1S', rh: '2S' }), ctx);
    expect(c.lh!.point).toEqual([400, 1000]);
    expect(c.lh!.dir).toEqual([0.1235, 0.9877, 0]);
  });

  it('sets matched hands 0.015 H apart', () => {
    const ctx = ladder({ ids });
    const c = contactsOf(step(ctx, { lh: '1S', rh: '1S' }), ctx);
    expect(c.lh!.point).toEqual([400 - 15, 1000]);
    expect(c.rh!.point).toEqual([400 + 15, 1000]);
  });

  it('turns a hold’s force into the wall frame with its wall normal', () => {
    const tilted = ladderHolds(ids).map((h) =>
      h.label === '1S' ? { ...h, wallNormal: [0, 0, -1] as [number, number, number] } : h,
    );
    const ctx = ladder({ holds: tilted });
    const c = contactsOf(step(ctx, { lh: '1S', rh: '2S' }), ctx);
    // A normal facing away flips y and z (alignToOut).
    expect(c.lh!.dir).toEqual([0, -1, 0]);
  });

  it('gives a sloper hand its grip surface from the force source', () => {
    const slopers = ladderHolds(ids).map((h) =>
      h.label === '1S'
        ? {
            ...h,
            type: 'sloper',
            dir: [0, 1, 0] as [number, number, number],
            forceSource: 'user' as const,
          }
        : h,
    );
    const ctx = ladder({ holds: slopers });
    const c = contactsOf(step(ctx, { lh: '1S', rh: '2S' }), ctx);
    expect(c.lh!.surface).toEqual({ normal: [0, -1, 0], source: 'user' });
  });

  // Amendment 2026-11-02 (SPEC-play-shell E1): a hold's grip point is its contact point.
  describe('with a grip point', () => {
    const gripAt = (label: string, x: number, y: number) =>
      ladder({
        holds: ladderHolds(ids).map((h) => (h.label === label ? { ...h, grip: { x, y } } : h)),
      });

    it('puts a hand or a foot on the grip, quantised to 0.1 px', () => {
      const ctx = gripAt('2S', 571.04, 1006.96);
      const c = contactsOf(step(ctx, { lh: '1S', rh: '2S', lf: '2S' }), ctx);
      expect(c.rh!.point).toEqual([571, 1007]);
      expect(c.lf!.point).toEqual([571, 1007]);
      expect(c.lh!.point).toEqual([400, 1000]);
    });

    it('spreads matched hands 0.015 H about the grip', () => {
      const ctx = gripAt('1S', 430, 990);
      const c = contactsOf(step(ctx, { lh: '1S', rh: '1S' }), ctx);
      expect(c.lh!.point).toEqual([430 - 15, 990]);
      expect(c.rh!.point).toEqual([430 + 15, 990]);
    });

    it('leaves wall feet and smears at their own points', () => {
      const ctx = gripAt('1S', 430, 990);
      const c = contactsOf(step(ctx, { lh: '1S', rh: '2S', lf: 'smear:410:1600' }), ctx);
      expect(c.lf!.point).toEqual([410, 1600]);
    });

    it('keeps the holds’ order and labels', () => {
      const ctx = gripAt('3', 610, 650);
      expect(ctx.holds.map((h) => h.label)).toEqual(ladder({ ids }).holds.map((h) => h.label));
    });
  });

  it('leaves a routeHold helper usable for one-off holds', () => {
    expect(routeHold(0, '1S', 1, 2, 'start', 'x').centroid).toEqual({ x: 1, y: 2 });
  });
});
