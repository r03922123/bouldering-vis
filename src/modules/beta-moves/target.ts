import { isHand, type Limb } from '../climber-stance';
import { indexOf, onPhoto, qPoint, smearId } from './context';
import type { BetaStep, MoveContext, Target } from './types';

// SPEC-beta-moves › targetAt: the geometry for play-shell's move tray. Pure, no solve.

/**
 * The allowed target for `limb` nearest `point` (image px) within `maxDist`, given the current step:
 * hands get route holds only, never a hold a foot is on; feet get start/route holds, wall feet (rule
 * 'any'), never the finish and never a hold a hand is on (B12). A foot with nothing in range gets
 * smear:<round x>:<round y> when that point is on the photo. Otherwise undefined. Distances compared
 * after rounding to 0.1 px; ties go to holds by `order`, then wall feet by (y, x).
 */
export function targetAt(
  ctx: MoveContext,
  step: BetaStep,
  limb: Limb,
  point: { x: number; y: number },
  maxDist: number,
): Target | undefined {
  if (!onPhoto(ctx, point.x, point.y)) return undefined;
  const ix = indexOf(ctx);
  const hand = isHand(limb);
  const taken = new Set(hand ? [step.lf, step.rf] : [step.lh, step.rh]);
  const dist = (x: number, y: number) => qPoint(Math.hypot(x - point.x, y - point.y));
  let best: { id: string; d: number } | null = null;
  const offer = (id: string, x: number, y: number) => {
    const d = dist(x, y);
    // Candidates arrive in tie-break order, so only a strictly nearer one replaces the best.
    if (d <= maxDist && (!best || d < best.d)) best = { id, d };
  };
  for (const h of ctx.holds) {
    if (taken.has(h.id) || (!hand && h.id === ix.finish.id)) continue;
    offer(h.id, h.centroid.x, h.centroid.y);
  }
  if (!hand && ctx.rules.feet === 'any') {
    for (const f of ctx.wallFeet) offer(f.id, f.point[0], f.point[1]);
  }
  const found = best as { id: string } | null;
  if (found) return found.id;
  if (hand) return undefined;
  const [x, y] = [Math.round(point.x), Math.round(point.y)];
  return onPhoto(ctx, x, y) ? smearId(x, y) : undefined;
}
