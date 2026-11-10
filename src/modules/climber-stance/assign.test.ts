import type { HoldMask, HoldRole } from '../hold-segmentation';
import { autoAssign, contactsFor, defaultClimberHeight, SMEAR } from './assign';
import type { StanceHold } from './types';
import { coneFor } from './cones';
import { unit, type Vec3 } from './vec';
import { wallFootholds } from './wallFootholds';

const H = 1000;

const hold = (id: string, x: number, y: number, role: HoldRole = 'route', size = 60): HoldMask =>
  ({
    id,
    role,
    order: 0,
    centroid: { x, y },
    bbox: { x: x - size / 2, y: y - size / 2, w: size, h: size / 2 },
  }) as HoldMask;

describe('autoAssign', () => {
  it('puts the hands on two start holds, left on the left', () => {
    const a = autoAssign([hold('r', 600, 100, 'start'), hold('l', 400, 120, 'start')], H);
    expect(a).toMatchObject({ lh: 'l', rh: 'r' });
  });

  it('matches both hands on a single start hold', () => {
    const a = autoAssign([hold('s', 500, 100, 'start')], H);
    expect(a).toMatchObject({ lh: 's', rh: 's' });
  });

  // B1-03 (a real climber's video): one start hold, the left hand starts on the vertical hold
  // beside it at about the same height (a split start), not matched.
  it('splits the hands onto the nearest hold beside a single start hold', () => {
    const a = autoAssign(
      [
        hold('s', 600, 400, 'start'),
        hold('side', 130, 360), // 0.47 H left, 0.04 H higher: within reach
        hold('up', 590, 100), // 0.3 H straight up: the next move, not a start hand
        hold('fin', 700, 0, 'finish'),
      ],
      H,
    );
    expect(a).toMatchObject({ lh: 'side', rh: 's' });
  });

  it('keeps the hands matched when no hold is beside the start hold', () => {
    const a = autoAssign([hold('s', 500, 400, 'start'), hold('up', 520, 50)], H);
    expect(a).toMatchObject({ lh: 's', rh: 's' });
  });

  // Real starts (12 climbs, 5 gyms): feet a median 0.58 H below the lower hand, 0.21 H to the side.
  it('picks the pair of feet about 0.58 H below the hands, under them', () => {
    const a = autoAssign(
      [
        hold('s', 500, 100, 'start'),
        hold('near', 520, 300), // too high (less than 0.25 H below)
        hold('deep', 480, 950), // a full body length down: not a start foot
        hold('fl', 380, 670),
        hold('fr', 640, 690),
        hold('far', 1400, 680), // far to the side
        hold('fin', 500, 700, 'finish'), // the finish is never a foot
      ],
      H,
    );
    expect(a).toMatchObject({ lf: 'fl', rf: 'fr' });
  });

  it('accepts a foothold just 0.27 H below the hands (the closest real start)', () => {
    expect(autoAssign([hold('s', 500, 100, 'start'), hold('f', 560, 370)], H)).toMatchObject({
      rf: 'f',
    });
  });

  it('uses one foothold on its side and smears the other foot on the wall', () => {
    expect(autoAssign([hold('s', 500, 100, 'start'), hold('f', 560, 850)], H)).toMatchObject({
      lf: SMEAR,
      rf: 'f',
    });
  });

  it('smears both feet when no foothold was selected (routes often list hands only)', () => {
    expect(autoAssign([hold('s', 500, 100, 'start')], H)).toMatchObject({ lf: SMEAR, rf: SMEAR });
  });

  // Amendment 2026-10-31 (b), AC 23: with no candidate foothold, the wall angle picks the fallback.
  it('smears both feet on Slab and Vertical, and lets them dangle from Overhang 20°', () => {
    const route = [hold('s', 500, 100, 'start')];
    expect(autoAssign(route, H, { wallAngleDeg: -10 })).toMatchObject({ lf: SMEAR, rf: SMEAR });
    expect(autoAssign(route, H, { wallAngleDeg: 0 })).toMatchObject({ lf: SMEAR, rf: SMEAR });
    for (const wallAngleDeg of [20, 35, 45]) {
      expect(autoAssign(route, H, { wallAngleDeg })).toMatchObject({ lf: null, rf: null });
    }
  });

  it('keeps a picked foothold on an overhang and lets only the other foot dangle', () => {
    expect(
      autoAssign([hold('s', 500, 100, 'start'), hold('f', 560, 850)], H, { wallAngleDeg: 35 }),
    ).toMatchObject({ lf: null, rf: 'f' });
  });

  it('assigns nothing without a start hold', () => {
    expect(autoAssign([hold('a', 500, 100)], H)).toEqual({
      lh: null,
      rh: null,
      lf: null,
      rf: null,
    });
  });
});

describe('defaultClimberHeight', () => {
  // SPEC-climber-stance › Amendment: Default Climber Size (AC 18).
  it('is 0.26 × the photo width', () => {
    expect(defaultClimberHeight({ width: 1600, height: 1200 })).toBeCloseTo(416, 9);
    expect(defaultClimberHeight({ width: 1600, height: 2133 })).toBeCloseTo(416, 9);
  });

  it('uses a measured scale when the photo has one: 170 cm × px per cm', () => {
    expect(defaultClimberHeight({ width: 1600, height: 1200, pxPerCm: 2.5 })).toBeCloseTo(425, 9);
  });

  it('stays between 0.12 and 0.6 photo heights', () => {
    expect(defaultClimberHeight({ width: 4000, height: 600 })).toBeCloseTo(360, 9);
    expect(defaultClimberHeight({ width: 300, height: 1000 })).toBeCloseTo(120, 9);
  });
});

describe('contactsFor', () => {
  const holds = [hold('s', 500, 100, 'start'), hold('f', 520, 850)];
  const types = new Map([['s', 'jug']]);
  const forces = new Map([['s', { dir: [0, 1, 0] as [number, number, number] }]]);

  it('reads each limb’s hold centroid, effective type and force', () => {
    const c = contactsFor({ lh: null, rh: 's', lf: 'f', rf: null }, holds, types, forces, H);
    expect(c.rh).toEqual({ holdId: 's', point: [500, 100], type: 'jug', dir: [0, 1, 0] });
    expect(c.lf).toMatchObject({ holdId: 'f', type: null, dir: null });
    expect(c.lh).toBeNull();
  });

  it('turns a hold’s force into the wall frame using its local wall normal', () => {
    const n = [0, -0.6, 0.8] as [number, number, number];
    // The type rule's "down the wall" for that tilted normal.
    const down = [0, 0.8, 0.6] as [number, number, number];
    const c = contactsFor(
      { lh: null, rh: 's', lf: null, rf: null },
      holds,
      types,
      new Map([['s', { dir: down }]]),
      H,
      undefined,
      new Map([['s', n]]),
    );
    c.rh!.dir!.forEach((x, i) => expect(x).toBeCloseTo([0, 1, 0][i]!, 9));
  });

  it('spreads matched hands a little so they are two contacts', () => {
    const c = contactsFor({ lh: 's', rh: 's', lf: null, rf: null }, holds, types, forces, H);
    expect(c.lh!.point[0]).toBeCloseTo(485);
    expect(c.rh!.point[0]).toBeCloseTo(515);
  });

  it('puts a smearing foot on the wall below the hands, on its own side', () => {
    const c = contactsFor({ lh: 's', rh: 's', lf: SMEAR, rf: SMEAR }, holds, types, forces, H);
    expect(c.lf).toEqual({ holdId: SMEAR, point: [290, 680], type: 'smear', dir: null });
    expect(c.rf!.point).toEqual([710, 680]);
  });

  it('keeps a smearing foot on the photo', () => {
    const photo = { width: 520, height: 700 };
    const c = contactsFor(
      { lh: 's', rh: null, lf: SMEAR, rf: SMEAR },
      holds,
      types,
      forces,
      H,
      photo,
    );
    expect(c.lf!.point[1]).toBe(700 - 0.02 * H);
    expect(c.rf!.point[0]).toBe(520 - 0.02 * H);
  });

  it('can’t smear without a hand to place the foot from', () => {
    expect(
      contactsFor({ lh: null, rh: null, lf: SMEAR, rf: null }, holds, types, forces, H).lf,
    ).toBeNull();
  });

  // Amendment 2026-11-02 (SPEC-play-shell E1): a hold's optional grip point replaces its centroid
  // as the contact point; nothing that only reads the hold (smears, assignment) moves with it.
  describe('with a grip point', () => {
    const gripped: StanceHold[] = [
      { ...hold('s', 500, 100, 'start'), grip: { x: 470, y: 112 } },
      { ...hold('f', 520, 850), grip: { x: 540, y: 845 } },
    ];

    it('puts a hand and a picked-hold foot on the grip, not the centroid', () => {
      const c = contactsFor({ lh: null, rh: 's', lf: 'f', rf: null }, gripped, types, forces, H);
      expect(c.rh).toEqual({ holdId: 's', point: [470, 112], type: 'jug', dir: [0, 1, 0] });
      expect(c.lf!.point).toEqual([540, 845]);
    });

    it('spreads matched hands about the grip', () => {
      const c = contactsFor({ lh: 's', rh: 's', lf: null, rf: null }, gripped, types, forces, H);
      expect(c.lh!.point[0]).toBeCloseTo(455);
      expect(c.rh!.point[0]).toBeCloseTo(485);
      expect(c.lh!.point[1]).toBe(112);
    });

    it('leaves a smearing foot where the centroids put it', () => {
      const plain = contactsFor(
        { lh: 's', rh: 's', lf: SMEAR, rf: SMEAR },
        holds,
        types,
        forces,
        H,
      );
      const c = contactsFor({ lh: 's', rh: 's', lf: SMEAR, rf: SMEAR }, gripped, types, forces, H);
      expect(c.lf).toEqual(plain.lf);
      expect(c.rf).toEqual(plain.rf);
    });

    it('doesn’t change the default assignment', () => {
      const route = [
        hold('l', 400, 120, 'start'),
        hold('r', 600, 100, 'start'),
        hold('a', 420, 700),
        hold('b', 580, 700),
      ];
      const moved = route.map((h) => ({ ...h, grip: { x: h.centroid.x + 40, y: h.centroid.y } }));
      expect(autoAssign(moved, H)).toEqual(autoAssign(route, H));
    });
  });

  it('drops a limb whose hold is gone', () => {
    expect(
      contactsFor({ lh: 'gone', rh: null, lf: null, rf: null }, holds, types, forces, H).lh,
    ).toBeNull();
  });

  // Amendment 2026-10-31 (b), AC 27 (the sloper surface parts), rule 11.
  describe('on sloper and volume hands', () => {
    type Source = 'surface' | 'type' | 'user' | 'none';
    const slopers = [hold('s', 500, 100, 'start'), hold('v', 700, 100, 'start')];
    const kinds = new Map([
      ['s', 'sloper'],
      ['v', 'volume'],
    ]);
    const pull = unit([0.2, 0.6, -1]);
    const both = { lh: 's', rh: 'v', lf: null, rf: null };
    const surfaceOf = (source: Source | undefined, dir: Vec3 | null = pull) =>
      contactsFor(both, slopers, kinds, new Map([['s', { dir, source }]]), H).lh!.surface;

    it('takes the surface from the force’s source: user, measured, else assumed', () => {
      expect(surfaceOf('user')).toEqual({ normal: pull.map((x) => -x), source: 'user' });
      expect(surfaceOf('surface')).toEqual({ normal: pull.map((x) => -x), source: 'measured' });
      for (const source of ['type', 'none', undefined] as const) {
        expect(surfaceOf(source)).toEqual({ normal: unit([0, -0.6, 1]), source: 'assumed' });
      }
      expect(surfaceOf('surface', null)).toEqual({
        normal: unit([0, -0.6, 1]),
        source: 'assumed',
      });
    });

    it('gives a volume with no force entry the assumed surface', () => {
      const c = contactsFor(both, slopers, kinds, new Map(), H);
      expect(c.rh!.surface).toEqual({ normal: unit([0, -0.6, 1]), source: 'assumed' });
    });

    it('turns a measured normal into the wall frame, as it does the force', () => {
      const n: Vec3 = [0, -0.6, 0.8];
      const c = contactsFor(
        both,
        slopers,
        kinds,
        new Map([['s', { dir: pull, source: 'surface' as const }]]),
        H,
        undefined,
        new Map([['s', n]]),
      );
      c.lh!.surface!.normal.forEach((x, i) => expect(x).toBeCloseTo(-c.lh!.dir![i]!, 9));
      expect(c.lh!.dir).not.toEqual(pull);
    });

    it('gives no surface to other hands, or to a foot on a sloper', () => {
      const c = contactsFor({ lh: 's', rh: 's', lf: 'v', rf: null }, slopers, types, forces, H);
      expect(c.lh).not.toHaveProperty('surface');
      const feet = contactsFor({ lh: null, rh: null, lf: 'v', rf: 's' }, slopers, kinds, forces, H);
      expect(feet.lf).not.toHaveProperty('surface');
      expect(feet.rf).not.toHaveProperty('surface');
    });
  });

  // Amendment 2026-10-31 (b), AC 27 (the wall foothold parts).
  describe('on wall footholds', () => {
    const W = 1200;
    const IH = 1200;
    const mask = new Uint8Array(W * IH);
    for (let y = 850; y < 870; y++) for (let x = 400; x < 440; x++) mask[y * W + x] = 1;
    const footholds = wallFootholds(mask, W, IH, 'img');
    const blob = footholds.blobs[0]!;

    it('stands a blob foot on its toe, 0.005 H in, with the foothold cone', () => {
      const c = contactsFor(
        { lh: 's', rh: 's', lf: blob.id, rf: SMEAR },
        holds,
        types,
        forces,
        H,
        undefined,
        undefined,
        { footholds },
      );
      expect(c.lf).toEqual({
        holdId: blob.id,
        point: [blob.toe.x, blob.toe.y + 5],
        type: null,
        dir: null,
      });
      expect(coneFor('lf', c.lf!.type, c.lf!.dir)).toEqual(coneFor('lf', null, null));
      expect(coneFor('lf', null, null).halfAngle).toBeCloseTo(Math.PI / 4, 9);
      expect(c.rf).toMatchObject({ holdId: SMEAR });
    });

    it('drops a blob foot that isn’t in the footholds (stale or not loaded)', () => {
      const a = { lh: 's', rh: 's', lf: 'blob:9', rf: blob.id };
      const c = contactsFor(a, holds, types, forces, H, undefined, undefined, { footholds });
      expect(c.lf).toBeNull();
      expect(contactsFor(a, holds, types, forces, H).rf).toBeNull();
    });

    it('never puts a hand on a blob', () => {
      const a = { lh: blob.id, rh: 's', lf: null, rf: null };
      const c = contactsFor(a, holds, types, forces, H, undefined, undefined, { footholds });
      expect(c.lh).toBeNull();
    });
  });
});

// SPEC-beta-moves A2: both read only a hold's id, centroid and role (and a mask when it has one).
describe('plain StanceHold inputs (A2)', () => {
  const plain: StanceHold[] = [
    { id: 'a', role: 'start', centroid: { x: 400, y: 100 } },
    { id: 'b', role: 'start', centroid: { x: 600, y: 100 } },
    { id: 'f', role: 'route', centroid: { x: 380, y: 680 } },
  ];

  it('assigns and places contacts from holds without masks', () => {
    const a = autoAssign(plain, H);
    expect(a).toMatchObject({ lh: 'a', rh: 'b', lf: 'f' });
    const c = contactsFor(a, plain, new Map(), new Map(), H);
    expect(c.lh?.point).toEqual([400, 100]);
    expect(c.lf?.point).toEqual([380, 680]);
  });
});
