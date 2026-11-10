import { checkBeta } from './beta';
import { createStanceCache } from './cache';
import {
  betaOf,
  ladder,
  ladderHolds,
  ladderStart,
  LADDER_TOP,
  LADDER_TOP_FEET,
  sloperLadder,
  step,
} from './fixtures';
import type { RouteHold } from './types';

// Solver-backed checks are slow on a loaded machine; correctness, not speed, is tested here.
vi.setConfig({ testTimeout: 60_000 });

const ids = () => crypto.randomUUID();

describe('checkBeta: top out (AC 22)', () => {
  // Written test-first; the solver rejected the last move with the ladder's footholds 10 and 11
  // (y 1300): "Too far: left hand — move your feet up first". Recorded change: the feet stand on
  // wall footholds 50 px higher (y 1250), not on 10 and 11. No rule changed.
  it('climbs the ladder to a matched top at step 8', () => {
    const ctx = ladder({ ids, wallFeet: LADDER_TOP_FEET });
    const r = checkBeta(betaOf(ctx, ladderStart(ctx), LADDER_TOP), ctx);
    expect(r.steps.map((s) => s.verdict)).toEqual([
      'hold',
      'hold',
      'hold',
      'hold',
      'hold',
      'hold',
      'hold',
      'hold',
      'top',
    ]);
    expect(r).toMatchObject({
      toppedAt: 8,
      fallAt: null,
      rejectedAt: null,
      rejection: null,
      moves: 8,
    });
    // Only rh on the finish is not a top.
    expect(r.steps[7]!.verdict).toBe('hold');
  });

  // Amendment 2026-11-03 (B10 tip): a player with one hand on the finish was stuck, not told the
  // top needs both hands there.
  it('tells a climber with one hand on the finish to bring the other one, and only then', () => {
    const ctx = ladder({ ids, wallFeet: LADDER_TOP_FEET });
    const r = checkBeta(betaOf(ctx, ladderStart(ctx), LADDER_TOP), ctx);
    expect(r.steps[7]!.tip).toBe(
      'One hand on the finish — bring your left hand to it too to top out',
    );
    expect(r.steps.slice(0, 7).map((s) => s.tip)).toEqual(Array(7).fill(null));
    expect(r.steps[8]!.tip).toBeNull();
  });
});

describe('checkBeta: falls and rejections (AC 23)', () => {
  it('stops at the first fall', () => {
    const ctx = ladder({ ids });
    const beta = betaOf(ctx, ladderStart(ctx), [
      ['lf', '10'],
      ['rf', '11'],
      ['rh', '7F'],
      ['rh', '4'],
      ['lh', '3'],
    ]);
    const r = checkBeta(beta, ctx);
    expect(r.fallAt).toBe(3);
    expect(r.steps).toHaveLength(4);
    expect(r.steps[3]!.fail?.kind).toBe('reach');
    expect(r.moves).toBe(5);
    expect(r.toppedAt).toBeNull();
  });

  it('a start that can’t be held falls at 0', () => {
    const ctx = sloperLadder(ids, 35);
    const s = step(ctx, { lh: '1S', rh: '2S', lf: 'smear:290:1580', rf: 'smear:710:1580' });
    const r = checkBeta({ steps: [s, { ...s, rf: null }] }, ctx);
    expect(r.fallAt).toBe(0);
    expect(r.steps).toHaveLength(1);
  });

  it('a step that names a removed hold is rejected at that step', () => {
    const holds = ladderHolds(ids);
    const ctx = ladder({ holds });
    const beta = betaOf(ctx, ladderStart(ctx), [
      ['rh', '4'],
      ['lh', '3'],
    ]);
    const without = ladder({ holds: holds.filter((h) => h.label !== '3') });
    const r = checkBeta(beta, without);
    expect(r.rejectedAt).toBe(2);
    expect(r.rejection).toEqual({
      ok: false,
      reason: 'unknown-target',
      text: 'That isn’t on this route',
    });
    expect(r.steps).toHaveLength(2);
    expect(r.fallAt).toBeNull();
  });

  it('a shape-invalid start is rejected at 0', () => {
    const ctx = ladder({ ids });
    const r = checkBeta({ steps: [step(ctx, { lh: '3', rh: '4' })] }, ctx);
    expect(r).toMatchObject({ rejectedAt: 0, rejection: { reason: 'start-hands' }, steps: [] });
  });

  it('stops at a top: later steps aren’t checked', () => {
    const ctx = ladder({ ids, wallFeet: LADDER_TOP_FEET });
    const beta = betaOf(ctx, ladderStart(ctx), [...LADDER_TOP, ['rf', null]]);
    const r = checkBeta(beta, ctx);
    expect(r.toppedAt).toBe(8);
    expect(r.steps).toHaveLength(9);
    expect(r.moves).toBe(9);
  });

  it('an empty beta checks nothing', () => {
    const ctx = ladder({ ids });
    expect(checkBeta({ steps: [] }, ctx)).toEqual({
      steps: [],
      fallAt: null,
      toppedAt: null,
      rejectedAt: null,
      rejection: null,
      moves: 0,
    });
  });
});

describe('determinism (AC 31)', () => {
  it('gives deep-equal results across 100 runs, fresh and warm, and after prefixes', () => {
    const ctx = ladder({ ids, wallFeet: LADDER_TOP_FEET });
    const beta = betaOf(ctx, ladderStart(ctx), LADDER_TOP);
    const first = checkBeta(beta, ctx);
    const json = JSON.stringify(first);
    const warm = createStanceCache();
    for (let run = 0; run < 100; run++) {
      // Every tenth run starts from a fresh cache; the others share a warm one.
      const r = checkBeta(beta, ctx, run % 10 === 0 ? createStanceCache() : warm);
      expect(r).toEqual(first);
      expect(JSON.stringify(r)).toBe(json);
    }
    // Prefixes checked in reverse order first, on one cache.
    const cache = createStanceCache();
    for (let n = beta.steps.length - 1; n >= 1; n--) {
      checkBeta({ steps: beta.steps.slice(0, n) }, ctx, cache);
    }
    expect(checkBeta(beta, ctx, cache)).toEqual(first);
  }, 120_000);
});

describe('quantisation (AC 33)', () => {
  it('centroids 0.01 px apart give deep-equal results, whichever is checked first', () => {
    const holds = ladderHolds(ids);
    const nudged: RouteHold[] = holds.map((h) => ({
      ...h,
      centroid: { x: h.centroid.x + 0.01, y: h.centroid.y - 0.01 },
    }));
    const a = ladder({ holds, wallFeet: LADDER_TOP_FEET });
    const b = ladder({ holds: nudged, wallFeet: LADDER_TOP_FEET });
    expect(b.key).toBe(a.key);
    const beta = betaOf(a, ladderStart(a), LADDER_TOP);
    const aFirst = createStanceCache();
    const ra = checkBeta(beta, a, aFirst);
    const rb = checkBeta(beta, b, aFirst);
    expect(rb).toEqual(ra);
    const bFirst = createStanceCache();
    expect(checkBeta(beta, b, bFirst)).toEqual(ra);
    expect(checkBeta(beta, a, bFirst)).toEqual(ra);
  });
});
