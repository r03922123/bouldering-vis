import type { Stance } from '../climber-stance';
import { STYLE_EFFORT, type MoveStyle } from './types';

// SPEC-beta-moves B13: "how hard your arms work", from the solver. Percents are rounded to 0.1
// before any output (B16).

export const round1 = (x: number) => Math.round(x * 10) / 10 + 0;

/** The largest hand load percent (0 when no hand is loaded), rounded to 0.1. */
export function stanceEffort(stance: Stance): number {
  return round1(Math.max(0, stance.load.lh?.percent ?? 0, stance.load.rh?.percent ?? 0));
}

/** max(new stance effort, pivot effort if the pivot holds) × the style factor, rounded to 0.1. */
export function moveEffort(stance: Stance, pivot: Stance, style: MoveStyle): number {
  const base = Math.max(stanceEffort(stance), pivot.feasible ? stanceEffort(pivot) : 0);
  return round1(base * STYLE_EFFORT[style]);
}
