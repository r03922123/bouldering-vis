import type { Plan } from '../beta-moves';
import type { Edits } from './directions';

// A wall's plan for this session, in memory only (saving is `progression`, step 5), so walking
// back to the gym never throws a plan away (Nielsen: user control and freedom). Keyed by the
// wall and the referee context's key: a plan only comes back onto the exact route it was made on.

/** Walls remembered at once; the oldest is forgotten first. */
export const REMEMBERED_WALLS = 20;

const plans = new Map<string, Plan>();

export const planKey = (wallId: string, ctxKey: string) => `${wallId}\n${ctxKey}`;

export function rememberedPlan(key: string): Plan | undefined {
  return plans.get(key);
}

export function rememberPlan(key: string, plan: Plan): void {
  plans.delete(key);
  plans.set(key, plan);
  while (plans.size > REMEMBERED_WALLS) plans.delete(plans.keys().next().value!);
}

export function forgetPlan(key: string): void {
  plans.delete(key);
}

// PR #17 re-review 1: the latest plan per wall and route (its hold ids), with the context key it
// was made on, so a plan comes back onto the same route even when its context changed while the
// wall was closed or after it reopened (the wall's analysis landing late): it is then re-checked
// on the new context (carryPlan), never dropped silently.
const latest = new Map<string, { ctxKey: string; plan: Plan }>();

export const routeKey = (wallId: string, holdIds: string) => `${wallId}\n${holdIds}`;

export function latestPlan(key: string): { ctxKey: string; plan: Plan } | undefined {
  return latest.get(key);
}

export function rememberLatest(key: string, ctxKey: string, plan: Plan): void {
  latest.delete(key);
  latest.set(key, { ctxKey, plan });
  while (latest.size > REMEMBERED_WALLS) latest.delete(latest.keys().next().value!);
}

/** A restart on purpose (a route edit, a direction change): nothing to carry. */
export function forgetLatest(key: string): void {
  latest.delete(key);
}

// E1: the direction map's edits per wall and route, for the session too, so a plan made on edited
// directions comes back with them (its key includes them).
const edits = new Map<string, Edits>();

export const editsKey = (wallId: string, holdIds: readonly string[]) =>
  `${wallId}\n${holdIds.join(',')}`;

export function rememberedEdits(key: string): Edits | undefined {
  return edits.get(key);
}

export function rememberEdits(key: string, e: Edits): void {
  edits.delete(key);
  if (Object.keys(e).length) edits.set(key, e);
  while (edits.size > REMEMBERED_WALLS) edits.delete(edits.keys().next().value!);
}

// H2: the one-time notice that opening 3D downloads the depth model (once per session).
let depthNotice = true;

/** True the first time it is asked this session, then false. */
export function takeDepthNotice(): boolean {
  const first = depthNotice;
  depthNotice = false;
  return first;
}

/** Tests only. */
export function forgetPlans(): void {
  plans.clear();
  latest.clear();
  edits.clear();
  depthNotice = true;
}
