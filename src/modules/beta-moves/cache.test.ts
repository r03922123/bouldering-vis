import { solveStance, type StanceContacts } from '../climber-stance';
import { checkBeta } from './beta';
import { cachedReach, cachedSolve, createStanceCache } from './cache';
import { contactsOf } from './contacts';
import { makeContext } from './context';
import { betaOf, ladder, ladderHolds, ladderStart, LADDER_TOP, LADDER_TOP_FEET } from './fixtures';
import { CACHE_CAPACITY, type RouteHold, type WallFoot } from './types';

// Solver-backed checks are slow on a loaded machine; correctness, not speed, is tested here.
vi.setConfig({ testTimeout: 60_000 });

const ids = () => crypto.randomUUID();

const jug = (x: number, y: number) => ({
  holdId: crypto.randomUUID(),
  point: [x, y] as [number, number],
  type: 'jug',
  dir: [0, 1, 0] as [number, number, number],
});

describe('the stance cache (AC 37)', () => {
  it('defaults to 256 entries', () => {
    expect(CACHE_CAPACITY).toBe(256);
    const c = createStanceCache();
    expect([c.size, c.hits, c.misses]).toEqual([0, 0, 0]);
  });

  it('holds at most `capacity` entries and evicts the least recently used', () => {
    const c = createStanceCache(2);
    const opts = { height: 1000, wallAngleDeg: 0 };
    const a: StanceContacts = { lh: jug(400, 1000), rh: jug(600, 1000) };
    const b: StanceContacts = { lh: jug(400, 900), rh: jug(600, 900) };
    const d: StanceContacts = { lh: jug(400, 800), rh: jug(600, 800) };
    cachedSolve(c, a, opts);
    cachedSolve(c, b, opts);
    cachedSolve(c, a, opts); // a is now the most recent
    cachedSolve(c, d, opts); // evicts b
    expect(c.size).toBe(2);
    expect([c.hits, c.misses]).toEqual([1, 3]);
    cachedSolve(c, a, opts);
    expect(c.hits).toBe(2);
    cachedSolve(c, b, opts);
    expect(c.misses).toBe(4);
  });

  it('gives the solver’s own answer, without the region', () => {
    const c = createStanceCache();
    const contacts: StanceContacts = { lh: jug(400, 1000), rh: jug(600, 1000) };
    const opts = { height: 1000, wallAngleDeg: 35 as const };
    expect(cachedSolve(c, contacts, opts)).toEqual(
      solveStance(contacts, { ...opts, region: false }),
    );
  });

  it('keys by the solver inputs, never by hold ids', () => {
    const c = createStanceCache();
    const opts = { height: 1000, wallAngleDeg: 0 };
    cachedSolve(c, { lh: jug(400, 1000), rh: jug(600, 1000) }, opts);
    cachedSolve(c, { lh: jug(400, 1000), rh: jug(600, 1000) }, opts); // new random ids
    expect([c.hits, c.misses]).toEqual([1, 1]);
  });

  it('stays warm when the wall angle goes to 35° and back', () => {
    const c = createStanceCache();
    const ctx = ladder({ ids });
    const contacts = contactsOf(ladderStart(ctx), ctx);
    cachedSolve(c, contacts, { height: ctx.height, wallAngleDeg: 0 });
    cachedSolve(c, contacts, { height: ctx.height, wallAngleDeg: 35 });
    const misses = c.misses;
    cachedSolve(c, contacts, { height: ctx.height, wallAngleDeg: 0 });
    expect(c.misses).toBe(misses);
  });

  // Amendment 2026-11-02 (SPEC-play-shell E1): the grip is a contact point, so it keys the cache.
  it('keys a moved grip point as a new solve, and one below the quantum as the same', () => {
    const cache = createStanceCache();
    const at = (x: number) =>
      ladder({
        holds: ladderHolds(ids).map((h) => (h.label === '2S' ? { ...h, grip: { x, y: 1000 } } : h)),
      });
    const solve = (ctx: ReturnType<typeof ladder>) =>
      cachedSolve(cache, contactsOf(ladderStart(ctx), ctx), { height: 1000, wallAngleDeg: 0 });
    const plain = ladder({ ids });
    solve(plain);
    solve(at(600));
    expect(cache).toMatchObject({ misses: 1, hits: 1 });
    solve(at(570));
    expect(cache.misses).toBe(2);
    solve(at(570.04));
    expect(cache).toMatchObject({ misses: 2, hits: 2 });
  });

  it('caches reach results too', () => {
    const c = createStanceCache();
    const opts = { height: 1000, wallAngleDeg: 0 };
    const stay: StanceContacts = { lh: jug(400, 1000) };
    const around = { pelvis: [500, 1500, 200] as [number, number, number], radius: 300 };
    const first = cachedReach(c, stay, { rh: jug(600, 700) }, opts, around);
    expect(cachedReach(c, stay, { rh: jug(600, 700) }, opts, around)).toEqual(first);
    expect([c.hits, c.misses]).toEqual([1, 1]);
    // A pelvis that differs below the quantum is the same input.
    cachedReach(c, stay, { rh: jug(600, 700) }, opts, {
      ...around,
      pelvis: [500.01, 1500, 200],
    });
    expect(c.hits).toBe(2);
  });
});

describe('ctx.key (AC 38)', () => {
  const holds = ladderHolds(ids);
  const key = (opts: Parameters<typeof ladder>[0] = {}) => ladder({ holds, ...opts }).key;
  const edit = (label: string, change: Partial<RouteHold>) =>
    holds.map((h) => (h.label === label ? { ...h, ...change } : h));
  const k0 = key();

  it.each<[string, () => string]>([
    ['height (0.1 px)', () => key({ height: 1000.1 })],
    ['wall angle', () => key({ wallAngleDeg: 35 })],
    ['rules (feet)', () => key({ rules: { feet: 'marked' } })],
    ['rules (dynamic)', () => key({ rules: { dynamic: false } })],
    ['a centroid (0.1 px)', () => key({ holds: edit('3', { centroid: { x: 400.1, y: 700 } }) })],
    ['a type', () => key({ holds: edit('3', { type: 'crimp' }) })],
    ['a dir (4 decimals)', () => key({ holds: edit('3', { dir: [0, 0.9999, 0] }) })],
    ['a wall normal', () => key({ holds: edit('3', { wallNormal: [0, 0, 1] }) })],
    ['a force source', () => key({ holds: edit('3', { forceSource: 'user' }) })],
    ['a grip point', () => key({ holds: edit('3', { grip: { x: 400, y: 700 } }) })],
    [
      'a role',
      () =>
        key({
          holds: edit('4', { role: 'start' }).map((h) =>
            h.label === '2S' ? { ...h, role: 'route' as const } : h,
          ),
        }),
    ],
    ['a label', () => key({ holds: edit('3', { label: '3b' }) })],
    [
      'the wall-foothold list',
      () => key({ wallFeet: [{ id: 'wf:1:2', point: [1, 2] }] as WallFoot[] }),
    ],
  ])('changes with %s', (_, changed) => {
    expect(changed()).not.toBe(k0);
  });

  it('changes when a grip point moves 0.1 px', () => {
    const grip = (x: number) => key({ holds: edit('3', { grip: { x, y: 700 } }) });
    expect(grip(380.1)).not.toBe(grip(380));
  });

  it('changes with the photo size', () => {
    const bigger = makeContext({
      holds,
      wallFeet: [],
      height: 1000,
      wallAngleDeg: 0,
      photo: { width: 1001, height: 2000 },
    });
    expect(bigger.key).not.toBe(k0);
  });

  it('doesn’t change when only hold ids change', () => {
    expect(ladder({ ids }).key).toBe(ladder({ ids }).key);
  });

  it('doesn’t change below the quantum', () => {
    expect(key({ height: 1000.01 })).toBe(k0);
    expect(key({ holds: edit('3', { centroid: { x: 400.01, y: 700 } }) })).toBe(k0);
    const grip = (x: number) => key({ holds: edit('3', { grip: { x, y: 700 } }) });
    expect(grip(380.01)).toBe(grip(380));
  });

  // Amendment 2026-11-02 (SPEC-play-shell E1): without a grip, the key is the one from before.
  it('is the pre-grip key exactly when no hold has a grip', () => {
    const ctx = makeContext({
      holds: [
        { ...ladderHolds()[0]!, id: ids() },
        { ...ladderHolds()[6]!, id: ids() },
      ],
      wallFeet: [{ id: 'wf:420:1250', point: [420, 1250] }],
      height: 1000,
      wallAngleDeg: 0,
      photo: { width: 1000, height: 2000 },
    });
    expect(ctx.key).toBe(
      '[1,1000,0,[1000,2000],["any",true],' +
        '[["1S","start",400,1000,"jug",[0,1,0],null,null],' +
        '["7F","finish",500,150,"jug",[0,1,0],null,null]],' +
        '["wf:420:1250"]]',
    );
  });
});

describe('the cache on a beta (AC 37)', () => {
  it('re-checks a 10-step beta with 0 misses, and stays warm across a wall-angle switch', () => {
    const ctx = ladder({ ids, wallFeet: LADDER_TOP_FEET });
    // Ten steps that don't top: the ladder climb without its last move, then a foot shuffle.
    const beta = betaOf(ctx, ladderStart(ctx), [
      ...LADDER_TOP.slice(0, 7),
      ['lf', 'smear:420:1240'],
      ['lf', 'wf:420:1250'],
    ]);
    expect(beta.steps).toHaveLength(10);
    const cache = createStanceCache();
    const first = checkBeta(beta, ctx, cache);
    expect(first.steps).toHaveLength(10);
    const misses = cache.misses;
    expect(checkBeta(beta, ctx, cache)).toEqual(first);
    expect(cache.misses).toBe(misses);
    const steep = ladder({ holds: ctx.holds, wallFeet: LADDER_TOP_FEET, wallAngleDeg: 35 });
    checkBeta(beta, steep, cache);
    const after35 = cache.misses;
    expect(checkBeta(beta, ctx, cache)).toEqual(first);
    expect(cache.misses).toBe(after35);
  });
});
