import { isHand, LIMBS, type Limb } from '../climber-stance';
import { changedLimbs, classifyMove } from './classify';
import { indexOf, onPhoto, parseSmear, WALL_FOOT } from './context';
import {
  MAX_LIMBS_PER_MOVE,
  type BetaStep,
  type MoveContext,
  type Rejection,
  type ShapeCheck,
  type ShapeRejection,
} from './types';

// SPEC-beta-moves › Behaviour Rules › Shape: cheap (no solve), the first rule that applies.

export const SHAPE_TEXT: Readonly<Record<Rejection, string>> = {
  'no-change': 'Already there',
  'too-many-limbs': 'Move one or two limbs at a time',
  'unknown-target': 'That isn’t on this route',
  'off-photo': 'That’s off the photo',
  'hand-needs-hold': 'Hands need a hold from the route',
  'finish-hands-only': 'The finish is for hands',
  'feet-marked-only': 'Feet on marked holds only on this route',
  'hand-foot-share': 'A hand and a foot can’t share a hold',
  'start-hands': 'Start with your hands on the start holds',
  'start-locked': 'Undo back to the start to change it',
  fallen: 'You’re off the wall — Undo to try again',
  topped: 'Topped out!',
};
/**
 * `fallen` when the start itself can't be held (fallAt = 0): why, in the solver's words.
 * SPEC-play-shell › Amendment 2026-11-03 R0-3 (c): it said only "change it first", which names no
 * action; the screen showing it adds what its own controls can do.
 */
export const startFallenText = (reason: string) => `This start can’t be held: ${reason}`;

export const reject = (reason: Rejection, text = SHAPE_TEXT[reason]): ShapeRejection => ({
  ok: false,
  reason,
  text,
});

type Kind = 'hold' | 'wall-foot' | 'smear' | 'unknown';

function kindOf(target: string, ctx: MoveContext): Kind {
  const ix = indexOf(ctx);
  if (ix.holds.has(target)) return 'hold';
  if (target.startsWith(WALL_FOOT)) return ix.wallFeet.has(target) ? 'wall-foot' : 'unknown';
  return parseSmear(target) ? 'smear' : 'unknown';
}

/** Rules 3–8 on every limb of `next`, so a stale step (a removed hold) is caught too. */
function targetRule(next: BetaStep, ctx: MoveContext): Rejection | null {
  const ix = indexOf(ctx);
  const targets = LIMBS.flatMap((l) => (next[l] ? [[l, next[l]!] as [Limb, string]] : []));
  const kinds = new Map(targets.map(([l, t]) => [l, kindOf(t, ctx)]));
  if (targets.some(([l]) => kinds.get(l) === 'unknown')) return 'unknown-target';
  if (
    targets.some(([l, t]) => {
      const p = kinds.get(l) === 'smear' ? parseSmear(t)! : null;
      return p && !onPhoto(ctx, p[0], p[1]);
    })
  ) {
    return 'off-photo';
  }
  if (targets.some(([l]) => isHand(l) && kinds.get(l) !== 'hold')) return 'hand-needs-hold';
  if (targets.some(([l, t]) => !isHand(l) && t === ix.finish.id)) return 'finish-hands-only';
  if (
    ctx.rules.feet === 'marked' &&
    targets.some(([l]) => !isHand(l) && kinds.get(l) === 'wall-foot')
  ) {
    return 'feet-marked-only';
  }
  const handHolds = new Set([next.lh, next.rh].filter((t) => t !== null));
  if ([next.lf, next.rf].some((t) => t !== null && handHolds.has(t))) return 'hand-foot-share';
  return null;
}

/** The start's hands: both start holds taken, or one start hold with a split or matched partner. */
function startHandsOk(start: BetaStep, ctx: MoveContext): boolean {
  const ix = indexOf(ctx);
  const hands = [start.lh, start.rh];
  if (ix.starts.length === 2) return ix.starts.every((s) => hands.includes(s.id));
  const only = ix.starts[0]!.id;
  const i = hands.indexOf(only);
  if (i < 0) return false;
  const partner = hands[1 - i];
  return (
    partner !== null &&
    partner !== undefined &&
    (partner === only || ix.holds.get(partner)?.role === 'route')
  );
}

/** Cheap (no solve). `prev: null` checks `next` as a start stance. */
export function validateShape(prev: BetaStep | null, next: BetaStep, ctx: MoveContext): ShapeCheck {
  if (prev) {
    const n = changedLimbs(prev, next).length;
    if (n === 0) return reject('no-change');
    if (n > MAX_LIMBS_PER_MOVE) return reject('too-many-limbs');
  }
  const rule = targetRule(next, ctx);
  if (rule) return reject(rule);
  if (!prev && !startHandsOk(next, ctx)) return reject('start-hands');
  return { ok: true, move: prev ? classifyMove(prev, next) : null };
}
