import {
  applyStep,
  checkMove,
  checkStart,
  defaultStart,
  makeContext,
  newPlan,
  startFallenText,
  validateShape,
  type BetaStep,
  type MoveCheck,
  type MoveContext,
  type Plan,
  type RouteHold,
  type StanceCache,
  type Target,
  type WallFoot,
} from '../beta-moves';
import {
  isHand,
  LIMB_NAME,
  LIMBS,
  playReachText,
  playSlipText,
  playSteepText,
  type Limb,
  type WallAngle,
  type WallFootholds,
} from '../climber-stance';
import {
  DEFAULT_LOOK,
  OUTFITS,
  type HoldMarker,
  type Mood,
  type PixelClimber,
  type PixelLimb,
  type ReachGap,
} from '../pixel-kit';
import { badgeRadius } from '../hold-segmentation';
import { toPixelJoints } from './adapt';
import { isStraightDown, pullPhrase } from './directions';

// SPEC-play-shell S4, S5 and S11: the referee's context, the start and what the pixel layer draws.
// Pure: every verdict comes from beta-moves; this file only words and places what it returned.

/** What a wall's context is built from (S4). Rules are never part of it: always DEFAULT_RULES. */
export interface PlayWall {
  readonly holds: readonly RouteHold[];
  readonly wallFeet: readonly WallFoot[];
  /** Climber height, image px. */
  readonly height: number;
  readonly wallAngleDeg: WallAngle;
  readonly photo: { readonly width: number; readonly height: number };
  /** The setter's start, feet included (SPEC-launch-wall-2). Absent: defaultStart picks it. */
  readonly start?: BetaStep;
}

export type Built<T> = { ok: true; value: T } | { ok: false; error: string };

/** makeContext with DEFAULT_RULES for every level (amendment (b)); its RangeError in words. */
export function contextFor(wall: PlayWall): Built<MoveContext> {
  try {
    return {
      ok: true,
      value: makeContext({
        holds: wall.holds,
        wallFeet: wall.wallFeet,
        height: wall.height,
        wallAngleDeg: wall.wallAngleDeg,
        photo: wall.photo,
      }),
    };
  } catch (e) {
    if (e instanceof RangeError) return { ok: false, error: e.message };
    throw e;
  }
}

/**
 * newPlan at the setter's start when it is valid and holds, else at defaultStart (S5), with
 * climber-stance's own footholds when the app has them. Pass the plan's cache so its first verdict
 * reuses this check instead of solving the start twice.
 */
export function startPlan(
  ctx: MoveContext,
  footholds?: WallFootholds | null,
  setter?: BetaStep,
  cache?: StanceCache,
): Built<Plan> {
  const usable =
    setter &&
    validateShape(null, setter, ctx).ok &&
    checkStart(setter, ctx, cache).verdict !== 'fall';
  try {
    return { ok: true, value: newPlan(ctx, usable ? setter : defaultStart(ctx, footholds)) };
  } catch (e) {
    if (e instanceof RangeError) return { ok: false, error: e.message };
    throw e;
  }
}

/** The verdict of the plan's last step: checkStart for the start, else checkMove (cached). */
export function lastCheck(plan: Plan, ctx: MoveContext, cache: StanceCache): MoveCheck {
  const steps = plan.beta.steps;
  const n = steps.length;
  return n === 1
    ? checkStart(steps[0]!, ctx, cache)
    : checkMove(steps[n - 2]!, steps[n - 1]!, ctx, cache);
}

/** lastCheck, with a shape-invalid plan's RangeError in words (as startPlan), never a throw. */
export function checkLast(plan: Plan, ctx: MoveContext, cache: StanceCache): Built<MoveCheck> {
  try {
    return { ok: true, value: lastCheck(plan, ctx, cache) };
  } catch (e) {
    if (e instanceof RangeError) return { ok: false, error: e.message };
    throw e;
  }
}

/** What carryPlan made of an old plan on a new context. */
export interface Carried {
  readonly plan: Plan;
  /** Moves kept: the old plan's moves that the referee still holds on the new context, in order. */
  readonly kept: number;
  /** Moves in the old plan. */
  readonly total: number;
  /** The first move that no longer holds (or is no longer a legal shape; 0: the start), and why. */
  readonly dropped: { readonly move: number; readonly reason: string } | null;
  /** Re-review 5: the old start isn't a legal start here, so the plan is the default start. */
  readonly startReset?: true;
}

/**
 * Private PR #17 review 8: the same route's context changed under a plan (the wall's analysis landing
 * after Plan opened: hold types, forces, footholds). Rather than start again, the old plan is
 * replayed on the new context: the start, then each move while the referee still holds it (a fall
 * is never committed, S6). The moves kept are committed one by one, so Undo walks back through
 * them. Null when the old start isn't a legal start here.
 */
export function carryPlan(
  old: Plan,
  ctx: MoveContext,
  cache: StanceCache,
  /** Re-review 5: the default start's plan, for an old start that isn't legal here. */
  fallback?: Plan | null,
): Carried | null {
  const steps = old.beta.steps;
  const total = steps.length - 1;
  let plan: Plan;
  try {
    plan = newPlan(ctx, steps[0]!);
  } catch (e) {
    if (!(e instanceof RangeError)) throw e;
    // Never silently: the plan goes back to the default start, and the line says why.
    return fallback ? { plan: fallback, kept: 0, total, dropped: null, startReset: true } : null;
  }
  const start = checkStart(steps[0]!, ctx, cache);
  if (start.verdict === 'fall') {
    // The start itself no longer holds (move 0): back at it, where its banner says why (R0-3 c).
    return total
      ? { plan, kept: 0, total, dropped: { move: 0, reason: reasonText(start, ctx) ?? '' } }
      : null;
  }
  for (let i = 1; i < steps.length; i++) {
    const shape = validateShape(steps[i - 1]!, steps[i]!, ctx);
    if (!shape.ok) return { plan, kept: i - 1, total, dropped: { move: i, reason: shape.text } };
    const check = checkMove(steps[i - 1]!, steps[i]!, ctx, cache);
    if (check.verdict === 'fall') {
      return {
        plan,
        kept: i - 1,
        total,
        dropped: { move: i, reason: reasonText(check, ctx) ?? '' },
      };
    }
    const out = applyStep(plan, steps[i]!, ctx, cache);
    if ('rejected' in out) {
      return { plan, kept: i - 1, total, dropped: { move: i, reason: out.rejected.text } };
    }
    plan = out.plan;
  }
  return { plan, kept: total, total, dropped: null };
}

/** The screen's words for a carried plan (review 8): never a silent change. */
export function carriedLine(c: Carried): string {
  const head = 'The wall’s analysis finished:';
  if (c.startReset)
    return `${head} your start no longer fits this wall — it was reset to the default start`;
  if (!c.dropped) {
    return c.kept === 1
      ? `${head} your move was checked again and still holds`
      : `${head} your ${c.kept} moves were checked again and still hold`;
  }
  const back = c.kept ? `back to move ${c.kept}` : 'back at the start';
  const what = c.dropped.move ? `move ${c.dropped.move}` : 'your start';
  return `${head} ${what} no longer holds (${c.dropped.reason}), so your plan is ${back}`;
}

/** One route exactly: the context's key (which leaves hold ids out) plus the hold ids. */
export function routeId(ctx: MoveContext): string {
  return `${ctx.key}\n${ctx.holds.map((h) => h.id).join(',')}`;
}

/**
 * SPEC-play-shell › Amendment 2026-11-03 R0-4: the route's goal in words, from its finish hold's
 * label (the referee tops a move with both hands on the finish, B10): "both hands on 7F".
 */
export function goalText(ctx: MoveContext): string {
  const finish = ctx.holds.find((h) => h.role === 'finish');
  return `both hands on ${finish?.label ?? 'the finish'}`;
}

/** The Studio's own word for a stance that can be held (StancePanel). */
export const BALANCED = 'Balanced: this position can be held';
export const TOPPED = 'Topped out!';

/**
 * SPEC-play-shell › Amendment 2026-11-03 R0-3: the referee's reason in Play's words. Where
 * climber-stance's diagnosis table has a Play text (advice naming a control only the Studio has),
 * it replaces the diagnosis inside the reason (alone, or after "While your … moves:"). Else the
 * reason exactly as the referee gave it.
 */
export function reasonText(check: MoveCheck, ctx?: MoveContext): string | null {
  const d = check.fail?.diagnosis;
  const r = check.reason;
  const play = d && (ctx ? byHold(check, ctx) : null);
  const words = play ?? d?.playText;
  // Every occurrence (split/join), so the Studio's words never stay in by accident.
  // Re-review 3: an empty diagnosis text would split between every letter.
  return r && d?.text && words ? r.split(d.text).join(words) : r;
}

/**
 * Private PR #17 review 6: a steep sloper's Down advice by hold, from climber-stance's table: only when Down
 * would change the hold's pull, and saying why ("hold 4 pulls mostly into the wall, which a sloper
 * can't take"); for a pull already straight down, the slip text. Null when it doesn't apply.
 */
function byHold(check: MoveCheck, ctx: MoveContext): string | null {
  const d = check.fail?.diagnosis;
  // Private PR #17 review 7: the new stance leaves a limb that didn't move out of reach: say the move.
  const move = check.move;
  // A cramped limb (SPEC-climber-stance M2) keeps the referee's words: it reaches, just not that close.
  if (d?.kind === 'reach' && d.limb && !d.cramped && check.fail?.kind === 'stance' && move) {
    if (move.limbs.includes(d.limb)) return null;
    const moved = move.limbs
      .map((l) => {
        const t = move.to[l] ?? null;
        const name = LIMB_NAME[l].toLowerCase();
        return t === null ? `${name} off` : `${name} on ${targetLabel(ctx, t)}`;
      })
      .join(' and ');
    return playReachText(d.limb, moved);
  }
  if (d?.kind !== 'sloper-steep' || !d.limb || !d.playText?.includes('press Down')) return null;
  const hold = ctx.holds.find((h) => h.id === check.assignment[d.limb!]);
  if (!hold) return null;
  return isStraightDown(hold.dir)
    ? playSlipText(d.limb, hold.type)
    : playSteepText(d.limb, hold.type, { label: hold.label, pull: pullPhrase(hold.dir) });
}

/** The start's verdict line (S5), in the solver's words (Play's, R0-3). */
export function startVerdict(check: MoveCheck, ctx?: MoveContext): string {
  return check.verdict === 'fall' ? `Start: ${reasonText(check, ctx)}` : `Start: ${BALANCED}`;
}

/**
 * R0-3 (c): a start that can't be held, on its banner: why (beta-moves' start text with the
 * solver's diagnosis) and what this screen can do about it. A tagged route can be re-tagged; a
 * baked level can only have its directions edited.
 */
export function startBannerText(check: MoveCheck, tagged: boolean, ctx?: MoveContext): string {
  const what = tagged ? 'Tag a second start hold, or edit directions' : 'Edit directions to fix it';
  return `${startFallenText(reasonText(check, ctx) ?? '')}. ${what}`;
}

/** A target's image point: a hold's centroid, a wall foot's point, a smear's point; null if off. */
export function targetPoint(ctx: MoveContext, target: Target): { x: number; y: number } | null {
  if (target === null) return null;
  const hold = ctx.holds.find((h) => h.id === target);
  if (hold) return { x: hold.centroid.x, y: hold.centroid.y };
  const foot = ctx.wallFeet.find((f) => f.id === target);
  if (foot) return { x: foot.point[0], y: foot.point[1] };
  const m = /^smear:(-?\d+):(-?\d+)$/.exec(target);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
}

/**
 * A marker box around a point. Route holds in a baked level carry no mask, so the box is a
 * minimal one (0.05 × climber height a side, pixel-kit's frame then clamps it to 7–40 art px).
 */
export function boxAt(ctx: MoveContext, p: { x: number; y: number }): HoldMarker['bbox'] {
  const side = 0.05 * ctx.height;
  return { x: p.x - side / 2, y: p.y - side / 2, w: side, h: side };
}

/** The pixel climber in a check's stance (S11), or null when the solver gave no joints. */
export function climberFor(
  check: MoveCheck,
  ctx: MoveContext,
  mood: Mood,
  selected: PixelLimb | null,
): PixelClimber | null {
  const joints = check.stance.joints;
  if (!joints) return null;
  const a: BetaStep = check.assignment;
  const gripping = Object.fromEntries(LIMBS.map((l) => [l, isHand(l) && a[l] !== null])) as Record<
    PixelLimb,
    boolean
  >;
  return {
    joints: toPixelJoints(joints),
    heightPx: ctx.height,
    outfit: OUTFITS.starter,
    look: DEFAULT_LOOK,
    gripping,
    selected,
    mood,
  };
}

/** S11: `strain` for a deadpoint, `fail` for a fall, else `ok`. */
export function moodOf(check: MoveCheck): Mood {
  if (check.verdict === 'fall') return 'fail';
  return check.style === 'deadpoint' ? 'strain' : 'ok';
}

// ── Moves (S6, S7, S12) ────────────────────────────────────────────────────────────────────────

/** What one move attempt did: committed, previewed (a fall never enters the plan) or rejected. */
export type Attempt =
  | { readonly kind: 'commit'; readonly plan: Plan; readonly check: MoveCheck }
  | { readonly kind: 'preview'; readonly check: MoveCheck }
  | { readonly kind: 'rejected'; readonly text: string };

/**
 * One move from the plan's last step: the given limbs go to their targets. beta-moves decides
 * everything; a fall comes back as a preview with the plan unchanged (S6, user decision).
 */
export function attempt(
  plan: Plan,
  targets: Readonly<Partial<Record<Limb, Target>>>,
  ctx: MoveContext,
  cache: StanceCache,
): Attempt {
  const next: BetaStep = { ...plan.beta.steps.at(-1)!, ...targets };
  const out = applyStep(plan, next, ctx, cache);
  if ('rejected' in out) {
    // R0-3 (c): a start that can't be held says why in Play's words, as its banner does.
    const fallenStart = out.rejected.reason === 'fallen' && plan.beta.steps.length === 1;
    const text = fallenStart
      ? startFallenText(reasonText(lastCheck(plan, ctx, cache), ctx) ?? '')
      : out.rejected.text;
    return { kind: 'rejected', text };
  }
  if (out.check.verdict === 'fall') return { kind: 'preview', check: out.check };
  return { kind: 'commit', plan: out.plan, check: out.check };
}

/** A target in words (S12): a route hold's label, "Wall foothold n", "Smear" or "Let go". */
export function targetLabel(ctx: MoveContext, target: Target): string {
  if (target === null) return 'Let go';
  const hold = ctx.holds.find((h) => h.id === target);
  if (hold) return hold.label;
  const i = ctx.wallFeet.findIndex((f) => f.id === target);
  if (i >= 0) return `Wall foothold ${i + 1}`;
  return 'Smear';
}

/** "Left hand to 3", "Right hand to 2 and left foot to Wall foothold 4". */
export function movePhrase(
  ctx: MoveContext,
  targets: Readonly<Partial<Record<Limb, Target>>>,
): string {
  return LIMBS.filter((l) => l in targets)
    .map((l, i) => {
      const name = i === 0 ? LIMB_NAME[l] : LIMB_NAME[l].toLowerCase();
      const t = targets[l] ?? null;
      return t === null ? `${name} lets go` : `${name} to ${targetLabel(ctx, t)}`;
    })
    .join(' and ');
}

/** The verdict line for the plan's last step or a preview, in the referee's words (S5, S6). */
export function verdictLine(ctx: MoveContext, check: MoveCheck): string {
  if (!check.move) return startVerdict(check, ctx);
  const phrase = movePhrase(ctx, check.move.to);
  if (check.verdict === 'fall') return `${phrase}: you'd fall. ${reasonText(check, ctx)}`;
  if (check.verdict === 'top') return `${phrase}: ${TOPPED}`;
  return check.tip ? `${phrase}: holds. ${check.tip}` : `${phrase}: holds`;
}

/** The out-of-reach gap for a fall preview (S11): the limb's end joint to its target. */
export function reachGap(ctx: MoveContext, check: MoveCheck): ReachGap | null {
  const limb = check.fail?.kind === 'reach' ? check.fail.limb : undefined;
  const joints = check.stance.joints;
  if (!limb || !joints) return null;
  const to = targetPoint(ctx, check.assignment[limb]);
  if (!to) return null;
  const end = { lh: 'lHand', rh: 'rHand', lf: 'lFoot', rf: 'rFoot' } as const;
  const [x, y] = joints[end[limb]];
  return { limb, from: { x, y }, to };
}

/** The targets the DOM list offers a limb (S12): route holds by label, then wall feet, then smear. */
export function listTargets(
  ctx: MoveContext,
  limb: Limb,
  smearAt: { x: number; y: number } | null,
): { target: Target; label: string }[] {
  const out: { target: Target; label: string }[] = ctx.holds.map((h) => ({
    target: h.id,
    label: h.label,
  }));
  if (!isHand(limb)) {
    ctx.wallFeet.forEach((f, i) => out.push({ target: f.id, label: `Wall foothold ${i + 1}` }));
    if (smearAt) {
      const [x, y] = [Math.round(smearAt.x) + 0, Math.round(smearAt.y) + 0];
      out.push({ target: `smear:${x}:${y}`, label: 'Smear' });
    }
  }
  out.push({ target: null, label: 'Let go' });
  return out;
}

/** The Studio's gap between a hold's box and its badge (hold-segmentation's badgeAnchor). */
export const BADGE_GAP = 3;

type Box = { x: number; y: number; w: number; h: number };

/**
 * Each route hold's step badge on screen (CSS px): centred over the hold, above its box, or below
 * it when there's no room, with the Studio's radius. The same rule as hold-segmentation's
 * badgeAnchor (SelectionCanvas, tagged routes: the mask's box) and as drawn on a baked level
 * (boxAt). The hint layer keeps out of these circles (review finding 5).
 */
export function badgeSpots(
  ctx: MoveContext,
  view: { scale: number; tx: number; ty: number },
  boxOf: (h: RouteHold) => Box,
): { id: string; label: string; x: number; y: number; r: number }[] {
  return ctx.holds.map((h) => {
    const r = badgeRadius(h.label);
    const box = boxOf(h);
    const above = box.y * view.scale + view.ty - r - BADGE_GAP;
    const y = above >= r ? above : (box.y + box.h) * view.scale + view.ty + r + BADGE_GAP;
    return { id: h.id, label: h.label, x: h.centroid.x * view.scale + view.tx, y, r };
  });
}
