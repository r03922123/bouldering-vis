import {
  autoAssign,
  contactsFor,
  LIMBS,
  SMEAR,
  TOE_INSET,
  WALL_FOOT_PREFIX,
  type Assignment,
  type WallFoothold,
  type WallFootholds,
} from '../climber-stance';
import { indexOf, smearId, wallFootId } from './context';
import type { BetaStep, MoveContext, Target } from './types';

// SPEC-beta-moves › defaultStart (B11, A1). Pure.

/** A stand-in blob's side (× H): inside climber-stance's foothold size gates, and not solid. */
const STAND_IN_SIDE = 0.05;

/**
 * The context's wall feet as climber-stance footholds, for autoAssign: one small blob per WallFoot,
 * its toe placed so climber-stance's contact point is the WallFoot's point. No label grid, so no
 * blob is claimed by a hand's centroid (play-shell passes the real footholds for that).
 */
function standIns(ctx: MoveContext): WallFootholds {
  const side = STAND_IN_SIDE * ctx.height;
  const blobs: WallFoothold[] = ctx.wallFeet.map((f, i) => ({
    id: `${WALL_FOOT_PREFIX}${i + 1}`,
    label: i + 1,
    area: (side * side) / 2,
    bbox: { x: f.point[0] - side / 2, y: f.point[1] - side / 2, w: side, h: side },
    centroid: { x: f.point[0], y: f.point[1] },
    toe: { x: f.point[0], y: f.point[1] - TOE_INSET * ctx.height },
  }));
  return {
    imageId: 'beta-moves',
    width: ctx.photo.width,
    height: ctx.photo.height,
    labels: new Uint16Array(0),
    blobs,
  };
}

/**
 * climber-stance's autoAssign on the route, with the wall feet (B11, A1). Each 'blob:<label>' foot
 * becomes the wf:<x>:<y> id of its contact point, and a 'wall' smear becomes smear:<x>:<y> at the
 * point contactsFor puts it, so the beta never stores 'wall'. `footholds` is climber-stance's own
 * wall-mask result when play-shell has it (its shape and claim rules then apply exactly as in
 * Studio); without it, the context's wall feet stand in.
 */
export function defaultStart(ctx: MoveContext, footholds?: WallFootholds | null): BetaStep {
  const ix = indexOf(ctx);
  const mask = ctx.rules.feet === 'any' ? (footholds ?? standIns(ctx)) : null;
  const a = autoAssign(ctx.holds, ctx.height, {
    wallAngleDeg: ctx.wallAngleDeg,
    footholds: mask,
    feetMode: ctx.rules.feet === 'any' ? 'any' : 'follow',
  });
  const blobs = new Map(mask?.blobs.map((b) => [b.id, b]));
  const out: Record<string, Target> = {};
  const smearing: Assignment = { ...a };
  for (const l of LIMBS) {
    const t = a[l];
    const b = t ? blobs.get(t) : undefined;
    if (b) {
      const id = wallFootId(b.toe.x, b.toe.y + TOE_INSET * ctx.height);
      if (ix.wallFeet.has(id)) {
        out[l] = id;
        continue;
      }
      // A foothold the context doesn't list: smear there instead (stale or unmapped footholds).
      smearing[l] = SMEAR;
      continue;
    }
    out[l] = t === SMEAR ? null : t;
  }
  const smears = contactsFor(smearing, ctx.holds, new Map(), new Map(), ctx.height, ctx.photo);
  for (const l of LIMBS) {
    if (smearing[l] !== SMEAR) continue;
    const c = smears[l];
    out[l] = c ? smearId(c.point[0], c.point[1]) : null;
  }
  return { lh: out.lh ?? null, rh: out.rh ?? null, lf: out.lf ?? null, rf: out.rf ?? null };
}
