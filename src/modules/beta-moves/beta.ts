import { createStanceCache } from './cache';
import { checkMove, checkStart } from './check';
import { validateShape } from './shape';
import type {
  Beta,
  BetaResult,
  MoveCheck,
  MoveContext,
  ShapeRejection,
  StanceCache,
} from './types';

// SPEC-beta-moves › How It Works: checkBeta. Validate shapes, check the start, then each move,
// stopping at the first fall (B9), top (B10) or shape rejection. Pure: the cache never changes a
// result (B14).

export function checkBeta(
  beta: Beta,
  ctx: MoveContext,
  cache: StanceCache = createStanceCache(),
): BetaResult {
  const steps: MoveCheck[] = [];
  let fallAt: number | null = null;
  let toppedAt: number | null = null;
  let rejectedAt: number | null = null;
  let rejection: ShapeRejection | null = null;
  for (let i = 0; i < beta.steps.length; i++) {
    const prev = i ? beta.steps[i - 1]! : null;
    const next = beta.steps[i]!;
    const shape = validateShape(prev, next, ctx);
    if (!shape.ok) {
      [rejectedAt, rejection] = [i, shape];
      break;
    }
    const check = prev ? checkMove(prev, next, ctx, cache) : checkStart(next, ctx, cache);
    steps.push(check);
    if (check.verdict === 'fall') {
      fallAt = i;
      break;
    }
    if (check.verdict === 'top') {
      toppedAt = i;
      break;
    }
  }
  return {
    steps,
    fallAt,
    toppedAt,
    rejectedAt,
    rejection,
    moves: Math.max(0, beta.steps.length - 1),
  };
}
