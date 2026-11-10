import { createStanceCache } from './cache';
import { checkMove, checkStart } from './check';
import { reject, startFallenText, validateShape } from './shape';
import { defaultStart } from './start';
import {
  HISTORY_LIMIT,
  type Beta,
  type BetaStep,
  type MoveCheck,
  type MoveContext,
  type Plan,
  type StanceCache,
  type StepOutcome,
} from './types';

// SPEC-beta-moves › Planning: history, B1 (Undo drops the last step) and B9 (preview first).
// `checkMove` previews a move; `applyStep` commits it, a fall included.

/** A plan at `start` (default: climber-stance's start position). RangeError if shape-invalid. */
export function newPlan(ctx: MoveContext, start: BetaStep = defaultStart(ctx)): Plan {
  const shape = validateShape(null, start, ctx);
  if (!shape.ok) throw new RangeError(shape.text);
  return { beta: { steps: [start] }, past: [], future: [] };
}

/** The verdict of the plan's last step (cached). A committed beta only ever ends at a fall or top. */
function lastCheck(beta: Beta, ctx: MoveContext, cache: StanceCache): MoveCheck {
  const steps = beta.steps;
  const n = steps.length;
  return n === 1
    ? checkStart(steps[0]!, ctx, cache)
    : checkMove(steps[n - 2]!, steps[n - 1]!, ctx, cache);
}

const pushed = (plan: Plan, beta: Beta): Plan => ({
  beta,
  past: [...plan.past, plan.beta].slice(-HISTORY_LIMIT),
  future: [],
});

/** Commits one move (B9): appended whatever its verdict, unless its shape is rejected. */
export function applyStep(
  plan: Plan,
  next: BetaStep,
  ctx: MoveContext,
  cache: StanceCache = createStanceCache(),
): StepOutcome {
  const steps = plan.beta.steps;
  const last = steps.at(-1)!;
  const status = lastCheck(plan.beta, ctx, cache);
  if (status.verdict === 'fall') {
    return {
      plan,
      rejected:
        steps.length === 1
          ? reject('fallen', startFallenText(status.reason ?? ''))
          : reject('fallen'),
    };
  }
  if (status.verdict === 'top') return { plan, rejected: reject('topped') };
  const shape = validateShape(last, next, ctx);
  if (!shape.ok) return { plan, rejected: shape };
  const check = checkMove(last, next, ctx, cache);
  return { plan: pushed(plan, { steps: [...steps, next] }), check };
}

/** Replaces the start (any number of limbs) while no move is made; undoable. */
export function editStart(
  plan: Plan,
  start: BetaStep,
  ctx: MoveContext,
  cache: StanceCache = createStanceCache(),
): StepOutcome {
  if (plan.beta.steps.length > 1) return { plan, rejected: reject('start-locked') };
  const current = plan.beta.steps[0]!;
  const same = (Object.keys(start) as (keyof BetaStep)[]).every((l) => start[l] === current[l]);
  if (same) return { plan, rejected: reject('no-change') };
  const shape = validateShape(null, start, ctx);
  if (!shape.ok) return { plan, rejected: shape };
  return { plan: pushed(plan, { steps: [start] }), check: checkStart(start, ctx, cache) };
}

export const canUndo = (plan: Plan): boolean => plan.past.length > 0;
export const canRedo = (plan: Plan): boolean => plan.future.length > 0;

export function undo(plan: Plan): Plan {
  if (!canUndo(plan)) return plan;
  return {
    beta: plan.past.at(-1)!,
    past: plan.past.slice(0, -1),
    future: [plan.beta, ...plan.future],
  };
}

export function redo(plan: Plan): Plan {
  if (!canRedo(plan)) return plan;
  return {
    beta: plan.future[0]!,
    past: [...plan.past, plan.beta].slice(-HISTORY_LIMIT),
    future: plan.future.slice(1),
  };
}
