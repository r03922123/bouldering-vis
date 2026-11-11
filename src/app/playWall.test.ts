import levelFile from '../../tests/fixtures/synthetic-route.level.json';
import type { Force } from '../modules/hold-geometry';
import type { HoldMask } from '../modules/hold-segmentation';
import { DEFAULT_SAMPLE_ID } from '../modules/image-input';
import { LEVELS, playRouteFor, routeHoldsFrom, wallFromLevel } from './playWall';

// SPEC-play-shell S3, S4 and S9.

describe('baked levels (S9, ADR-0002)', () => {
  it("ships Wall 2's level, the only wall (SPEC-launch-wall-2)", () => {
    expect(LEVELS).toEqual({ 'wall-b': '/levels/wall-b.json' });
  });

  it('gives the referee the level’s own route holds, wall feet, height, angle and photo', () => {
    const wall = wallFromLevel(levelFile);
    expect(wall.holds).toEqual(levelFile.holds);
    expect(wall.wallFeet).toEqual(levelFile.wallFeet);
    expect(wall).toMatchObject({ height: 399.4, wallAngleDeg: 0, photo: levelFile.photo });
    // Rules are never taken from a level (amendment (b)): the wall carries none.
    expect(wall).not.toHaveProperty('rules');
    // No setter's start in this file: defaultStart picks one.
    expect(wall).not.toHaveProperty('start');
  });

  it("carries the setter's start, feet included (SPEC-launch-wall-2)", () => {
    const start = { lh: 'synthetic-1', rh: 'synthetic-1', lf: 'synthetic-2', rf: null };
    expect(wallFromLevel({ ...levelFile, start }).start).toEqual(start);
  });

  it('refuses a file that isn’t a level', () => {
    expect(() => wallFromLevel({ holds: [] })).toThrow('Not a level file');
  });
});

describe('routeHoldsFrom (S3, as the Studio feeds the solver)', () => {
  const hold = (id: string, order: number, role: HoldMask['role'], x: number): HoldMask =>
    ({ id, order, role, centroid: { x, y: 50 }, bbox: { x, y: 50, w: 1, h: 1 } }) as HoldMask;

  it('labels by order with S/F, and takes the effective type, force, source and wall normal', () => {
    const holds = [
      hold('b', 3, 'finish', 30),
      hold('a', 0, 'start', 10),
      hold('c', 1, 'route', 20),
    ];
    const forces = new Map<string, Force>([
      ['a', { dir: [0, 1, 0], source: 'user', cue: null }],
      ['c', { dir: null, source: 'none', cue: null }],
    ]);
    const out = routeHoldsFrom(
      holds,
      new Map([
        ['a', 'jug'],
        ['c', null],
      ]),
      forces,
      new Map([['a', [0, 0, 1] as [number, number, number]]]),
    );
    expect(out).toEqual([
      {
        id: 'a',
        order: 0,
        label: '1S',
        role: 'start',
        centroid: { x: 10, y: 50 },
        type: 'jug',
        dir: [0, 1, 0],
        wallNormal: [0, 0, 1],
        forceSource: 'user',
      },
      {
        id: 'c',
        order: 1,
        label: '2',
        role: 'route',
        centroid: { x: 20, y: 50 },
        type: null,
        dir: null,
        wallNormal: null,
        forceSource: 'none',
      },
      {
        id: 'b',
        order: 3,
        label: '3F',
        role: 'finish',
        centroid: { x: 30, y: 50 },
        type: null,
        dir: null,
        wallNormal: null,
      },
    ]);
  });
});

describe('playRouteFor (S14, "Play this wall")', () => {
  it('sends your own photo to My wall', () => {
    expect(playRouteFor({}, 0)).toEqual({ name: 'wall', id: 'mine' });
  });

  it('sends your route on a sample with a baked level (Wall 2) to My wall', () => {
    expect(playRouteFor({ sampleId: DEFAULT_SAMPLE_ID }, 3)).toEqual({ name: 'wall', id: 'mine' });
  });

  it('sends a sample with a baked level and no route of yours to its bay (the level)', () => {
    expect(playRouteFor({ sampleId: DEFAULT_SAMPLE_ID }, 0)).toEqual({
      name: 'wall',
      id: DEFAULT_SAMPLE_ID,
    });
  });

  it('sends a sample without a level to its own bay', () => {
    expect(playRouteFor({ sampleId: 'no-level' }, 0)).toEqual({ name: 'wall', id: 'no-level' });
    expect(playRouteFor({ sampleId: 'no-level' }, 2)).toEqual({ name: 'wall', id: 'no-level' });
  });
});
