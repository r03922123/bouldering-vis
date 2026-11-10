import { isHand, LIMBS, type Limb } from '../climber-stance';
import type { BetaStep, Move, MoveKind, Target } from './types';

// SPEC-beta-moves B1–B3 and › Public Interface › Moves. Pure.

/** The limbs whose target differs, in LIMBS order. */
export const changedLimbs = (prev: BetaStep, next: BetaStep): Limb[] =>
  LIMBS.filter((l) => prev[l] !== next[l]);

const other = (hand: Limb): Limb => (hand === 'lh' ? 'rh' : 'lh');

/** Pure diff; null when nothing changed. Doesn't check legality. Precedence: cut, let-go, match, then by limbs. */
export function classifyMove(prev: BetaStep, next: BetaStep): Move | null {
  const limbs = changedLimbs(prev, next);
  if (!limbs.length) return null;
  const from: Partial<Record<Limb, Target>> = {};
  const to: Partial<Record<Limb, Target>> = {};
  for (const l of limbs) {
    from[l] = prev[l];
    to[l] = next[l];
  }
  const hands = limbs.filter(isHand).length;
  let kind: MoveKind;
  if (limbs.every((l) => !isHand(l) && next[l] === null)) kind = 'cut';
  else if (limbs.length === 1 && hands === 1 && next[limbs[0]!] === null) kind = 'let-go';
  else if (
    limbs.length === 1 &&
    hands === 1 &&
    next[limbs[0]!] === next[other(limbs[0]!)] &&
    prev[other(limbs[0]!)] === next[other(limbs[0]!)]
  ) {
    kind = 'match';
  } else if (limbs.length === 1) kind = hands ? 'hand' : 'foot';
  else if (hands === limbs.length) kind = 'hands';
  else if (hands === 0) kind = 'feet';
  else kind = 'hand-foot';
  return { kind, limbs, from, to };
}
