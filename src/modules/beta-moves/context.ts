import {
  blobShapeOk,
  TOE_INSET,
  type Vec3,
  type WallAngle,
  type WallFoothold,
} from '../climber-stance';
import {
  BETA_RULES_VERSION,
  DEFAULT_RULES,
  DIR_DECIMALS,
  POINT_QUANTUM,
  type MoveContext,
  type MoveRules,
  type RouteHold,
  type WallFoot,
} from './types';

// SPEC-beta-moves › Public Interface › Route and context, and B16 (quantisation). Pure.

const PER_PX = Math.round(1 / POINT_QUANTUM);
const PER_DIR = 10 ** DIR_DECIMALS;
/** `+ 0` turns −0 into 0, so a rounded value never differs from another only by its sign. */
export const qPoint = (v: number) => Math.round(v * PER_PX) / PER_PX + 0;
export const qDir = (v: number) => Math.round(v * PER_DIR) / PER_DIR + 0;
export const qVec = (v: Vec3 | null): Vec3 | null =>
  v ? [qDir(v[0]), qDir(v[1]), qDir(v[2])] : null;

export const WALL_FOOT = 'wf:';
export const SMEAR_PREFIX = 'smear:';
export const wallFootId = (x: number, y: number) => `${WALL_FOOT}${Math.round(x)}:${Math.round(y)}`;
export const smearId = (x: number, y: number) =>
  `${SMEAR_PREFIX}${Math.round(x) + 0}:${Math.round(y) + 0}`;

/** A well-formed smear target's point, else null. */
export function parseSmear(target: string): [number, number] | null {
  const m = /^smear:(-?\d+):(-?\d+)$/.exec(target);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

export const onPhoto = (ctx: Pick<MoveContext, 'photo'>, x: number, y: number) =>
  x >= 0 && y >= 0 && x < ctx.photo.width && y < ctx.photo.height;

/**
 * climber-stance's wall footholds as beta-moves WallFoot: each blob that passes climber-stance's
 * rule 4 shape gates (the ones auto-picking uses: no sign- or volume-sized side, no strip, no solid
 * rectangle, nothing too thin; Q2, builder's call 2026-11-01), at its contact point (toe +
 * TOE_INSET·H, as contactsFor places a foot on it) rounded to whole px, with the id 'wf:<x>:<y>'
 * of that point. Ids depend only on where the foothold is, so they stay the same when the mask is
 * recomputed with new labels. Duplicate points are kept once; sorted by (y, x).
 */
export function toWallFeet(
  footholds: {
    readonly blobs: readonly Pick<WallFoothold, 'toe' | 'bbox' | 'area'>[];
  } | null,
  height: number,
): WallFoot[] {
  const seen = new Map<string, WallFoot>();
  for (const b of footholds?.blobs ?? []) {
    if (!blobShapeOk(b, height)) continue;
    const x = Math.round(b.toe.x);
    const y = Math.round(b.toe.y + TOE_INSET * height);
    const id = wallFootId(x, y);
    if (!seen.has(id)) seen.set(id, { id, point: [x, y] });
  }
  return [...seen.values()].sort((a, b) => a.point[1] - b.point[1] || a.point[0] - b.point[0]);
}

function fail(text: string): never {
  throw new RangeError(text);
}

/**
 * Throws RangeError (message in climbing words) unless: 1–2 start holds, exactly 1 finish, unique
 * ids and labels, height > 0, photo > 0, every centroid, grip point and wall foot on the photo, and
 * every wall-foot id equal to 'wf:<round x>:<round y>' of its point. A route with no 'route' holds is
 * valid.
 */
export function makeContext(input: {
  holds: readonly RouteHold[];
  wallFeet: readonly WallFoot[];
  height: number;
  wallAngleDeg: WallAngle;
  photo: { width: number; height: number };
  rules?: Partial<MoveRules>;
}): MoveContext {
  const { photo } = input;
  if (!input.holds.length) fail('Pick the route’s holds first');
  const starts = input.holds.filter((h) => h.role === 'start').length;
  const finishes = input.holds.filter((h) => h.role === 'finish').length;
  if (starts < 1 || starts > 2 || finishes !== 1) fail('Tag 1–2 start holds and 1 finish');
  if (new Set(input.holds.map((h) => h.id)).size !== input.holds.length) {
    fail('Each hold needs its own id');
  }
  if (new Set(input.holds.map((h) => h.label)).size !== input.holds.length) {
    fail('Each hold needs its own number');
  }
  if (!(input.height > 0)) fail('Set the climber’s size first');
  if (!(photo.width > 0 && photo.height > 0)) fail('Load a wall photo first');
  const frame = { photo };
  for (const h of input.holds) {
    if (!onPhoto(frame, h.centroid.x, h.centroid.y)) fail(`Hold ${h.label} is off the photo`);
    if (h.grip && !onPhoto(frame, h.grip.x, h.grip.y)) {
      fail(`Hold ${h.label}’s grip is off the photo`);
    }
  }
  const wallIds = new Set<string>();
  for (const f of input.wallFeet) {
    if (f.id !== wallFootId(f.point[0], f.point[1])) fail('A wall foothold’s id doesn’t match it');
    if (!onPhoto(frame, f.point[0], f.point[1])) fail('A wall foothold is off the photo');
    if (wallIds.has(f.id)) fail('A wall foothold is listed twice');
    wallIds.add(f.id);
  }

  const holds = [...input.holds].sort((a, b) => a.order - b.order);
  const wallFeet = [...input.wallFeet].sort(
    (a, b) => a.point[1] - b.point[1] || a.point[0] - b.point[0],
  );
  const rules: MoveRules = { ...DEFAULT_RULES, ...input.rules };
  const height = qPoint(input.height);
  const key = JSON.stringify([
    BETA_RULES_VERSION,
    height,
    input.wallAngleDeg,
    [photo.width, photo.height],
    [rules.feet, rules.dynamic],
    holds.map((h) => [
      h.label,
      h.role,
      qPoint(h.centroid.x),
      qPoint(h.centroid.y),
      h.type,
      qVec(h.dir),
      qVec(h.wallNormal),
      h.forceSource ?? null,
      // Amendment 2026-11-02 (SPEC-play-shell E1): only when set, so old keys stay valid.
      ...(h.grip ? [[qPoint(h.grip.x), qPoint(h.grip.y)]] : []),
    ]),
    wallFeet.map((f) => f.id),
  ]);
  return {
    holds,
    wallFeet,
    height,
    wallAngleDeg: input.wallAngleDeg,
    photo: { width: photo.width, height: photo.height },
    rules,
    key,
  };
}

interface Index {
  holds: Map<string, RouteHold>;
  wallFeet: Map<string, WallFoot>;
  finish: RouteHold;
  starts: RouteHold[];
}
const indexes = new WeakMap<MoveContext, Index>();

/** Lookups for a context, built once per context object. */
export function indexOf(ctx: MoveContext): Index {
  let ix = indexes.get(ctx);
  if (!ix) {
    ix = {
      holds: new Map(ctx.holds.map((h) => [h.id, h])),
      wallFeet: new Map(ctx.wallFeet.map((f) => [f.id, f])),
      finish: ctx.holds.find((h) => h.role === 'finish')!,
      starts: ctx.holds.filter((h) => h.role === 'start'),
    };
    indexes.set(ctx, ix);
  }
  return ix;
}
