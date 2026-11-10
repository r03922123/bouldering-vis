import type { Limb, Vec3, WallAngle } from '../climber-stance';
import { makeContext } from './context';
import type { BetaStep, MoveContext, MoveRules, RouteHold, Target, WallFoot } from './types';

// SPEC-beta-moves › Acceptance Criteria: synthetic fixtures for the unit tests. Ids come from the
// caller (tests pass random UUIDs), so no result can lean on them.

export const LADDER_H = 1000;
export const LADDER_PHOTO = { width: 1000, height: 2000 } as const;
const DOWN: Vec3 = [0, 1, 0];

type Spec = [label: string, x: number, y: number, role: RouteHold['role'], foot?: boolean];
/** The ladder: label, point, role; the last four are footholds (edges, no direction). */
const LADDER: readonly Spec[] = [
  ['1S', 400, 1000, 'start'],
  ['2S', 600, 1000, 'start'],
  ['3', 400, 700, 'route'],
  ['4', 600, 700, 'route'],
  ['5', 400, 400, 'route'],
  ['6', 600, 400, 'route'],
  ['7F', 500, 150, 'finish'],
  ['8', 420, 1580, 'route', true],
  ['9', 580, 1580, 'route', true],
  ['10', 420, 1300, 'route', true],
  ['11', 580, 1300, 'route', true],
];

export type IdOf = (order: number) => string;
const plainIds: IdOf = (i) => `hold-${i}`;

export function routeHold(
  order: number,
  label: string,
  x: number,
  y: number,
  role: RouteHold['role'],
  id: string,
  type: string | null = 'jug',
  dir: Vec3 | null = DOWN,
): RouteHold {
  return { id, order, label, role, centroid: { x, y }, type, dir, wallNormal: null };
}

export function ladderHolds(ids: IdOf = plainIds): RouteHold[] {
  return LADDER.map(([label, x, y, role, foot], i) =>
    foot
      ? routeHold(i, label, x, y, role, ids(i), 'edge', null)
      : routeHold(i, label, x, y, role, ids(i)),
  );
}

export function ladder(
  opts: {
    ids?: IdOf;
    wallAngleDeg?: WallAngle;
    rules?: Partial<MoveRules>;
    wallFeet?: readonly WallFoot[];
    holds?: readonly RouteHold[];
    height?: number;
  } = {},
): MoveContext {
  return makeContext({
    holds: opts.holds ?? ladderHolds(opts.ids),
    wallFeet: opts.wallFeet ?? [],
    height: opts.height ?? LADDER_H,
    wallAngleDeg: opts.wallAngleDeg ?? 0,
    photo: LADDER_PHOTO,
    rules: opts.rules,
  });
}

/** A step written by hold labels ('1S'); wf:, smear: and null pass through. */
export function step(ctx: MoveContext, labels: Partial<Record<Limb, string | null>>): BetaStep {
  const id = (t: string | null | undefined): Target => {
    if (t == null) return null;
    if (t.startsWith('wf:') || t.startsWith('smear:')) return t;
    const h = ctx.holds.find((x) => x.label === t);
    if (!h) throw new Error(`fixtures: no hold labelled ${t}`);
    return h.id;
  };
  return { lh: id(labels.lh), rh: id(labels.rh), lf: id(labels.lf), rf: id(labels.rf) };
}

/** The ladder start: hands on 1S and 2S, feet on 8 and 9. */
export const ladderStart = (ctx: MoveContext) =>
  step(ctx, { lh: '1S', rh: '2S', lf: '8', rf: '9' });

/** A step with some limbs changed. */
export const moveTo = (prev: BetaStep, change: Partial<Record<Limb, Target>>): BetaStep => ({
  ...prev,
  ...change,
});

const SLOPER_PULL: Vec3 = [0, 0.6, -1];

/**
 * AC 11, the barn-door set: Overhang 35°, lh on a sloper at (400, 1000), lf smearing under it, rh
 * on a jug at (600, 1000), rf off. Hold '3' is a jug at (600, 800).
 */
export function barnDoor(ids: IdOf = plainIds, rules?: Partial<MoveRules>) {
  const ctx = makeContext({
    holds: [
      routeHold(0, '1S', 400, 1000, 'start', ids(0), 'sloper', SLOPER_PULL),
      routeHold(1, '2S', 600, 1000, 'start', ids(1)),
      routeHold(2, '3', 600, 800, 'route', ids(2)),
      routeHold(3, '4F', 500, 150, 'finish', ids(3)),
    ],
    wallFeet: [],
    height: LADDER_H,
    wallAngleDeg: 35,
    photo: LADDER_PHOTO,
    rules,
  });
  return { ctx, start: step(ctx, { lh: '1S', rh: '2S', lf: 'smear:400:1580', rf: null }) };
}

/**
 * The ladder with its start holds re-typed as slopers pulled (0, 0.6, −1), plus a high foothold
 * '12' at (420, 1100). AC 19 (on Overhang 35°, feet smearing) and the Task 4 foot-pivot fixture.
 */
export function sloperLadder(ids: IdOf = plainIds, wallAngleDeg: WallAngle = 0) {
  const holds = ladderHolds(ids).map((h) =>
    h.role === 'start' ? { ...h, type: 'sloper', dir: SLOPER_PULL } : h,
  );
  holds.push(routeHold(holds.length, '12', 420, 1100, 'route', ids(holds.length), 'edge', null));
  return ladder({ holds, wallAngleDeg });
}

/** A beta from moves written by label: [limb, label or target or null]. */
export function betaOf(
  ctx: MoveContext,
  start: BetaStep,
  moves: readonly [Limb, string | null][],
): { steps: BetaStep[] } {
  const steps = [start];
  for (const [limb, t] of moves) {
    steps.push(moveTo(steps.at(-1)!, { [limb]: step(ctx, { [limb]: t })[limb] }));
  }
  return { steps };
}

/**
 * AC 22, the ladder climbed to a matched top. The ladder's footholds 10 and 11 (y 1300) leave the
 * last move out of reach (no pelvis keeps rh on 7F and both feet on), so the feet go 50 px higher,
 * on wall footholds at y 1250 (recorded in beta.test.ts).
 */
export const LADDER_TOP_FEET: readonly WallFoot[] = [
  { id: 'wf:420:1250', point: [420, 1250] },
  { id: 'wf:580:1250', point: [580, 1250] },
];
export const LADDER_TOP: readonly [Limb, string | null][] = [
  ['lf', 'wf:420:1250'],
  ['rf', 'wf:580:1250'],
  ['rh', '4'],
  ['lh', '3'],
  ['rh', '6'],
  ['lh', '5'],
  ['rh', '7F'],
  ['lh', '7F'],
];
