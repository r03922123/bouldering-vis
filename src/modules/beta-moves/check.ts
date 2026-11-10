import {
  isHand,
  LIMB_NAME,
  LIMBS,
  type Limb,
  type Stance,
  type StanceContacts,
} from '../climber-stance';
import { cachedReach, cachedSolve, createStanceCache } from './cache';
import { contactsOf } from './contacts';
import { indexOf } from './context';
import { moveEffort, round1, stanceEffort } from './effort';
import { validateShape } from './shape';
import { styleFor } from './style';
import {
  HIP_SHIFT,
  MIN_CONTACTS_KEPT,
  type BetaStep,
  type Fail,
  type Move,
  type MoveCheck,
  type MoveContext,
  type MoveStyle,
  type StanceCache,
} from './types';

// SPEC-beta-moves › Behaviour Rules › Checks, in order: contacts, reach, pivot, new stance, top.

export const TEXT = {
  contacts: 'Keep at least two points on the wall',
  cutLoose: 'Your feet would cut loose — find a foothold',
  oneHand: 'Keep one hand on while you move',
  deadpoint: 'Deadpoint: move fast and catch the hold',
} as const;

/** Amendment 2026-11-03 (B10 tip): one hand on the finish, the other not yet. */
export const finishTip = (other: 'lh' | 'rh') =>
  `One hand on the finish — bring your ${lower(other)} to it too to top out`;

function tipOf(next: BetaStep, finish: string, deadpoint: boolean): string | null {
  const one = (next.lh === finish) !== (next.rh === finish);
  const match = one ? finishTip(next.lh === finish ? 'rh' : 'lh') : null;
  if (deadpoint && match) return `${TEXT.deadpoint}. ${match}`;
  return deadpoint ? TEXT.deadpoint : match;
}

const lower = (l: Limb) => LIMB_NAME[l].toLowerCase();

function tooFar(limb: Limb, from: StanceContacts[Limb], to: StanceContacts[Limb]): string {
  if (!isHand(limb)) return `Too far: ${lower(limb)} — try a closer foothold`;
  const above = from && to && to.point[1] < from.point[1];
  return `Too far: ${lower(limb)} — ${above ? 'move your feet up first' : 'try a closer hold'}`;
}

/** SPEC-climber-stance Amendment 2026-11-04, M2 rule 3: a move blocked by a joint's range. */
export const tooCramped = (limb: Limb) => `Too cramped: ${lower(limb)} — move your hips away first`;

/** M2 rule 3 (PR #18 review 2): a foot above the hip's range. */
export const tooHigh = (limb: Limb) => `Too high: ${lower(limb)} — try a lower foothold`;

/** "While your left foot moves: …", "While your right hand and left foot move: …". */
const whileMoving = (limbs: readonly Limb[], text: string) =>
  `While your ${limbs.map(lower).join(' and ')} ${limbs.length > 1 ? 'move' : 'moves'}: ${text}`;

const pick = (contacts: StanceContacts, limbs: readonly Limb[]): StanceContacts =>
  Object.fromEntries(limbs.flatMap((l) => (contacts[l] ? [[l, contacts[l]]] : [])));

function loadsOf(stance: Stance): Partial<Record<Limb, number>> {
  const out: Partial<Record<Limb, number>> = {};
  for (const l of LIMBS) {
    const v = stance.load[l];
    if (v) out[l] = round1(v.share);
  }
  return out;
}

interface Verdict {
  move: Move | null;
  style: MoveStyle | null;
  reach: Partial<Record<Limb, number>>;
  contactsKept: number;
  pivot: Stance | null;
  fail: Fail | null;
}

function result(
  next: BetaStep,
  ctx: MoveContext,
  contacts: StanceContacts,
  stance: Stance,
  v: Verdict,
): MoveCheck {
  let fail = v.fail;
  if (!fail && !stance.feasible) {
    fail = { kind: 'stance', diagnosis: stance.diagnosis, text: stance.diagnosis?.text ?? '' };
  }
  const finish = indexOf(ctx).finish.id;
  const verdict = fail
    ? 'fall'
    : v.move && next.lh === finish && next.rh === finish
      ? 'top'
      : 'hold';
  const legal = verdict !== 'fall';
  const effort = !legal
    ? null
    : v.pivot && v.style
      ? moveEffort(stance, v.pivot, v.style)
      : stanceEffort(stance);
  return {
    legal,
    reason: fail?.text ?? null,
    verdict,
    assignment: next,
    move: v.move,
    style: v.style,
    reach: v.reach,
    contactsKept: v.contactsKept,
    contacts,
    pivot: v.pivot,
    stance,
    loads: legal ? loadsOf(stance) : {},
    bodyLoad: legal && stance.body ? round1(stance.body.share) : null,
    effort,
    fail,
    tip: legal ? tipOf(next, finish, v.style === 'deadpoint') : null,
  };
}

const solveOpts = (ctx: MoveContext) => ({ height: ctx.height, wallAngleDeg: ctx.wallAngleDeg });

/** The start through the start shape rules, then rule 4. RangeError if shape-invalid. */
export function checkStart(
  start: BetaStep,
  ctx: MoveContext,
  cache: StanceCache = createStanceCache(),
): MoveCheck {
  const shape = validateShape(null, start, ctx);
  if (!shape.ok) throw new RangeError(shape.text);
  const contacts = contactsOf(start, ctx);
  const stance = cachedSolve(cache, contacts, solveOpts(ctx));
  return result(start, ctx, contacts, stance, {
    move: null,
    style: null,
    reach: {},
    contactsKept: Object.keys(contacts).length,
    pivot: null,
    fail: null,
  });
}

/** One move (precondition: validateShape passed; otherwise RangeError). Pure. */
export function checkMove(
  prev: BetaStep,
  next: BetaStep,
  ctx: MoveContext,
  cache: StanceCache = createStanceCache(),
): MoveCheck {
  const shape = validateShape(prev, next, ctx);
  if (!shape.ok) throw new RangeError(shape.text);
  const move = shape.move!;
  const opts = solveOpts(ctx);
  const before = contactsOf(prev, ctx);
  const contacts = contactsOf(next, ctx);
  const keptLimbs = LIMBS.filter((l) => prev[l] !== null && prev[l] === next[l] && before[l]);
  const kept = pick(before, keptLimbs);
  const going = move.limbs.filter((l) => next[l] !== null);
  // Both are always solved (cached), so animation and scoring always have them.
  const pivot = cachedSolve(cache, kept, opts);
  const stance = cachedSolve(cache, contacts, opts);
  const v: Verdict = {
    move,
    style: null,
    reach: {},
    contactsKept: keptLimbs.length,
    pivot,
    fail: null,
  };
  const done = () => result(next, ctx, contacts, stance, v);

  // 1. Contacts (B6).
  if (keptLimbs.length < MIN_CONTACTS_KEPT) {
    v.fail = { kind: 'contacts', diagnosis: null, text: TEXT.contacts };
    return done();
  }

  // 2. Reach (B4, B5), from a pelvis near the previous stance's.
  let style: MoveStyle = 'static';
  if (going.length) {
    const prevStance = cachedSolve(cache, before, opts);
    const around = prevStance.joints
      ? { pelvis: prevStance.joints.pelvis, radius: HIP_SHIFT * ctx.height }
      : null;
    const r = cachedReach(cache, kept, pick(contacts, going), opts, around);
    v.reach = Object.fromEntries(going.map((l) => [l, r.ratios[l] ?? Infinity]));
    let worst: Limb | null = null;
    for (const l of going) {
      const s = styleFor(l, v.reach[l]!, ctx.rules.dynamic);
      if (s === 'fall') {
        if (!worst || v.reach[l]! > v.reach[worst]!) worst = l;
      } else if (s === 'deadpoint') style = 'deadpoint';
    }
    if (worst) {
      v.fail = {
        kind: 'reach',
        limb: worst,
        diagnosis: null,
        text: r.high.includes(worst)
          ? tooHigh(worst)
          : r.cramped.includes(worst)
            ? tooCramped(worst)
            : tooFar(worst, before[worst], contacts[worst]),
      };
      return done();
    }
  }
  v.style = style;

  // 3. Pivot (B7): the kept contacts alone, at their previous points.
  if (!pivot.feasible) {
    const handKept = keptLimbs.some(isHand);
    const footKept = keptLimbs.some((l) => !isHand(l));
    const allHandsToHolds = move.limbs.every((l) => isHand(l) && next[l] !== null);
    if (ctx.rules.dynamic && allHandsToHolds && handKept) {
      v.style = 'deadpoint';
    } else {
      const text = !footKept
        ? TEXT.cutLoose
        : !handKept
          ? TEXT.oneHand
          : whileMoving(move.limbs, pivot.diagnosis?.text ?? '');
      v.fail = { kind: 'pivot', diagnosis: pivot.diagnosis, text };
      return done();
    }
  }

  // 4. New stance (B8) and 5. top (B10), in result().
  return done();
}
