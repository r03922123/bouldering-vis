import type { FeetMode, StanceHold } from './types';
import { TOE_INSET, type WallFoothold, type WallFootholds } from './wallFootholds';

// SPEC-climber-stance › Amendment 2026-10-31 (b), rules 4–9 ("any feet"): the footholds each foot
// can start on, from the picked route holds and the wall mask's blobs, gated and scored against
// the start geometry real climbers use. Pure.

/**
 * Start-position geometry measured on 12 real starts (5 gyms; SPEC-climber-stance › Amendment
 * 2026-10-31: Split Start and Measured Foot Spacing): feet a median 0.58 H below the lower hand
 * (closest 0.27 H, deepest 1.03 H), 0.21 H to the side. The drop a foot is drawn to (× height).
 */
export const FOOT_DROP = 0.58;
/** A foot's ideal (and a smearing foot's) distance to its side of the hands (× height). */
export const SMEAR_SIDE = 0.21;

/** Rule 4 gates (× H, at the contact point). Drop below the lower hand: measured 0.27–1.03 H. */
const MIN_DROP = 0.25;
const MAX_DROP = 1.05;
/** Sideways from the hands' middle: measured |side| ≤ 0.60 H… */
const MAX_SIDE = 0.6;
/** …but the two measured feet deeper than this were within 0.21 H, and legs limit deep wide feet. */
const DEEP_DROP = 0.8;
const DEEP_MAX_SIDE = 0.3;
/** Blob bounding-box sides at least this (≈ 2 cm at 170 cm; the smallest foot chips are ~3 cm). */
const MIN_BLOB = 0.012;
/**
 * Shape gates (blobs only; game guesses, not measured): no side over this (big signs, posters)…
 * Raised from 0.25 after rule 4's check on the sample photo: B1-03's black foothold is 0.30 H tall.
 */
const MAX_BLOB = 0.4;
/** …no solid rectangle (fill at least this, both sides at least SOLID_SIDE)… */
const SOLID_FILL = 0.92;
const SOLID_SIDE = 0.06;
/** …and no strip (tape lines, edge strips). */
const MAX_ASPECT = 6;

/**
 * Rule 5's soft penalty for a foot right under a hand: within this distance (× H, ≈ 0.5 m at
 * 170 cm; the research report's reading of Naderi 2017's h_too_close, not spot-checked)…
 */
const TOO_CLOSE = 0.29;
/** …weighted this much per hand. A tuning constant (ours). */
const TOO_CLOSE_WEIGHT = 0.5;

/** Rule 6: a blob covered this much (of the smaller area) by a picked hold is that hold's. */
const OVERLAP = 0.3;
/** Each foot's menu offers at most this many blobs. */
const MAX_BLOBS = 4;

export interface FootCandidate {
  /** A picked route hold id, or `blob:<label>`. */
  id: string;
  kind: 'hold' | 'blob';
  /** Contact point, image px (hold: centroid; blob: toe + inset). */
  point: [number, number];
  /** Lower is better (rule 5). */
  cost: number;
}

export type FootCandidates = Record<'lf' | 'rf', FootCandidate[]>;

type Hands = { lh: StanceHold | null; rh: StanceHold | null };

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const byCost = (a: FootCandidate, b: FootCandidate) => a.cost - b.cost || byId(a, b);

/**
 * Rule 6: the labels of blobs a picked hold covers by OVERLAP of the smaller area (its SAM mask,
 * scanned over its bounding box), or that contain a hand's contact point. A hold without a mask
 * (or its box) uses only the point test.
 */
export function claimedBlobs(
  holds: readonly StanceHold[],
  hands: Hands,
  footholds: WallFootholds,
): Set<number> {
  const { width, height, labels } = footholds;
  const area = new Map(footholds.blobs.map((b) => [b.label, b.area]));
  const labelAt = (p: { x: number; y: number }) => {
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    return x >= 0 && y >= 0 && x < width && y < height ? labels[y * width + x]! : 0;
  };
  const handHolds = [hands.lh, hands.rh].filter((h): h is StanceHold => !!h);
  const claimed = new Set<number>();
  for (const h of new Set([...holds, ...handHolds])) {
    const isHandHold = handHolds.includes(h);
    const mask = h.mask?.length === labels.length && h.bbox ? h.mask : null;
    if (isHandHold || !mask) {
      const l = labelAt(h.centroid);
      if (l) claimed.add(l);
    }
    if (!mask || !h.bbox) continue;
    const x0 = Math.max(0, Math.floor(h.bbox.x));
    const y0 = Math.max(0, Math.floor(h.bbox.y));
    const x1 = Math.min(width, Math.ceil(h.bbox.x + h.bbox.w));
    const y1 = Math.min(height, Math.ceil(h.bbox.y + h.bbox.h));
    let own = 0;
    const shared = new Map<number, number>();
    for (let y = y0; y < y1; y++) {
      for (let x = x0, i = y * width + x0; x < x1; x++, i++) {
        if (!mask[i]) continue;
        own++;
        const l = labels[i]!;
        if (l) shared.set(l, (shared.get(l) ?? 0) + 1);
      }
    }
    for (const [l, n] of shared) {
      if (n / Math.min(own, area.get(l) ?? Infinity) >= OVERLAP) claimed.add(l);
    }
  }
  return claimed;
}

/**
 * Rule 4's size and shape gates, blobs only (picked holds are the user's tags). Exported for
 * beta-moves' wall-foot list (SPEC-beta-moves Q2), so players are offered the same blobs.
 */
export function blobShapeOk(b: Pick<WallFoothold, 'bbox' | 'area'>, H: number) {
  const { w, h } = b.bbox;
  if (Math.min(w, h) < MIN_BLOB * H || Math.max(w, h) > MAX_BLOB * H) return false;
  const solid = b.area / (w * h) >= SOLID_FILL && Math.min(w, h) >= SOLID_SIDE * H;
  return !solid && Math.max(w, h) / Math.min(w, h) <= MAX_ASPECT;
}

/**
 * Per foot: the picked route holds, then at most MAX_BLOBS wall-mask blobs, that pass rule 4's
 * gates, each group sorted by (cost, id). Blobs only in 'any' mode, with the footholds loaded.
 */
export function footCandidates(args: {
  holds: readonly StanceHold[];
  /** The hands of the current assignment (auto or the user's). */
  hands: Hands;
  height: number;
  footholds: WallFootholds | null;
  mode: FeetMode;
}): FootCandidates {
  const { holds, hands, height: H, footholds, mode } = args;
  const handPts = [hands.lh, hands.rh].flatMap((h) => (h ? [h.centroid] : []));
  if (!handPts.length) return { lf: [], rf: [] };
  const xm = handPts.reduce((s, p) => s + p.x, 0) / handPts.length;
  const yh = Math.max(...handPts.map((p) => p.y));
  const photo = footholds ?? { width: Infinity, height: Infinity };

  const passes = ([x, y]: [number, number]) => {
    const drop = y - yh;
    const side = Math.abs(x - xm);
    return (
      drop >= MIN_DROP * H &&
      drop <= MAX_DROP * H &&
      side <= (drop <= DEEP_DROP * H ? MAX_SIDE : DEEP_MAX_SIDE) * H &&
      x >= 0 &&
      y >= 0 &&
      x < photo.width &&
      y < photo.height
    );
  };
  const ideal = {
    lf: [xm - SMEAR_SIDE * H, yh + FOOT_DROP * H],
    rf: [xm + SMEAR_SIDE * H, yh + FOOT_DROP * H],
  } as const;
  const cost = ([x, y]: [number, number], foot: 'lf' | 'rf') =>
    Math.hypot(x - ideal[foot][0], y - ideal[foot][1]) / H +
    TOO_CLOSE_WEIGHT *
      handPts.reduce(
        (s, p) => s + Math.max(0, 1 - Math.hypot(x - p.x, y - p.y) / (TOO_CLOSE * H)),
        0,
      );

  const handIds = new Set([hands.lh?.id, hands.rh?.id]);
  // Rule 6: start and finish holds, and the hands' holds, are never feet.
  const holdPts: Omit<FootCandidate, 'cost'>[] = [];
  for (const h of holds) {
    if (h.role !== 'route' || handIds.has(h.id)) continue;
    const point: [number, number] = [h.centroid.x, h.centroid.y];
    if (passes(point)) holdPts.push({ id: h.id, kind: 'hold', point });
  }

  const blobPts: Omit<FootCandidate, 'cost'>[] = [];
  if (mode === 'any' && footholds) {
    const claimed = claimedBlobs(holds, hands, footholds);
    for (const b of footholds.blobs) {
      if (claimed.has(b.label) || !blobShapeOk(b, H)) continue;
      const point: [number, number] = [b.toe.x, b.toe.y + TOE_INSET * H];
      if (passes(point)) blobPts.push({ id: b.id, kind: 'blob', point });
    }
  }

  const rank = (foot: 'lf' | 'rf') => {
    const scored = (cs: Omit<FootCandidate, 'cost'>[]) =>
      cs.map((c) => ({ ...c, cost: cost(c.point, foot) })).sort(byCost);
    return [...scored(holdPts), ...scored(blobPts).slice(0, MAX_BLOBS)];
  };
  return { lf: rank('lf'), rf: rank('rf') };
}

/**
 * Rule 7: the pair of feet, ranked by (a) fewest fallback feet, (b) fewest blob feet, (c) lowest
 * summed cost, (d) ids in string order. Two real feet keep lf.x ≤ rf.x and never share a
 * candidate. A lone candidate goes to the left foot if it is left of `xm` (the hands' middle).
 * Null is a fallback foot.
 */
export function pickFeet(
  c: FootCandidates,
  xm: number,
): { lf: FootCandidate | null; rf: FootCandidate | null } {
  const ids = new Set([...c.lf, ...c.rf].map((x) => x.id));
  if (ids.size === 1) {
    const [only] = [...c.lf, ...c.rf];
    return only!.point[0] < xm
      ? { lf: c.lf[0] ?? null, rf: null }
      : { lf: null, rf: c.rf[0] ?? null };
  }
  type Key = [number, number, number, string, string];
  const keyOf = (a: FootCandidate | null, b: FootCandidate | null): Key => [
    Number(!a) + Number(!b),
    Number(a?.kind === 'blob') + Number(b?.kind === 'blob'),
    (a?.cost ?? 0) + (b?.cost ?? 0),
    a?.id ?? '',
    b?.id ?? '',
  ];
  const less = (p: Key, q: Key) => {
    for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) return p[i]! < q[i]!;
    return false;
  };
  let best: { lf: FootCandidate | null; rf: FootCandidate | null } = { lf: null, rf: null };
  let bestKey = keyOf(null, null);
  for (const a of [null, ...c.lf]) {
    for (const b of [null, ...c.rf]) {
      if (a && b && (a.id === b.id || a.point[0] > b.point[0])) continue;
      const k = keyOf(a, b);
      if (less(k, bestKey)) [best, bestKey] = [{ lf: a, rf: b }, k];
    }
  }
  return best;
}
