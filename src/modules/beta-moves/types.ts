import type { Diagnosis, Limb, Stance, StanceContacts, Vec3, WallAngle } from '../climber-stance';

// SPEC-beta-moves › Public Interface. Named rules: changing them after approval is ask-first.

/** Bumped whenever a rule below changes, so an old context key never matches a new one. */
export const BETA_RULES_VERSION = 1;
/** B2: a move changes one or two limbs (hand and foot together, or cutting both feet). */
export const MAX_LIMBS_PER_MOVE = 2;
/** B6: a move keeps at least two contacts on the wall; one or none is a fall. */
export const MIN_CONTACTS_KEPT = 2;
/** B4: the pelvis may shift this far (× climber height, per axis) to reach. A game guess. */
export const HIP_SHIFT = 0.3;
/** B5: a limb at most this far (× its length) reaches statically. */
export const STATIC_REACH = 1.0;
/** B5: hands only, a deadpoint stretches 0.1 arm length further (≈ 6.6 cm at 170 cm). */
export const DEADPOINT_REACH = 1.1;
/** B13: a deadpoint counts as 15 % harder than the same stance reached statically. */
export const STYLE_EFFORT: Readonly<Record<MoveStyle, number>> = { static: 1, deadpoint: 1.15 };
/** B16: contact points are rounded to this (px) before solving and keying. */
export const POINT_QUANTUM = 0.1;
/** B16: force and normal directions are rounded to this many decimals. */
export const DIR_DECIMALS = 4;
/** B14: solves and reach results kept. */
export const CACHE_CAPACITY = 256;
/** Undo steps kept (the oldest is dropped). */
export const HISTORY_LIMIT = 200;

/** A limb's target: route hold id, 'wf:<x>:<y>' (feet), 'smear:<x>:<y>' (feet), or null (off). */
export type Target = string | null;
/** Same shape as climber-stance's Assignment, never 'wall'. */
export type BetaStep = Readonly<Record<Limb, Target>>;
/** steps[0] is the start; moves = length − 1. */
export interface Beta {
  readonly steps: readonly BetaStep[];
}

/** A foothold from the wall mask: id 'wf:<x>:<y>' of its contact point, whole px. */
export interface WallFoot {
  readonly id: string;
  readonly point: readonly [number, number];
}

export interface RouteHold {
  /** Session id (a UUID); never used to break ties. */
  readonly id: string;
  /** Selection order, 0-based; may have gaps after removals. */
  readonly order: number;
  /** Badge label from hold-segmentation badgeLabels(): rank by order + 'S'/'F'. */
  readonly label: string;
  readonly role: 'start' | 'route' | 'finish';
  /** Working-image px, on the photo. */
  readonly centroid: { readonly x: number; readonly y: number };
  /**
   * Amendment 2026-11-02 (SPEC-play-shell E1): where the hand or foot holds this hold, working-image
   * px, on the photo. When set it replaces the centroid as the contact point (hands, feet on this
   * hold, matched hands); labels, order and the default start still read the centroid.
   */
  readonly grip?: { readonly x: number; readonly y: number };
  /** Effective type (a user override wins). */
  readonly type: string | null;
  /** Effective force the hand applies. */
  readonly dir: Vec3 | null;
  /** hold-geometry ŵ, turns the force into the wall frame. */
  readonly wallNormal: Vec3 | null;
  /**
   * hold-geometry's Force.source. It picks a sloper hand's grip surface (climber-stance rule 11):
   * 'user' or 'surface' point into it, anything else (or absent) uses the assumed surface.
   */
  readonly forceSource?: 'surface' | 'type' | 'user' | 'none';
}

export type FeetRule = 'any' | 'marked';
export interface MoveRules {
  readonly feet: FeetRule;
  readonly dynamic: boolean;
}
export const DEFAULT_RULES: MoveRules = { feet: 'any', dynamic: true };

export interface MoveContext {
  /** Sorted by order. */
  readonly holds: readonly RouteHold[];
  readonly wallFeet: readonly WallFoot[];
  /** Climber height, px, quantised to 0.1. */
  readonly height: number;
  readonly wallAngleDeg: WallAngle;
  readonly photo: { readonly width: number; readonly height: number };
  readonly rules: MoveRules;
  /**
   * Fingerprint of everything above except hold ids, + BETA_RULES_VERSION. A hold's grip point is
   * appended to its entry only when set, so a route without grips keeps its earlier key.
   */
  readonly key: string;
}

export type MoveKind =
  | 'hand'
  | 'foot'
  | 'match'
  /** A hand to off. */
  | 'let-go'
  /** Every moved limb is a foot going to off. */
  | 'cut'
  | 'hands'
  | 'feet'
  | 'hand-foot';
export type MoveStyle = 'static' | 'deadpoint';

export interface Move {
  readonly kind: MoveKind;
  /** 1–2, in LIMBS order. */
  readonly limbs: readonly Limb[];
  readonly from: Readonly<Partial<Record<Limb, Target>>>;
  readonly to: Readonly<Partial<Record<Limb, Target>>>;
}

export type Rejection =
  | 'no-change'
  | 'too-many-limbs'
  | 'unknown-target'
  | 'off-photo'
  | 'hand-needs-hold'
  | 'finish-hands-only'
  | 'feet-marked-only'
  | 'hand-foot-share'
  | 'start-hands'
  | 'start-locked'
  | 'fallen'
  | 'topped';
export type ShapeCheck =
  | { readonly ok: true; readonly move: Move | null }
  | { readonly ok: false; readonly reason: Rejection; readonly text: string };
export type ShapeRejection = Extract<ShapeCheck, { ok: false }>;

export type FailKind = 'contacts' | 'reach' | 'pivot' | 'stance';
export interface Fail {
  readonly kind: FailKind;
  readonly limb?: Limb;
  /** The solver's, when it gave one. */
  readonly diagnosis: Diagnosis | null;
  /** Climbing words, always set. */
  readonly text: string;
}

export interface MoveCheck {
  /** verdict !== 'fall'. */
  readonly legal: boolean;
  /** = fail?.text */
  readonly reason: string | null;
  /** The start is never 'top'. */
  readonly verdict: 'hold' | 'fall' | 'top';
  readonly assignment: BetaStep;
  /** Null for the start. */
  readonly move: Move | null;
  /** Null for the start and for a fall before reach was decided. */
  readonly style: MoveStyle | null;
  /** Moved limbs going to a target; 3 decimals; may be Infinity. */
  readonly reach: Readonly<Partial<Record<Limb, number>>>;
  readonly contactsKept: number;
  /** Quantised points after the move (where animation plants each limb). */
  readonly contacts: StanceContacts;
  /** Kept contacts only; null for the start. */
  readonly pivot: Stance | null;
  /** After the move, always solved; on infeasible, the solver's natural pose. */
  readonly stance: Stance;
  /** stance.load[l].share, 0.1; may be negative (undercling); {} on a fall. */
  readonly loads: Readonly<Partial<Record<Limb, number>>>;
  /**
   * SPEC-climber-stance Amendment 2026-11-04, M1: stance.body.share, 0.1, when the hips rest on the
   * wall (both feet off); the limbs' loads plus this add up to 100. Null otherwise and on a fall.
   */
  readonly bodyLoad: number | null;
  /** B13; null on a fall. */
  readonly effort: number | null;
  readonly fail: Fail | null;
  /** Deadpoint: "Deadpoint: move fast and catch the hold". */
  readonly tip: string | null;
}

export interface BetaResult {
  /** steps[i] is beta step i, up to the first fall, top or rejection. */
  readonly steps: readonly MoveCheck[];
  readonly fallAt: number | null;
  readonly toppedAt: number | null;
  /** A shape-invalid step (e.g. a decoded or stale beta). */
  readonly rejectedAt: number | null;
  readonly rejection: ShapeRejection | null;
  /** = beta.steps.length − 1 */
  readonly moves: number;
}

/** Opaque: the entries are internal to this module. */
export interface StanceCache {
  readonly size: number;
  readonly hits: number;
  readonly misses: number;
}

export interface Plan {
  readonly beta: Beta;
  readonly past: readonly Beta[];
  readonly future: readonly Beta[];
}
export type StepOutcome =
  | { readonly plan: Plan; readonly check: MoveCheck }
  | { readonly plan: Plan; readonly rejected: ShapeRejection };
