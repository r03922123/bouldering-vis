import { FOOT_DROP, footCandidates, pickFeet, SMEAR_SIDE } from './anyFeet';
import { DANGLE_FROM_DEG, type ContactInput, type StanceContacts } from './stance';
import { isHand, LIMBS, type FeetMode, type Limb, type StanceHold } from './types';
import { alignToOut, scale, unit, type Vec3 } from './vec';
import { isWallFoothold, TOE_INSET, type WallFootholds } from './wallFootholds';

// SPEC-climber-stance › Default limb assignment, and S3 (default climber size).

/**
 * Hold id per limb, SMEAR (a foot on the bare wall), `blob:<label>` (a wall foothold), or null (off
 * the wall).
 */
export type Assignment = Record<Limb, string | null>;

/**
 * A foot pressed on the wall itself. Routes often list only hand holds (spray walls use "any
 * feet"), so a foot with no foothold smears instead of hanging (Check Results 2026-10-30).
 */
export const SMEAR = 'wall';

export const EMPTY_ASSIGNMENT: Assignment = { lh: null, rh: null, lf: null, rf: null };

/** Matched hands sit this far apart (× height), so they are two contacts. */
const MATCH_GAP = 0.015;
/** A smearing foot stays this far inside the photo's bottom edge (× height). */
const SMEAR_MARGIN = 0.02;

/** A start hand's partner: within this distance sideways (× H)… */
const SPLIT_REACH = 0.55;
/** …and within this height of the start hold (× H). */
const SPLIT_RISE = 0.25;

function splitPartner(holds: readonly StanceHold[], start: StanceHold, height: number) {
  let best: StanceHold | null = null;
  let bestD = Infinity;
  for (const h of holds) {
    if (h === start || h.role !== 'route') continue;
    const dx = Math.abs(h.centroid.x - start.centroid.x);
    const dy = Math.abs(h.centroid.y - start.centroid.y);
    if (dx > SPLIT_REACH * height || dy > SPLIT_RISE * height || dx < dy) continue;
    const d = Math.hypot(dx, dy);
    if (d < bestD) [best, bestD] = [h, d];
  }
  return best;
}

export interface AutoAssignOptions {
  /** S4: picks the fallback for a foot with no foothold (rule 8). Default 0. */
  wallAngleDeg?: number;
  /** The wall mask's blobs, once loaded. Default null (picked holds only). */
  footholds?: WallFootholds | null;
  /** Default 'any'. */
  feetMode?: FeetMode;
}

export function autoAssign(
  holds: readonly StanceHold[],
  height: number,
  opts: AutoAssignOptions = {},
): Assignment {
  const { wallAngleDeg = 0, footholds = null, feetMode = 'any' } = opts;
  const starts = holds
    .filter((h) => h.role === 'start')
    .sort((a, b) => a.centroid.x - b.centroid.x);
  if (!starts.length) return { ...EMPTY_ASSIGNMENT };
  // One start hold: the other hand takes the nearest hold beside it at about the same height (a
  // split start, as real climbers started the earlier sample route), else both hands match on it.
  const only = starts.length === 1 ? starts[0]! : null;
  const partner = only ? splitPartner(holds, only, height) : null;
  const pair = partner
    ? [only!, partner].sort((a, b) => a.centroid.x - b.centroid.x)
    : [starts[0]!, starts[1] ?? starts[0]!];
  const lh = pair[0]!;
  const rh = pair[1]!;

  // Amendment 2026-10-31 (b), rules 4–9: feet on picked route holds, then wall footholds.
  const candidates = footCandidates({
    holds,
    hands: { lh, rh },
    height,
    footholds,
    mode: feetMode,
  });
  const feet = pickFeet(candidates, (lh.centroid.x + rh.centroid.x) / 2);
  const fallback = wallAngleDeg >= DANGLE_FROM_DEG ? null : SMEAR;
  return { lh: lh.id, rh: rh.id, lf: feet.lf?.id ?? fallback, rf: feet.rf?.id ?? fallback };
}

/**
 * S3, revised (SPEC-climber-stance › Amendment: Default Climber Size): a 170 cm climber is about 0.26
 * of a gym zone photo's width (5 gyms, 11 climbs measured from climbers' videos; the old 14 × median
 * hold rule drew them 3.2x too big). Independent of the holds, so the figure doesn't jump as holds are
 * added.
 */
export const CLIMBER_PER_PHOTO_WIDTH = 0.26;
/** Guards for panoramas and very tall crops (× photo height). */
const MIN_PER_HEIGHT = 0.12;
const MAX_PER_HEIGHT = 0.6;

/** A climber between intermediate recreational women (~165 cm) and men (~177 cm): PMC13541946. */
export const DEFAULT_CLIMBER_CM = 170;

export function defaultClimberHeight(photo: {
  width: number;
  height: number;
  /** Measured scale (working px per cm), e.g. a sample calibrated from its videos. */
  pxPerCm?: number;
}): number {
  if (photo.pxPerCm) return DEFAULT_CLIMBER_CM * photo.pxPerCm;
  return Math.min(
    MAX_PER_HEIGHT * photo.height,
    Math.max(MIN_PER_HEIGHT * photo.height, CLIMBER_PER_PHOTO_WIDTH * photo.width),
  );
}

/**
 * The solver's input: each limb's hold centroid (its grip point when it has one), effective type
 * and force direction. `wallNormals` (hold-geometry's per-hold wall normal) turns each force into
 * the wall frame, so a depth tilt around one hold doesn't tip its cone into or out of the wall
 * (S4/S5: no true wall angle).
 */
const toWall = (dir: Vec3 | null, n: Vec3 | undefined) => (dir && n ? alignToOut(dir, n) : dir);

/** hold-geometry's Force, as far as this module reads it. */
type ForceInput = { dir: Vec3 | null; source?: 'surface' | 'type' | 'user' | 'none' };

/**
 * Rule 11, case 3: the sloper type rule's surface in the wall frame, out of the wall and up (59°
 * from up), the opposite of its pull unit(0, 0.6, −1).
 */
const ASSUMED_SLOPER_NORMAL = unit([0, -0.6, 1]);

/**
 * Amendment 2026-10-31 (b), rule 11: a sloper or volume hand's grip surface, from the source of its
 * force. The user's pull or a reliable measured surface (hold-geometry's own gate, `source`
 * 'surface') points straight into it; anything else falls back to the assumed surface.
 */
function gripSurface(f: ForceInput | undefined, dir: Vec3 | null): ContactInput['surface'] {
  if (dir && f?.source === 'user') return { normal: scale(dir, -1), source: 'user' };
  if (dir && f?.source === 'surface') return { normal: scale(dir, -1), source: 'measured' };
  return { normal: ASSUMED_SLOPER_NORMAL, source: 'assumed' };
}

export interface ContactExtras {
  /** The wall mask's blobs, for `blob:<label>` feet. */
  footholds?: WallFootholds | null;
}

export function contactsFor(
  assignment: Assignment,
  holds: readonly StanceHold[],
  types: ReadonlyMap<string, string | null>,
  /** hold-geometry's Force; `source` picks the sloper surface (rule 11). */
  forces: ReadonlyMap<string, ForceInput>,
  height: number,
  /** The photo's size, to keep smearing feet on it. */
  photo: { width: number; height: number } = { width: Infinity, height: Infinity },
  wallNormals: ReadonlyMap<string, Vec3> = new Map(),
  extras: ContactExtras = {},
): StanceContacts {
  const out: StanceContacts = {};
  const matched = assignment.lh !== null && assignment.lh === assignment.rh;
  const hands = [assignment.lh, assignment.rh].flatMap((id) => {
    const h = id ? holds.find((x) => x.id === id) : undefined;
    return h ? [h.centroid] : [];
  });
  for (const limb of LIMBS) {
    const id = assignment[limb];
    if (id === SMEAR) {
      if (!hands.length || limb[1] !== 'f') {
        out[limb] = null;
        continue;
      }
      const x = hands.reduce((s, p) => s + p.x, 0) / hands.length;
      const y = Math.max(...hands.map((p) => p.y)) + FOOT_DROP * height;
      out[limb] = {
        holdId: SMEAR,
        point: [
          Math.min(
            photo.width - SMEAR_MARGIN * height,
            Math.max(SMEAR_MARGIN * height, x + (limb === 'lf' ? -1 : 1) * SMEAR_SIDE * height),
          ),
          Math.min(y, photo.height - SMEAR_MARGIN * height),
        ],
        type: 'smear',
        dir: null,
      };
      continue;
    }
    if (isWallFoothold(id)) {
      // Rule 10: feet only; a blob that isn't in the footholds (stale or not loaded) is gone.
      const b = limb[1] === 'f' ? extras.footholds?.blobs.find((x) => x.id === id) : undefined;
      out[limb] = b
        ? { holdId: b.id, point: [b.toe.x, b.toe.y + TOE_INSET * height], type: null, dir: null }
        : null;
      continue;
    }
    const h = id ? holds.find((x) => x.id === id) : undefined;
    if (!h) {
      out[limb] = null;
      continue;
    }
    // Amendment 2026-11-02 (SPEC-play-shell E1): the grip point, when the hold has one.
    const at = h.grip ?? h.centroid;
    const shift = matched && limb === 'lh' ? -1 : matched && limb === 'rh' ? 1 : 0;
    const type = types.get(h.id) ?? null;
    const force = forces.get(h.id);
    const dir = toWall(force?.dir ?? null, wallNormals.get(h.id));
    out[limb] = {
      holdId: h.id,
      point: [at.x + shift * MATCH_GAP * height, at.y],
      type,
      dir,
      ...(isHand(limb) && (type === 'sloper' || type === 'volume')
        ? { surface: gripSurface(force, dir) }
        : {}),
    };
  }
  return out;
}
