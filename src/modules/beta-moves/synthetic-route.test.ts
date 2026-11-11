import betasFile from '../../../tests/fixtures/synthetic-route.betas.json';
import levelFile from '../../../tests/fixtures/synthetic-route.level.json';
import wallHolds from '../../../tests/fixtures/wall-landscape.holds.json';
import { defaultClimberHeight, type WallAngle } from '../climber-stance';
import { wallFootholds } from '../climber-stance/worker';
import { checkBeta } from './beta';
import { createStanceCache } from './cache';
import { makeContext, toWallFeet } from './context';
import { decodeBeta, encodeBeta } from './encode';
import { defaultStart } from './start';
import { DEADPOINT_REACH, type Beta, type MoveRules, type RouteHold, type WallFoot } from './types';

// SPEC-beta-moves › the canonical level (AC 36 in Node, AC 42–45), on the synthetic route
// (ADR-0003 (e)): seven of the synthetic wall's painted holds, with invented types and pulls. The
// betas were found by trying moves against the referee, so these tests pin what it says on them.
//
// Not ported from the earlier route's suite, because they need a real wall mask or a setter's
// session: the shape gates dropping merged wall regions and an edge strip, the route sign kept as
// a foothold, two noise blobs no gate can tell from a foothold, and the setter's corrections.
// climber-stance's anyFeet.test.ts covers each shape gate on drawn blobs.
//
// The wall feet are recomputed from the test's own drawing of the painted holds (the same ellipses
// scripts/make-synthetic-fixtures.ts paints), not from a segmentation of the photo, with the route
// holds removed as the level recorder did.

vi.setConfig({ testTimeout: 120_000 });

const level = {
  ...levelFile,
  holds: levelFile.holds as RouteHold[],
  wallFeet: levelFile.wallFeet as unknown as WallFoot[],
  wallAngleDeg: levelFile.wallAngleDeg as WallAngle,
  rules: levelFile.rules as MoveRules,
};
const ctx = makeContext(level);
const betas = betasFile.betas;
const text = (name: string) => betas.find((b) => b.name === name)!.text;
const decode = (name: string, c = ctx): Beta => {
  const beta = decodeBeta(text(name), c);
  if (!beta) throw new Error(`synthetic route: ${name} doesn't decode`);
  return beta;
};

/** The synthetic wall's painted holds, at the working scale (1600 → 1536 px), as a wall mask. */
function paintedWall() {
  const { width: w, height: h } = level.photo;
  const s = w / 1600;
  const mask = new Uint8Array(w * h);
  for (const e of wallHolds) {
    const [cx, cy, rx, ry] = [e.x * s, e.y * s, e.rx * s, e.ry * s];
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const u = (x + 0.5 - cx) / rx;
        const v = (y + 0.5 - cy) / ry;
        if (u * u + v * v <= 1) mask[y * w + x] = 1;
      }
    }
  }
  return wallFootholds(mask, w, h, 'synthetic');
}

describe('the synthetic route (AC 42)', () => {
  it('is the route: 1S … 7F by order, one start, one finish, fixed ids', () => {
    expect(level.photo).toEqual({ width: 1536, height: 1152 });
    // The app's default climber for this photo (no measured scale), to 0.1 px.
    expect(ctx.height).toBe(Math.round(defaultClimberHeight(level.photo) * 10) / 10);
    expect(ctx.wallAngleDeg).toBe(0);
    expect(ctx.rules).toEqual({ feet: 'any', dynamic: true });
    const holds = [...level.holds].sort((a, b) => a.order - b.order);
    expect(holds.map((h) => h.label)).toEqual(['1S', '2', '3', '4', '5', '6', '7F']);
    expect(holds.map((h) => h.id)).toEqual(holds.map((_, i) => `synthetic-${i + 1}`));
    expect(holds.filter((h) => h.role === 'start')).toHaveLength(1);
    expect(holds.filter((h) => h.role === 'finish')).toHaveLength(1);
  });

  it('lists wall footholds (A1), each id matching its point', () => {
    expect(level.wallFeet.length).toBeGreaterThan(0);
    for (const f of level.wallFeet) expect(f.id).toBe(`wf:${f.point[0]}:${f.point[1]}`);
  });
});

describe('the synthetic wall feet through the foothold shape gates', () => {
  const footholds = paintedWall();
  /** Rule 6's claim by the centroid: the blob under each route hold is that hold, not a foot. */
  const claimed = new Set(
    level.holds.map(
      (h) =>
        footholds.labels[Math.round(h.centroid.y) * footholds.width + Math.round(h.centroid.x)],
    ),
  );

  it('claims one painted hold per route hold', () => {
    expect(claimed.size).toBe(level.holds.length);
    expect(claimed.has(0)).toBe(false);
  });

  it('is the level’s wall-foot list: every other painted hold, through the gates', () => {
    const free = footholds.blobs.filter((b) => !claimed.has(b.label));
    expect(level.wallFeet).toEqual(toWallFeet({ blobs: free }, ctx.height));
    expect(level.wallFeet).toHaveLength(wallHolds.length - level.holds.length);
  });
});

describe('the default start (AC 43)', () => {
  const start = defaultStart(ctx);
  const check = checkBeta({ steps: [start] }, ctx).steps[0]!;

  it('holds, with numeric shares adding to 100 ± 0.2', () => {
    expect(check.verdict).toBe('hold');
    const shares = Object.values(check.loads);
    expect(shares).toHaveLength(4);
    for (const s of shares) expect(Number.isFinite(s)).toBe(true);
    expect(Math.abs(shares.reduce((a, b) => a + b, 0) - 100)).toBeLessThanOrEqual(0.2);
  });

  it('puts real weight on the hands', () => {
    expect((check.loads.lh ?? 0) + (check.loads.rh ?? 0)).toBeGreaterThan(20);
  });

  it('is the start every beta begins from', () => {
    const first = encodeBeta({ steps: [start] }, ctx);
    for (const b of betas) expect(b.text.split(';')[0]).toBe(first);
  });
});

describe('the reference beta (AC 44)', () => {
  const beta = decode('reference');
  const r = checkBeta(beta, ctx);

  it('has at most 16 moves', () => {
    expect(r.moves).toBeLessThanOrEqual(16);
  });

  it('holds on every step and tops out on its last (AC 44)', () => {
    const last = beta.steps.length - 1;
    expect(r.steps.map((s) => s.verdict)).toEqual([...Array(last).fill('hold'), 'top']);
    expect(r.steps.map((s) => s.reason)).toEqual(r.steps.map(() => null));
    expect([r.fallAt, r.rejectedAt, r.toppedAt]).toEqual([null, null, last]);
  });

  it('marks its one deadpoint, left hand 3 → 4 at move 4', () => {
    expect(r.steps.map((s) => s.style).filter((x) => x === 'deadpoint')).toHaveLength(1);
    const id = (label: string) => level.holds.find((h) => h.label === label)!.id;
    expect(r.steps[4]!.move!.limbs).toEqual(['lh']);
    expect([beta.steps[3]!.lh, beta.steps[4]!.lh]).toEqual([id('3'), id('4')]);
    expect(r.steps[4]!.style).toBe('deadpoint');
    expect(r.steps[4]!.tip).toBe('Deadpoint: move fast and catch the hold');
  });
});

describe('early-finish: the left hand goes for the finish from the start footholds', () => {
  it('falls on reach: "move your feet up first"', () => {
    const r = checkBeta(decode('early-finish'), ctx);
    expect(r.fallAt).toBe(2);
    // Out of reach even as a deadpoint, yet a reach the solver measured (not the no-pelvis Infinity).
    expect(r.steps[2]!.reach.lh).toBeGreaterThan(DEADPOINT_REACH);
    expect(Number.isFinite(r.steps[2]!.reach.lh)).toBe(true);
    expect(r.steps[2]!.fail!.kind).toBe('reach');
    expect(r.steps[2]!.fail!.text).toBe('Too far: left hand — move your feet up first');
  });
});

describe('replay (AC 36, Node)', () => {
  const jugs = makeContext({
    ...level,
    holds: level.holds.map((h) => ({
      ...h,
      type: 'jug',
      dir: [0, 1, 0] as [number, number, number],
      forceSource: 'user' as const,
    })),
  });

  it.each([
    ['the route', ctx],
    ['an all-jugs copy of the route', jugs],
  ] as const)('the reference on %s gives byte-identical JSON across 3 runs', (_, c) => {
    const beta = decode('reference', c);
    const runs = [createStanceCache(), createStanceCache(), createStanceCache()].map((cache) =>
      JSON.stringify(checkBeta(beta, c, cache)),
    );
    expect(runs[1]).toBe(runs[0]);
    expect(runs[2]).toBe(runs[0]);
  });

  it('the reference also tops out on the all-jugs copy', () => {
    const r = checkBeta(decode('reference', jugs), jugs);
    expect([r.fallAt, r.rejectedAt, r.toppedAt]).toEqual([null, null, r.moves]);
  });
});

describe('the failing betas (AC 45)', () => {
  it('straight-to-finish falls on reach: the right hand is too far', () => {
    const r = checkBeta(decode('straight-to-finish'), ctx);
    expect(r.fallAt).toBe(1);
    const fail = r.steps[1]!.fail!;
    expect([fail.kind, fail.limb]).toEqual(['reach', 'rh']);
    expect(fail.text).toBe('Too far: right hand — move your feet up first');
  });

  // SPEC-climber-stance Amendment 2026-11-04, M1, decision D1-A (user): the hips rest on the wall
  // with both feet off, so this hang holds.
  it('cut-feet holds (the hips on the wall, D1-A)', () => {
    const r = checkBeta(decode('cut-feet'), ctx);
    expect(r.steps.map((s) => s.verdict)).toEqual(['hold', 'hold']);
    expect([r.fallAt, r.rejectedAt]).toEqual([null, null]);
    expect(r.steps[1]!.stance.body).not.toBeNull();
  });

  it('three limbs at once is rejected', () => {
    const r = checkBeta(decode('three-limbs'), ctx);
    expect(r.rejectedAt).toBe(1);
    expect(r.rejection?.reason).toBe('too-many-limbs');
    expect(r.steps).toHaveLength(1);
  });
});
